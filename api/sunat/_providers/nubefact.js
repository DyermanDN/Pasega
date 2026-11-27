const crypto = require('crypto');

function getNubefactEnv() {
  const url = (process.env.NUBEFACT_URL || '').trim();
  const token = (process.env.NUBEFACT_TOKEN || '').trim();
  return { url, token, configured: Boolean(url && token) };
}

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isoToDmyDash(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

// Códigos de tipo de comprobante en Nubefact
function nubefactTipoComprobante(tipo) {
  if (tipo === '01') return 1; // Factura
  if (tipo === '03') return 2; // Boleta
  if (tipo === '07') return 3; // Nota de Crédito
  if (tipo === '09') return 7; // Guía de Remisión Remitente
  return 1;
}

// Códigos de tipo de documento del cliente en Nubefact
function nubefactTipoDoc(tipoDoc) {
  const t = String(tipoDoc || '6');
  if (t === '6') return '6'; // RUC
  if (t === '1') return '1'; // DNI
  if (t === '4') return '4'; // Carnet de extranjería
  if (t === '7') return '7'; // Pasaporte
  return '-'; // Varios / sin documento
}

function buildDemoResult(payload, config) {
  const seed = `${config.ruc || '20000000001'}|${payload.tipo}|${payload.serie}|${payload.numero}|${payload.total}|${payload.fecha_emision}`;
  const hash = crypto.createHash('sha256').update(seed).digest('base64').slice(0, 28);
  const qr = [
    config.ruc || '20000000001',
    payload.tipo,
    payload.serie,
    payload.numero,
    r2(payload.igv).toFixed(2),
    r2(payload.total).toFixed(2),
    payload.fecha_emision,
    payload.cliente_tipo_doc || '6',
    payload.cliente_doc || '',
    hash,
    ''
  ].join('|');

  return {
    modo: 'demo',
    estado: 'demo',
    aceptado: true,
    hash,
    cadena_qr: qr,
    pdf_url: '',
    xml_url: '',
    cdr_url: '',
    mensaje: 'Comprobante generado en MODO DEMO (no enviado a SUNAT real). Configura NUBEFACT_URL y NUBEFACT_TOKEN en Vercel para emitir ante SUNAT.',
    raw: {
      demo: true,
      aceptada_por_sunat: true,
      sunat_description: 'Simulación local aprobada (MODO DEMO)',
      codigo_hash: hash,
      cadena_para_codigo_qr: qr
    }
  };
}

function buildNubefactComprobantePayload(doc) {
  const isUsd = doc.moneda === 'USD';
  const igvPct = Number(doc.igv_pct || 18);
  const body = {
    operacion: 'generar_comprobante',
    tipo_de_comprobante: nubefactTipoComprobante(doc.tipo),
    serie: doc.serie,
    numero: doc.numero,
    sunat_transaction: 1,
    cliente_tipo_de_documento: nubefactTipoDoc(doc.cliente_tipo_doc),
    cliente_numero_de_documento: doc.cliente_doc || '-',
    cliente_denominacion: doc.cliente_nombre,
    cliente_direccion: doc.cliente_direccion || '',
    cliente_email: doc.cliente_email || '',
    fecha_de_emision: isoToDmyDash(doc.fecha_emision),
    fecha_de_vencimiento: doc.fecha_vcto ? isoToDmyDash(doc.fecha_vcto) : '',
    moneda: isUsd ? 2 : 1,
    tipo_de_cambio: isUsd ? Number(doc.tipo_cambio || 3.7) : '',
    porcentaje_de_igv: igvPct,
    total_gravada: r2(doc.subtotal),
    total_igv: r2(doc.igv),
    total: r2(doc.total),
    observaciones: doc.observaciones || '',
    enviar_automaticamente_a_la_sunat: true,
    enviar_automaticamente_al_cliente: Boolean(doc.cliente_email),
    condiciones_de_pago: doc.forma_pago === 'CREDITO' ? 'CREDITO' : 'CONTADO',
    medio_de_pago: doc.forma_pago === 'CREDITO' ? 'credito' : '',
    items: (doc.items || []).map((it) => ({
      unidad_de_medida: it.unidad_sunat || 'NIU',
      codigo: it.codigo || '',
      descripcion: it.descripcion,
      cantidad: Number(it.cant),
      valor_unitario: Number(it.vu),
      precio_unitario: Number(it.pu),
      subtotal: r2(it.vv),
      tipo_de_igv: 1, // Gravado - Operación Onerosa
      igv: r2(it.igv_linea),
      total: r2(it.total_linea),
      anticipo_regularizacion: false
    }))
  };

  if (doc.forma_pago === 'CREDITO' && Array.isArray(doc.cuotas) && doc.cuotas.length) {
    body.venta_al_credito = doc.cuotas.map((c, idx) => ({
      cuota: idx + 1,
      fecha_de_pago: isoToDmyDash(c.fecha),
      importe: r2(c.importe)
    }));
  }

  if (doc.tipo === '07' && doc.ref_doc) {
    const [refSerie, refNumRaw] = String(doc.ref_doc).split('-');
    body.documento_que_se_modifica_tipo = doc.ref_tipo === '03' ? 2 : 1;
    body.documento_que_se_modifica_serie = refSerie || '';
    body.documento_que_se_modifica_numero = parseInt(refNumRaw || '0', 10) || 0;
    body.tipo_de_nota_de_credito = parseInt(doc.motivo_nc || '1', 10) || 1;
  }

  return body;
}

function buildNubefactGuiaPayload(doc) {
  const g = doc.gre_datos || {};
  const privado = (g.modalidad || '02') === '02';
  const body = {
    operacion: 'generar_guia',
    tipo_de_comprobante: 7, // GRE Remitente en Nubefact
    serie: doc.serie,
    numero: doc.numero,
    cliente_tipo_de_documento: nubefactTipoDoc(doc.cliente_tipo_doc),
    cliente_numero_de_documento: doc.cliente_doc,
    cliente_denominacion: doc.cliente_nombre,
    cliente_direccion: doc.cliente_direccion || '',
    cliente_email: doc.cliente_email || '',
    fecha_de_emision: isoToDmyDash(doc.fecha_emision),
    observaciones: doc.observaciones || '',
    motivo_de_traslado: g.motivo || '01',
    peso_bruto_total: Number(g.peso_bruto || 1),
    peso_bruto_unidad_de_medida: g.unidad_peso || 'KGM',
    numero_de_bultos: parseInt(g.bultos || '1', 10) || 1,
    tipo_de_transporte: privado ? '02' : '01',
    fecha_de_inicio_de_traslado: isoToDmyDash(g.fecha_traslado || doc.fecha_emision),
    punto_de_partida_ubigeo: g.partida_ubigeo || '150101',
    punto_de_partida_direccion: g.partida_direccion || '',
    punto_de_llegada_ubigeo: g.llegada_ubigeo || '150101',
    punto_de_llegada_direccion: g.llegada_direccion || doc.cliente_direccion || '',
    enviar_automaticamente_al_cliente: Boolean(doc.cliente_email),
    items: (doc.items || []).map((it) => ({
      unidad_de_medida: it.unidad_sunat || 'NIU',
      codigo: it.codigo || '',
      descripcion: it.descripcion,
      cantidad: Number(it.cant)
    }))
  };

  if (privado) {
    body.transportista_placa_numero = g.placa || '';
    body.conductor_documento_tipo = '1';
    body.conductor_documento_numero = g.conductor_dni || '';
    body.conductor_nombre = g.conductor_nombre || '';
    body.conductor_apellidos = g.conductor_apellidos || '';
    body.conductor_numero_licencia = g.conductor_licencia || '';
  } else {
    body.transportista_documento_tipo = '6';
    body.transportista_documento_numero = g.transportista_ruc || '';
    body.transportista_denominacion = g.transportista_nombre || '';
    body.transportista_placa_numero = g.placa || '';
  }

  return body;
}

async function callNubefact(body) {
  const { url, token } = getNubefactEnv();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || (json && json.errors)) {
    const errMsg = (json && (json.errors || json.mensaje)) || `Error Nubefact HTTP ${res.status}`;
    const err = new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
    err.status = res.status;
    err.providerResponse = json;
    throw err;
  }
  return json;
}

