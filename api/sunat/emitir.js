const { requireAuth, readJsonBody, sbRest, sendJson } = require('./_auth');
const nubefact = require('./_providers/nubefact');

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function r6(n) {
  return Math.round((Number(n) || 0) * 1e6) / 1e6;
}

function norm(s) {
  return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function todayPeru() {
  const now = new Date(Date.now() - 5 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

function pad8(n) {
  return String(n).padStart(8, '0');
}

async function syncToFinanzasAndCobranzas(jwt, userId, record) {
  const synced = { ventas: false, cobranzas: false };
  if (record.tipo === '09') return synced; // Las GRE no son ventas ni cobranzas

  // 1. Sincronizar en Finanzas (pasega_docs -> collection 'ventas')
  const tipoFin = record.tipo === '07' ? 'NC' : record.tipo === '03' ? 'BOLETA' : 'FACTURA';
  const ventaDoc = {
    doc: record.doc_codigo,
    tipo: tipoFin,
    fecha: record.fecha_emision,
    cliente: norm(record.cliente_nombre),
    ruc: record.cliente_doc || '',
    vendedor: norm(record.vendedor || 'SIN VENDEDOR'),
    moneda: record.moneda,
    subtotal: r2(record.subtotal),
    igv: r2(record.igv),
    total: r2(record.total),
    ref: record.ref_doc || '',
    items: (record.items || []).map((it) => ({
      codigo: norm(it.codigo),
      cant: Number(it.cant),
      unidad: norm(it.unidad || 'UND'),
      descripcion: norm(it.descripcion),
      vu: Number(it.vu),
      vv: r2(it.vv)
    })),
    suma: r2(record.subtotal),
    cuadra: true,
    avisos: [],
    archivo: record.modo === 'produccion' ? 'SUNAT' : 'SUNAT-DEMO',
    cargado: new Date().toISOString(),
    origen: 'sunat',
    modo: record.modo,
    pdf_url: record.pdf_url || '',
    xml_url: record.xml_url || '',
    cdr_url: record.cdr_url || ''
  };

  await sbRest(jwt, '/pasega_docs?on_conflict=collection,doc_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: {
      collection: 'ventas',
      doc_id: record.doc_codigo,
      data: ventaDoc,
      updated_at: new Date().toISOString(),
      updated_by: userId
    }
  });
  synced.ventas = true;

  // 2. Si es Factura/Boleta al CRÉDITO -> agregar automáticamente a Cobranzas (cobranza/reporte)
  if ((record.tipo === '01' || record.tipo === '03') && record.forma_pago === 'CREDITO') {
    const repRows = await sbRest(
      jwt,
      '/pasega_docs?select=data&collection=eq.cobranza&doc_id=eq.reporte'
    );
    const existing = (Array.isArray(repRows) && repRows[0] && repRows[0].data) || {
      fechaReporte: record.fecha_emision,
      cargadoEn: new Date().toISOString(),
      archivo: 'Facturación SUNAT',
      totalReporte: null,
      suma: 0,
      cuadra: true,
      filas: []
    };
    const filas = Array.isArray(existing.filas) ? existing.filas.filter((f) => f && f.doc !== record.doc_codigo) : [];
    const monCob = record.moneda === 'USD' ? 'US$' : 'S/';
    const vcto =
      record.fecha_vcto ||
      (Array.isArray(record.cuotas) && record.cuotas[0] && record.cuotas[0].fecha) ||
      record.fecha_emision;

    filas.push({
      cliente: norm(record.cliente_nombre),
      tel: record.cliente_telefono || '',
      doc: record.doc_codigo,
      fecha: record.fecha_emision,
      vcto,
      vendedor: norm(record.vendedor || '—'),
      cond: 'CREDITO',
      moneda: monCob,
      total: r2(record.total),
      abono: 0,
      saldo: r2(record.total),
      origen: 'sunat'
    });

    const sumaUsd = r2(filas.filter((f) => f.moneda === 'US$').reduce((a, f) => a + (Number(f.saldo) || 0), 0));
    const nextRep = {
      ...existing,
      fechaReporte: existing.fechaReporte && existing.fechaReporte > record.fecha_emision
        ? existing.fechaReporte
        : record.fecha_emision,
      cargadoEn: new Date().toISOString(),
      suma: sumaUsd,
      filas
    };

    await sbRest(jwt, '/pasega_docs?on_conflict=collection,doc_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: {
        collection: 'cobranza',
        doc_id: 'reporte',
        data: nextRep,
        updated_at: new Date().toISOString(),
        updated_by: userId
      }
    });
    synced.cobranzas = true;
  }

  return synced;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método no permitido' });
  const auth = await requireAuth(req, res, { requireWrite: true });
  if (!auth) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }

  const tipo = String(body.tipo || '01');
  if (!['01', '03', '07', '09'].includes(tipo)) {
    return sendJson(res, 400, { error: 'Tipo de comprobante inválido (usa 01, 03, 07 o 09).' });
  }

  const serie = norm(body.serie);
  if (!/^[A-Z0-9]{4}$/.test(serie)) {
    return sendJson(res, 400, { error: 'La serie debe tener 4 caracteres (ej. F002, B002, FC02, T002).' });
  }

  const clienteTipoDoc = String(body.cliente_tipo_doc || (tipo === '01' ? '6' : '1'));
  const clienteDoc = String(body.cliente_doc || '').replace(/\D/g, '');
  const clienteNombre = norm(body.cliente_nombre);

  if (!clienteNombre) {
    return sendJson(res, 400, { error: 'Ingresa la razón social o nombre del cliente.' });
  }
  if (tipo === '01' && (clienteTipoDoc !== '6' || clienteDoc.length !== 11)) {
    return sendJson(res, 400, { error: 'Para emitir una Factura (01), el cliente debe tener un RUC válido de 11 dígitos.' });
  }
  if (tipo === '07' && !String(body.ref_doc || '').trim()) {
    return sendJson(res, 400, { error: 'Para emitir una Nota de Crédito (07), indica el comprobante de referencia.' });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) {
    return sendJson(res, 400, { error: 'Agrega al menos un producto o servicio.' });
  }

  // Leer configuración fiscal de PASEGA
  let config = { ruc: '', razon_social: 'PASEGA IMPORTACIONES S.A.C.', igv_pct: 18, modo: 'demo' };
  try {
    const cfgRows = await sbRest(auth.jwt, '/sunat_config?select=*&id=eq.1');
    if (Array.isArray(cfgRows) && cfgRows[0]) config = cfgRows[0];
  } catch (e) {
    return sendJson(res, 500, {
      error: 'Falta ejecutar supabase/sunat_schema.sql en tu Supabase SQL Editor (' + e.message + ')'
    });
  }

  const igvPct = Number(config.igv_pct || 18);
  const igvFactor = 1 + igvPct / 100;
  const precioIncluyeIgv = Boolean(body.precio_incluye_igv);

  // Calcular líneas con precisión según "Sin IGV" o "Con IGV incluido"
  const items = [];
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    const desc = norm(it.descripcion);
    const cant = Number(it.cant);
    const precioInput = Number(it.precio);
    if (!desc) return sendJson(res, 400, { error: `La línea ${i + 1} no tiene descripción.` });
    if (!(cant > 0)) return sendJson(res, 400, { error: `La cantidad de la línea ${i + 1} debe ser mayor a 0.` });
    if (tipo !== '09' && !(precioInput > 0)) {
      return sendJson(res, 400, { error: `El precio de la línea ${i + 1} debe ser mayor a 0.` });
    }

    let vu = 0;
    let pu = 0;
    let vv = 0;
    let igvLinea = 0;
    let totalLinea = 0;

    if (tipo !== '09') {
      if (precioIncluyeIgv) {
        pu = r6(precioInput);
        vu = r6(pu / igvFactor);
        totalLinea = r2(cant * pu);
        vv = r2(totalLinea / igvFactor);
        igvLinea = r2(totalLinea - vv);
      } else {
        vu = r6(precioInput);
        pu = r6(vu * igvFactor);
        vv = r2(cant * vu);
        igvLinea = r2(vv * (igvPct / 100));
        totalLinea = r2(vv + igvLinea);
      }
    }

    items.push({
      codigo: norm(it.codigo),
      descripcion: desc,
      unidad: norm(it.unidad || 'UND'),
      unidad_sunat: String(it.unidad_sunat || 'NIU').toUpperCase(),
      cant,
      vu,
      pu,
      vv,
      igv_linea: igvLinea,
      total_linea: totalLinea
    });
  }

  const subtotal = r2(items.reduce((a, x) => a + x.vv, 0));
  const igv = r2(items.reduce((a, x) => a + x.igv_linea, 0));
  const total = r2(subtotal + igv);

  const fechaEmision = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha_emision || ''))
    ? String(body.fecha_emision)
    : todayPeru();
  const formaPago = body.forma_pago === 'CREDITO' ? 'CREDITO' : 'CONTADO';
  let cuotas = Array.isArray(body.cuotas) ? body.cuotas : [];
  let fechaVcto = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha_vcto || '')) ? String(body.fecha_vcto) : null;

  if ((tipo === '01' || tipo === '03') && formaPago === 'CREDITO') {
    if (!cuotas.length) {
      if (!fechaVcto) {
        return sendJson(res, 400, { error: 'Para ventas al crédito indica la fecha de vencimiento.' });
      }
      cuotas = [{ fecha: fechaVcto, importe: total }];
    } else if (!fechaVcto) {
      fechaVcto = cuotas[0].fecha || null;
    }
  }

  // Validar GRE
  let greDatos = null;
  if (tipo === '09') {
    const g = body.gre_datos || {};
    if (!String(g.partida_direccion || '').trim() || !String(g.llegada_direccion || '').trim()) {
      return sendJson(res, 400, { error: 'Para una Guía de Remisión (GRE) indica dirección de partida y llegada.' });
    }
    greDatos = {
      motivo: String(g.motivo || '01'),
      fecha_traslado: /^\d{4}-\d{2}-\d{2}$/.test(String(g.fecha_traslado || '')) ? g.fecha_traslado : fechaEmision,
      peso_bruto: Number(g.peso_bruto || 1),
      unidad_peso: String(g.unidad_peso || 'KGM'),
      bultos: parseInt(g.bultos || '1', 10) || 1,
      modalidad: String(g.modalidad || '02'),
      partida_ubigeo: String(g.partida_ubigeo || config.ubigeo || '150101').replace(/\D/g, '').slice(0, 6) || '150101',
      partida_direccion: norm(g.partida_direccion),
      llegada_ubigeo: String(g.llegada_ubigeo || '150101').replace(/\D/g, '').slice(0, 6) || '150101',
      llegada_direccion: norm(g.llegada_direccion),
      placa: norm(g.placa),
      conductor_dni: String(g.conductor_dni || '').replace(/\D/g, ''),
      conductor_nombre: norm(g.conductor_nombre),
      conductor_apellidos: norm(g.conductor_apellidos),
      conductor_licencia: norm(g.conductor_licencia),
      transportista_ruc: String(g.transportista_ruc || '').replace(/\D/g, ''),
      transportista_nombre: norm(g.transportista_nombre)
    };
  }

  // Reservar correlativo atómico en PostgreSQL
  let numero;
  try {
    numero = await sbRest(auth.jwt, '/rpc/sunat_next_correlativo', {
      method: 'POST',
      body: { p_tipo: tipo, p_serie: serie }
    });
  } catch (e) {
    return sendJson(res, 400, { error: 'No se pudo asignar correlativo: ' + e.message });
  }

  const docCodigo = `${serie}-${pad8(numero)}`;
  const docParaProveedor = {
    tipo,
    serie,
    numero,
    doc_codigo: docCodigo,
    fecha_emision: fechaEmision,
    fecha_vcto: fechaVcto,
    cliente_tipo_doc: clienteTipoDoc,
    cliente_doc: clienteDoc,
    cliente_nombre: clienteNombre,
    cliente_direccion: norm(body.cliente_direccion),
    cliente_telefono: String(body.cliente_telefono || '').trim(),
    cliente_email: String(body.cliente_email || '').trim(),
    vendedor: norm(body.vendedor),
    moneda: body.moneda === 'PEN' ? 'PEN' : 'USD',
    tipo_cambio: Number(body.tipo_cambio || 3.7),
    igv_pct: igvPct,
    precio_incluye_igv: precioIncluyeIgv,
    forma_pago: formaPago,
    cuotas,
    subtotal,
    igv,
    total,
    items,
    ref_doc: norm(body.ref_doc),
    ref_tipo: String(body.ref_tipo || ''),
    motivo_nc: String(body.motivo_nc || ''),
    gre_datos: greDatos,
    observaciones: String(body.observaciones || '').trim()
  };

  // Enviar a Nubefact (o Simulador Demo si modo !== 'produccion' o no hay tokens)
  let provRes;
  try {
    provRes = await nubefact.emitir(docParaProveedor, config);
  } catch (e) {
    // Guardar intento rechazado para trazabilidad del correlativo
    try {
      await sbRest(auth.jwt, '/sunat_comprobantes', {
        method: 'POST',
        body: {
          ...docParaProveedor,
          igv_pct: undefined,
          modo: config.modo === 'produccion' ? 'produccion' : 'demo',
          estado: 'rechazado',
          sunat_mensaje: e.message,
          sunat_respuesta: e.providerResponse || { error: e.message },
          created_by: auth.user.id
        }
      });
    } catch {}
    return sendJson(res, 502, {
      error: `SUNAT/Nubefact rechazó ${docCodigo}: ${e.message}`,
      doc_codigo: docCodigo
    });
  }

  // Guardar comprobante emitido en public.sunat_comprobantes
  const quiereSincronizar = body.sincronizar !== false;
  const recordToSave = {
    tipo,
    serie,
    numero,
    doc_codigo: docCodigo,
    modo: provRes.modo,
    estado: provRes.estado,
    fecha_emision: fechaEmision,
    fecha_vcto: fechaVcto,
    cliente_tipo_doc: clienteTipoDoc,
    cliente_doc: clienteDoc,
    cliente_nombre: clienteNombre,
    cliente_direccion: docParaProveedor.cliente_direccion,
    cliente_telefono: docParaProveedor.cliente_telefono,
    cliente_email: docParaProveedor.cliente_email,
    vendedor: docParaProveedor.vendedor,
    moneda: docParaProveedor.moneda,
    tipo_cambio: docParaProveedor.tipo_cambio,
    precio_incluye_igv: precioIncluyeIgv,
    forma_pago: formaPago,
    cuotas,
    subtotal,
    igv,
    total,
    items,
    ref_doc: docParaProveedor.ref_doc,
    ref_tipo: docParaProveedor.ref_tipo,
    motivo_nc: docParaProveedor.motivo_nc,
    gre_datos: greDatos,
    observaciones: docParaProveedor.observaciones,
    pdf_url: provRes.pdf_url,
    xml_url: provRes.xml_url,
    cdr_url: provRes.cdr_url,
    hash: provRes.hash,
    cadena_qr: provRes.cadena_qr,
    sunat_mensaje: provRes.mensaje,
    sunat_respuesta: provRes.raw,
    sincronizado: quiereSincronizar && tipo !== '09',
    created_by: auth.user.id
  };

  let savedRows;
  try {
    savedRows = await sbRest(auth.jwt, '/sunat_comprobantes', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: recordToSave
    });
  } catch (e) {
    return sendJson(res, 500, { error: 'Emitido pero no se pudo guardar en BD: ' + e.message, doc_codigo: docCodigo });
  }

  // Guardar / actualizar cliente en directorio sunat_clientes
  if (clienteDoc) {
    try {
      await sbRest(auth.jwt, '/sunat_clientes?on_conflict=tipo_doc,numero_doc', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: {
          tipo_doc: clienteTipoDoc,
          numero_doc: clienteDoc,
          razon_social: clienteNombre,
          direccion: docParaProveedor.cliente_direccion,
          telefono: docParaProveedor.cliente_telefono,
          email: docParaProveedor.cliente_email,
          updated_at: new Date().toISOString()
        }
      });
    } catch {}
  }

  // Sincronizar con Finanzas (ventas) y Cobranzas (si es al crédito)
  let synced = { ventas: false, cobranzas: false };
  if (quiereSincronizar && tipo !== '09') {
    try {
      synced = await syncToFinanzasAndCobranzas(auth.jwt, auth.user.id, recordToSave);
    } catch (e) {
      synced.error = e.message;
    }
  }

  const saved = Array.isArray(savedRows) ? savedRows[0] : recordToSave;
  return sendJson(res, 200, {
    ok: true,
    comprobante: saved,
    synced
  });
};