async function emitir(doc, config) {
  const env = getNubefactEnv();
  const useProd = config && config.modo === 'produccion' && env.configured;
  if (!useProd) {
    return buildDemoResult(doc, config || {});
  }

  const body = doc.tipo === '09'
    ? buildNubefactGuiaPayload(doc)
    : buildNubefactComprobantePayload(doc);

  const json = await callNubefact(body);
  return {
    modo: 'produccion',
    estado: json.aceptada_por_sunat === false ? 'pendiente' : 'aceptado',
    aceptado: json.aceptada_por_sunat !== false,
    hash: json.codigo_hash || '',
    cadena_qr: json.cadena_para_codigo_qr || '',
    pdf_url: json.enlace_del_pdf || json.enlace || '',
    xml_url: json.enlace_del_xml || '',
    cdr_url: json.enlace_del_cdr || '',
    mensaje: json.sunat_description || 'Enviado correctamente a Nubefact / SUNAT.',
    raw: json
  };
}

async function anular(doc, motivo) {
  const env = getNubefactEnv();
  if (doc.modo !== 'produccion' || !env.configured) {
    return {
      ok: true,
      mensaje: 'Comprobante anulado en MODO DEMO.',
      raw: { demo: true, anulado: true, motivo }
    };
  }

  const body = {
    operacion: 'generar_anulacion',
    tipo_de_comprobante: nubefactTipoComprobante(doc.tipo),
    serie: doc.serie,
    numero: doc.numero,
    motivo: motivo || 'ERROR EN EMISION'
  };
  const json = await callNubefact(body);
  return {
    ok: true,
    mensaje: json.sunat_description || 'Comunicación de baja enviada a SUNAT.',
    raw: json
  };
}

module.exports = {
  getNubefactEnv,
  emitir,
  anular
};
