(function () {
  'use strict';

  const TIPOS = {
    '01': { nombre: 'Factura Electrónica', corto: 'Factura', badge: 'good' },
    '03': { nombre: 'Boleta de Venta Electrónica', corto: 'Boleta', badge: 'neutral' },
    '07': { nombre: 'Nota de Crédito Electrónica', corto: 'Nota de Crédito', badge: 'warn' },
    '09': { nombre: 'Guía de Remisión Electrónica (GRE)', corto: 'Guía (GRE)', badge: 'neutral' }
  };

  const MOTIVOS_NC = [
    ['01', '01 · Anulación de la operación'],
    ['02', '02 · Anulación por error en el RUC'],
    ['03', '03 · Corrección por error en la descripción'],
    ['04', '04 · Descuento global'],
    ['06', '06 · Devolución total'],
    ['07', '07 · Devolución por ítem'],
    ['09', '09 · Disminución en el valor']
  ];

  const MOTIVOS_GRE = [
    ['01', '01 · Venta'],
    ['02', '02 · Compra'],
    ['04', '04 · Traslado entre establecimientos de la misma empresa'],
    ['08', '08 · Importación'],
    ['13', '13 · Otros']
  ];

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const fmt = (n, d = 2) =>
    Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pad2 = (n) => String(n).padStart(2, '0');
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };
  const addDaysIso = (iso, days) => {
    const [y, m, d] = (iso || todayIso()).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
  };
  const dmy = (iso) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

  const ST = {
    visible: false,
    loaded: false,
    schemaMissing: false,
    tab: 'emitir', // emitir | nc | gre | historial | config
    status: { nubefactConfigured: false, rucApiConfigured: false, role: 'editor' },
    config: {
      ruc: '',
      razon_social: 'PASEGA IMPORTACIONES S.A.C.',
      nombre_comercial: 'PASEGA',
      direccion: '',
      ubigeo: '150101',
      igv_pct: 18,
      modo: 'demo'
    },
    series: [
      { tipo: '01', serie: 'F002', descripcion: 'Facturas electrónicas', ultimo_numero: 0, activa: true },
      { tipo: '03', serie: 'B002', descripcion: 'Boletas de venta', ultimo_numero: 0, activa: true },
      { tipo: '07', serie: 'FC02', descripcion: 'NC Facturas', ultimo_numero: 0, activa: true },
      { tipo: '07', serie: 'BC02', descripcion: 'NC Boletas', ultimo_numero: 0, activa: true },
      { tipo: '09', serie: 'T002', descripcion: 'Guías de remisión', ultimo_numero: 0, activa: true }
    ],
    clientes: [],
    comprobantes: [],
    lastResult: null,
    msg: '',
    busy: false,
    catQuery: '',
    histFilter: { tipo: '', q: '' },
    form: null,
    ncForm: null,
    greForm: null
  };

  function defaultTc() {
    const ctx = window.PASEGA_CTX && window.PASEGA_CTX.getInfo ? window.PASEGA_CTX.getInfo() : null;
    return (ctx && ctx.tc) || 3.7;
  }

  function seriesByTipo(tipo) {
    return ST.series.filter((s) => s.tipo === tipo && s.activa);
  }

  function newEmitForm(tipo = '01') {
    const sers = seriesByTipo(tipo);
    return {
      tipo,
      serie: (sers[0] && sers[0].serie) || (tipo === '03' ? 'B002' : 'F002'),
      fecha_emision: todayIso(),
      moneda: 'USD',
      tipo_cambio: defaultTc(),
      precio_incluye_igv: false,
      vendedor: '',
      forma_pago: 'CONTADO',
      fecha_vcto: addDaysIso(todayIso(), 30),
      cliente_tipo_doc: tipo === '01' ? '6' : '1',
      cliente_doc: '',
      cliente_nombre: '',
      cliente_direccion: '',
      cliente_telefono: '',
      cliente_email: '',
      cliente_sunat_info: '',
      observaciones: '',
      sincronizar: true,
      items: [{ codigo: '', descripcion: '', unidad: 'UND', cant: 1, precio: '' }]
    };
  }

  function newNcForm(refDocObj) {
    const refTipo = refDocObj ? refDocObj.tipo : '01';
    const pref = refTipo === '03' ? 'BC' : 'FC';
    const sers = seriesByTipo('07');
    const chosen = sers.find((s) => s.serie.startsWith(pref)) || sers[0];
    return {
      ref_id: refDocObj ? refDocObj.id : '',
      ref_doc: refDocObj ? refDocObj.doc_codigo : '',
      ref_tipo: refTipo,
      serie: (chosen && chosen.serie) || (refTipo === '03' ? 'BC02' : 'FC02'),
      motivo_nc: '01',
      fecha_emision: todayIso(),
      moneda: refDocObj ? refDocObj.moneda : 'USD',
      tipo_cambio: refDocObj ? refDocObj.tipo_cambio : defaultTc(),
      precio_incluye_igv: false,
      vendedor: refDocObj ? refDocObj.vendedor : '',
      cliente_tipo_doc: refDocObj ? refDocObj.cliente_tipo_doc : '6',
      cliente_doc: refDocObj ? refDocObj.cliente_doc : '',
      cliente_nombre: refDocObj ? refDocObj.cliente_nombre : '',
      cliente_direccion: refDocObj ? refDocObj.cliente_direccion : '',
      cliente_telefono: refDocObj ? refDocObj.cliente_telefono : '',
      cliente_email: refDocObj ? refDocObj.cliente_email : '',
      observaciones: '',
      sincronizar: true,
      items: refDocObj && Array.isArray(refDocObj.items) && refDocObj.items.length
        ? refDocObj.items.map((it) => ({
            codigo: it.codigo || '',
            descripcion: it.descripcion || '',
            unidad: it.unidad || 'UND',
            cant: Number(it.cant) || 1,
            precio: Number(it.vu) || 0
          }))
        : [{ codigo: '', descripcion: '', unidad: 'UND', cant: 1, precio: '' }]
    };
  }

  function newGreForm(refDocObj) {
    const sers = seriesByTipo('09');
    return {
      ref_doc: refDocObj ? refDocObj.doc_codigo : '',
      serie: (sers[0] && sers[0].serie) || 'T002',
      fecha_emision: todayIso(),
      cliente_tipo_doc: refDocObj ? refDocObj.cliente_tipo_doc : '6',
      cliente_doc: refDocObj ? refDocObj.cliente_doc : '',
      cliente_nombre: refDocObj ? refDocObj.cliente_nombre : '',
      cliente_direccion: refDocObj ? refDocObj.cliente_direccion : '',
      cliente_email: refDocObj ? refDocObj.cliente_email : '',
      observaciones: refDocObj ? `Ref. ${refDocObj.doc_codigo}` : '',
      gre_datos: {
        motivo: '01',
        fecha_traslado: todayIso(),
        peso_bruto: 10,
        unidad_peso: 'KGM',
        bultos: 1,
        modalidad: '02',
        partida_ubigeo: ST.config.ubigeo || '150101',
        partida_direccion: ST.config.direccion || '',
        llegada_ubigeo: '150101',
        llegada_direccion: refDocObj ? refDocObj.cliente_direccion || '' : '',
        placa: '',
        conductor_dni: '',
        conductor_nombre: '',
        conductor_apellidos: '',
        conductor_licencia: '',
        transportista_ruc: '',
        transportista_nombre: ''
      },
      items: refDocObj && Array.isArray(refDocObj.items) && refDocObj.items.length
        ? refDocObj.items.map((it) => ({
            codigo: it.codigo || '',
            descripcion: it.descripcion || '',
            unidad: it.unidad || 'UND',
            cant: Number(it.cant) || 1
          }))
        : [{ codigo: '', descripcion: '', unidad: 'UND', cant: 1 }]
    };
  }

  function calcTotals(items, incluyeIgv) {
    const igvPct = Number(ST.config.igv_pct || 18);
    const factor = 1 + igvPct / 100;
    let sub = 0;
    let igv = 0;
    const lines = (items || []).map((it) => {
      const c = Number(it.cant) || 0;
      const p = Number(it.precio) || 0;
      let vv = 0;
      let igvL = 0;
      let tot = 0;
      if (c > 0 && p > 0) {
        if (incluyeIgv) {
          tot = r2(c * p);
          vv = r2(tot / factor);
          igvL = r2(tot - vv);
        } else {
          vv = r2(c * p);
          igvL = r2(vv * (igvPct / 100));
          tot = r2(vv + igvL);
        }
      }
      sub += vv;
      igv += igvL;
      return { vv, igvL, tot };
    });
    return { sub: r2(sub), igv: r2(igv), tot: r2(sub + igv), lines };
  }

  async function apiCall(path, opts = {}) {
    const token = window.PASEGA_AUTH ? await window.PASEGA_AUTH.getAccessToken() : null;
    if (!token) throw new Error('Inicia sesión para usar Facturación SUNAT.');
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = { error: text }; }
    if (!res.ok) throw new Error((json && json.error) || `Error HTTP ${res.status}`);
    return json;
  }

  async function loadAll() {
    if (!window.PASEGA_AUTH) return;
    try {
      const ctx = await window.PASEGA_AUTH.ready();
      const client = ctx && ctx.client;
      if (!client) {
        ST.loaded = true;
        render();
        return;
      }

      try {
        ST.status = await apiCall('/api/sunat/status');
      } catch {}

      const [cfgRes, serRes, cliRes, compRes] = await Promise.all([
        client.from('sunat_config').select('*').eq('id', 1).maybeSingle(),
        client.from('sunat_series').select('*').order('tipo').order('serie'),
        client.from('sunat_clientes').select('*').order('updated_at', { ascending: false }).limit(250),
        client.from('sunat_comprobantes').select('*').order('created_at', { ascending: false }).limit(200)
      ]);

      const err = cfgRes.error || serRes.error || cliRes.error || compRes.error;
      if (err && (err.code === '42P01' || err.code === 'PGRST205' || /sunat_/i.test(err.message || ''))) {
        ST.schemaMissing = true;
        ST.loaded = true;
        render();
        return;
      }

      ST.schemaMissing = false;
      if (cfgRes.data) ST.config = Object.assign(ST.config, cfgRes.data);
      if (Array.isArray(serRes.data) && serRes.data.length) ST.series = serRes.data;
      if (Array.isArray(cliRes.data)) ST.clientes = cliRes.data;
      if (Array.isArray(compRes.data)) ST.comprobantes = compRes.data;
      if (!ST.form) ST.form = newEmitForm('01');
      if (!ST.ncForm) ST.ncForm = newNcForm(null);
      if (!ST.greForm) ST.greForm = newGreForm(null);

      // Suscripción en tiempo real a nuevos comprobantes
      if (!ST._subscribed) {
        ST._subscribed = true;
        client
          .channel('sunat-comprobantes-rt')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'sunat_comprobantes' }, () => {
            refreshComprobantes();
          })
          .subscribe();
      }
    } catch (e) {
      ST.msg = `<div class="callout bad"><div>${esc(e.message || e)}</div></div>`;
    }
    ST.loaded = true;
    render();
  }

  async function refreshComprobantes() {
    const client = window.PASEGA_AUTH && window.PASEGA_AUTH.getClient();
    if (!client) return;
    const [serRes, cliRes, compRes] = await Promise.all([
      client.from('sunat_series').select('*').order('tipo').order('serie'),
      client.from('sunat_clientes').select('*').order('updated_at', { ascending: false }).limit(250),
      client.from('sunat_comprobantes').select('*').order('created_at', { ascending: false }).limit(200)
    ]);
    if (Array.isArray(serRes.data) && serRes.data.length) ST.series = serRes.data;
    if (Array.isArray(cliRes.data)) ST.clientes = cliRes.data;
    if (Array.isArray(compRes.data)) ST.comprobantes = compRes.data;
    render();
  }

  function downloadComprobantePDF(c) {
    if (c.pdf_url) {
      window.open(c.pdf_url, '_blank', 'noopener');
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('No se cargó el generador de PDF (jsPDF). Revisa tu conexión.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const NAVY = [15, 47, 87];
    const ORANGE = [232, 135, 14];
    const isDemo = c.modo !== 'produccion';
    const meta = TIPOS[c.tipo] || TIPOS['01'];
    const sym = c.moneda === 'PEN' ? 'S/' : 'US$';

    // Marca de agua DEMO
    if (isDemo) {
      doc.setTextColor(235, 210, 210);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(46);
      doc.text('DEMO · SIN VALIDEZ SUNAT', 105, 155, { align: 'center', angle: 35 });
    }

    // Cabecera emisor
    doc.setTextColor(...NAVY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(String(ST.config.razon_social || 'PASEGA IMPORTACIONES S.A.C.'), 14, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    if (ST.config.direccion) doc.text(String(ST.config.direccion), 14, 24);
    doc.text(`RUC: ${ST.config.ruc || '(Configurar en Facturación -> Configuración)'}`, 14, 29);

    // Recuadro derecho del comprobante
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.5);
    doc.roundedRect(130, 12, 66, 26, 2, 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...NAVY);
    doc.text(`R.U.C. ${ST.config.ruc || '00000000000'}`, 163, 18.5, { align: 'center' });
    doc.setFontSize(10);
    doc.text(meta.nombre.toUpperCase(), 163, 25, { align: 'center', maxWidth: 62 });
    doc.setFontSize(11.5);
    doc.setTextColor(...ORANGE);
    doc.text(String(c.doc_codigo || ''), 163, 33.5, { align: 'center' });

    // Datos del cliente
    doc.setDrawColor(210, 215, 222);
    doc.line(14, 42, 196, 42);
    doc.setTextColor(30, 35, 42);
    doc.setFontSize(8.8);
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', 14, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(String(c.cliente_nombre || ''), 36, 48, { maxWidth: 100 });
    doc.setFont('helvetica', 'bold');
    doc.text(c.cliente_tipo_doc === '6' ? 'RUC:' : 'Doc:', 14, 54);
    doc.setFont('helvetica', 'normal');
    doc.text(String(c.cliente_doc || '—'), 36, 54);
    doc.setFont('helvetica', 'bold');
    doc.text('Dirección:', 14, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(String(c.cliente_direccion || '—'), 36, 60, { maxWidth: 100 });

    doc.setFont('helvetica', 'bold');
    doc.text('Emisión:', 140, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(dmy(c.fecha_emision), 162, 48);
    if (c.tipo !== '09') {
      doc.setFont('helvetica', 'bold');
      doc.text('Pago:', 140, 54);
      doc.setFont('helvetica', 'normal');
      doc.text(c.forma_pago === 'CREDITO' ? `CRÉDITO (Vcto ${dmy(c.fecha_vcto)})` : 'CONTADO', 162, 54);
      doc.setFont('helvetica', 'bold');
      doc.text('Moneda:', 140, 60);
      doc.setFont('helvetica', 'normal');
      doc.text(c.moneda === 'PEN' ? 'SOLES (S/)' : `DÓLARES (US$) · TC ${c.tipo_cambio || ''}`, 162, 60);
    }

    let startY = 66;
    if (c.tipo === '07' && c.ref_doc) {
      doc.setFont('helvetica', 'bold');
      doc.text(`Documento que modifica: ${c.ref_doc} · Motivo ${c.motivo_nc || ''}`, 14, 66);
      startY = 72;
    } else if (c.tipo === '09' && c.gre_datos) {
      const g = c.gre_datos;
      doc.setFont('helvetica', 'normal');
      doc.text(`Inicio traslado: ${dmy(g.fecha_traslado)} · Peso: ${g.peso_bruto} ${g.unidad_peso || 'KGM'} · Bultos: ${g.bultos}`, 14, 66);
      doc.text(`Partida (${g.partida_ubigeo}): ${g.partida_direccion}`, 14, 71, { maxWidth: 182 });
      doc.text(`Llegada (${g.llegada_ubigeo}): ${g.llegada_direccion}`, 14, 76, { maxWidth: 182 });
      startY = 82;
    }

    // Tabla de ítems
    const head = c.tipo === '09'
      ? [['#', 'Código', 'Descripción', 'Unid.', 'Cantidad']]
      : [['#', 'Código', 'Descripción', 'Cant.', 'V. Unit.', 'Importe']];
    const body = (c.items || []).map((it, idx) =>
      c.tipo === '09'
        ? [idx + 1, it.codigo || '', it.descripcion || '', it.unidad || 'UND', fmt(it.cant, Number.isInteger(Number(it.cant)) ? 0 : 2)]
        : [
            idx + 1,
            it.codigo || '',
            it.descripcion || '',
            { content: fmt(it.cant, Number.isInteger(Number(it.cant)) ? 0 : 2), styles: { halign: 'right' } },
            { content: `${sym} ${fmt(it.vu, 2)}`, styles: { halign: 'right' } },
            { content: `${sym} ${fmt(it.vv, 2)}`, styles: { halign: 'right' } }
          ]
    );

    doc.autoTable({
      head,
      body,
      startY,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 8.5, cellPadding: 2 }
    });

    let y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : startY + 20) + 6;
    if (c.tipo !== '09') {
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Op. Gravada (Subtotal):`, 132, y);
      doc.text(`${sym} ${fmt(c.subtotal)}`, 196, y, { align: 'right' });
      y += 5.5;
      doc.text(`IGV (${ST.config.igv_pct || 18}%):`, 132, y);
      doc.text(`${sym} ${fmt(c.igv)}`, 196, y, { align: 'right' });
      y += 6.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('IMPORTE TOTAL:', 132, y);
      doc.text(`${sym} ${fmt(c.total)}`, 196, y, { align: 'right' });
      y += 10;
    }

    if (c.observaciones) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(`Observaciones: ${c.observaciones}`, 14, y, { maxWidth: 182 });
      y += 7;
    }

    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text(`Hash: ${c.hash || '—'} · Estado: ${String(c.estado || '').toUpperCase()}`, 14, Math.min(280, y + 4));
    if (isDemo) {
      doc.text('Documento de prueba generado en MODO DEMO. No tiene validez tributaria ante SUNAT.', 14, Math.min(285, y + 9));
    }
    doc.save(`${c.doc_codigo || 'comprobante'}.pdf`);
  }

  function waComprobanteUrl(c) {
    const tel = String(c.cliente_telefono || '').replace(/\D/g, '');
    const num = tel.length === 9 ? '51' + tel : tel;
    const sym = c.moneda === 'PEN' ? 'S/' : 'US$';
    const meta = TIPOS[c.tipo] || TIPOS['01'];
    const msg = [
      `Hola ${c.cliente_nombre},`,
      `Compartimos su ${meta.nombre} *${c.doc_codigo}* del ${dmy(c.fecha_emision)}` +
        (c.tipo !== '09' ? ` por *${sym} ${fmt(c.total)}*` : '') + '.',
      c.pdf_url ? `PDF: ${c.pdf_url}` : '',
      `Atte. ${ST.config.razon_social || 'PASEGA'}`
    ].filter(Boolean).join('\n');
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  }

  function canWrite() {
    return ST.status.role === 'owner' || ST.status.role === 'editor';
  }

  function catalogMatches(q) {
    const raw = window.PASEGA_CTX && window.PASEGA_CTX.getCatalogo ? window.PASEGA_CTX.getCatalogo() : [];
    if (!q) return [];
    const normQ = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (!normQ) return [];
    return raw
      .filter((p) => {
        const hay = `${p.code || ''} ${p.name || ''} ${p.cat || ''}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        return hay.includes(normQ);
      })
      .slice(0, 8);
  }

  function renderBanner() {
    const isProd = ST.config.modo === 'produccion' && ST.status.nubefactConfigured;
    if (ST.schemaMissing) {
      return `<div class="callout bad"><div><b>Falta activar las tablas de SUNAT en Supabase.</b> Ejecuta el archivo <code>supabase/sunat_schema.sql</code> en <b>Supabase → SQL Editor → Run</b> y luego recarga esta página.</div></div>`;
    }
    if (isProd) {
      return `<div class="callout good"><div><b>NUBEFACT CONECTADO · MODO PRODUCCIÓN SUNAT.</b> Los comprobantes emitidos aquí se envían oficialmente a SUNAT con validez tributaria.</div></div>`;
    }
    return `<div class="callout warn"><div><b>MODO DEMO (Pruebas):</b> Puedes emitir Facturas, Boletas, Notas de Crédito y Guías para probar todo el flujo (sin enviar nada real a SUNAT). Cuando tengas tu cuenta de <b>Nubefact</b>, agrega <code>NUBEFACT_URL</code> y <code>NUBEFACT_TOKEN</code> en Vercel y cambia a Producción en la pestaña <b>Configuración</b>.</div></div>`;
  }

  function renderLastResult() {
    if (!ST.lastResult) return '';
    const { comprobante: c, synced } = ST.lastResult;
    const syncNotes = [];
    if (synced && synced.ventas) syncNotes.push('agregado a Finanzas (Ventas)');
    if (synced && synced.cobranzas) syncNotes.push('agregado a Cobranzas (Crédito)');
    return `<div class="callout good" style="flex-direction:column;gap:8px">
      <div><b>✓ Comprobante emitido: ${esc(c.doc_codigo)}</b> (${esc((TIPOS[c.tipo] || {}).corto || c.tipo)} · ${esc(c.modo.toUpperCase())}) — ${esc(c.sunat_mensaje || '')}${syncNotes.length ? `<br><span class="small">Sincronizado automáticamente: ${esc(syncNotes.join(' y '))}.</span>` : ''}</div>
      <div class="row">
        <button type="button" class="btn sm primary" data-sact="pdf" data-id="${esc(c.id)}">${c.pdf_url ? 'Abrir PDF oficial' : 'Descargar PDF (Demo)'}</button>
        ${c.xml_url ? `<a class="btn sm" href="${esc(c.xml_url)}" target="_blank" rel="noopener">XML</a>` : ''}
        ${c.cdr_url ? `<a class="btn sm" href="${esc(c.cdr_url)}" target="_blank" rel="noopener">CDR</a>` : ''}
        <a class="btn sm cb-wa" href="${esc(waComprobanteUrl(c))}" target="_blank" rel="noopener">Enviar WhatsApp</a>
        ${c.tipo === '01' || c.tipo === '03' ? `<button type="button" class="btn sm" data-sact="to-gre" data-id="${esc(c.id)}">Generar Guía (GRE)</button>` : ''}
        <button type="button" class="btn sm" data-sact="clear-res">Cerrar aviso</button>
      </div>
    </div>`;
  }

  function renderEmitir() {
    if (!ST.form) ST.form = newEmitForm('01');
    const F = ST.form;
    const sers = seriesByTipo(F.tipo);
    const T = calcTotals(F.items, F.precio_incluye_igv);
    const sym = F.moneda === 'PEN' ? 'S/' : 'US$';
    const matches = catalogMatches(ST.catQuery);
    const sellers = (window.PASEGA_CTX && window.PASEGA_CTX.getVendedores ? window.PASEGA_CTX.getVendedores() : []);

    return `
      ${renderLastResult()}
      <div class="card">
        <h2>Emitir Factura o Boleta Electrónica</h2>
        <p class="hint">Consulta el RUC o DNI, agrega productos desde tu catálogo y elige si tus precios incluyen o no IGV.</p>
        <div class="form-grid">
          <label>Tipo de comprobante
            <select data-ef="tipo">
              <option value="01" ${F.tipo === '01' ? 'selected' : ''}>Factura Electrónica (01 · RUC)</option>
              <option value="03" ${F.tipo === '03' ? 'selected' : ''}>Boleta de Venta (03 · DNI/RUC)</option>
            </select>
          </label>
          <label>Serie
            <select data-ef="serie">
              ${sers.map((s) => `<option value="${esc(s.serie)}" ${F.serie === s.serie ? 'selected' : ''}>${esc(s.serie)} (próx. #${s.ultimo_numero + 1})</option>`).join('')}
            </select>
          </label>
          <label>Fecha de emisión
            <input type="date" data-ef="fecha_emision" value="${esc(F.fecha_emision)}">
          </label>
          <label>Moneda
            <select data-ef="moneda">
              <option value="USD" ${F.moneda === 'USD' ? 'selected' : ''}>Dólares (US$)</option>
              <option value="PEN" ${F.moneda === 'PEN' ? 'selected' : ''}>Soles (S/)</option>
            </select>
          </label>
          <label>Tipo de cambio
            <input type="number" step="0.001" data-ef="tipo_cambio" value="${esc(F.tipo_cambio)}">
          </label>
          <label>Vendedor
            <input type="text" list="psg-vends-dl" data-ef="vendedor" value="${esc(F.vendedor)}" placeholder="Nombre del vendedor">
            <datalist id="psg-vends-dl">${sellers.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>
          </label>
        </div>

        <h3 class="fh">1 · Datos del cliente</h3>
        <div class="form-grid">
          <label>Documento
            <select data-ef="cliente_tipo_doc">
              <option value="6" ${F.cliente_tipo_doc === '6' ? 'selected' : ''}>RUC (11 dígitos)</option>
              <option value="1" ${F.cliente_tipo_doc === '1' ? 'selected' : ''}>DNI (8 dígitos)</option>
              <option value="0" ${F.cliente_tipo_doc === '0' ? 'selected' : ''}>Sin documento (Varios)</option>
            </select>
          </label>
          <label>Número RUC / DNI
            <div style="display:flex;gap:6px">
              <input type="text" data-ef="cliente_doc" value="${esc(F.cliente_doc)}" placeholder="${F.cliente_tipo_doc === '6' ? '20123456789' : '12345678'}" style="flex:1;min-width:120px">
              <button type="button" class="btn sm primary" data-sact="lookup-client" ${ST.busy ? 'disabled' : ''}>Buscar</button>
            </div>
          </label>
          <label style="grid-column:span 2">Razón Social / Nombre completo
            <input type="text" data-ef="cliente_nombre" value="${esc(F.cliente_nombre)}" placeholder="EMPRESA CLIENTE S.A.C.">
          </label>
          <label style="grid-column:span 2">Dirección fiscal
            <input type="text" data-ef="cliente_direccion" value="${esc(F.cliente_direccion)}" placeholder="Av. ...">
          </label>
          <label>Teléfono (WhatsApp / Cobranzas)
            <input type="text" data-ef="cliente_telefono" value="${esc(F.cliente_telefono)}" placeholder="999888777">
          </label>
          <label>Correo (para envío automático)
            <input type="text" data-ef="cliente_email" value="${esc(F.cliente_email)}" placeholder="facturacion@cliente.com">
          </label>
        </div>
        ${F.cliente_sunat_info ? `<div class="small muted" style="margin:-6px 0 10px">${esc(F.cliente_sunat_info)}</div>` : ''}
        ${ST.clientes.length ? `<div class="row" style="margin-bottom:10px"><label class="small muted" style="display:flex;align-items:center;gap:8px">Clientes recientes:
          <select data-sact-sel="pick-client" style="min-height:30px;padding:3px 8px;max-width:340px">
            <option value="">— Seleccionar cliente guardado —</option>
            ${ST.clientes.slice(0, 80).map((c) => `<option value="${esc(c.tipo_doc + '|' + c.numero_doc)}">${esc(c.numero_doc)} · ${esc(c.razon_social)}</option>`).join('')}
          </select></label></div>` : ''}

        <h3 class="fh">2 · Productos y precios</h3>
        <div class="row" style="margin-bottom:12px;align-items:center">
          <div class="seg" role="group" aria-label="Modo de precios IGV">
            <button type="button" class="${!F.precio_incluye_igv ? 'on' : ''}" data-sact="igv-mode" data-val="0">Precios SIN IGV (Valor Unit.)</button>
            <button type="button" class="${F.precio_incluye_igv ? 'on' : ''}" data-sact="igv-mode" data-val="1">Precios CON IGV incluido (${ST.config.igv_pct || 18}%)</button>
          </div>
          <div style="position:relative;flex:1;min-width:240px">
            <input type="search" id="sunat-cat-q" value="${esc(ST.catQuery)}" placeholder="Buscar producto en tu catálogo (código o nombre)…" style="width:100%">
            ${matches.length ? `<div style="position:absolute;left:0;right:0;top:100%;z-index:20;background:var(--surface-1);border:1px solid var(--line-strong);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);margin-top:4px;max-height:240px;overflow:auto">
              ${matches.map((p) => `<div data-sact="add-cat" data-code="${esc(p.code)}" data-name="${esc(p.name)}" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;font-size:13px">
                <div><b>${esc(p.code || 'S/C')}</b> · ${esc(p.name)}</div>
                <span class="muted small">${p.stock != null ? `Stock: ${fmt(p.stock, 0)}` : ''}</span>
              </div>`).join('')}
            </div>` : ''}
          </div>
          <button type="button" class="btn sm" data-sact="add-line">+ Línea libre</button>
        </div>

        <div class="tbl-wrap">
          <table class="lines">
            <thead>
              <tr>
                <th style="width:120px">Código</th>
                <th>Descripción</th>
                <th style="width:82px">Unid.</th>
                <th class="num" style="width:88px">Cant.</th>
                <th class="num" style="width:125px">${F.precio_incluye_igv ? 'P. Unit (c/IGV)' : 'V. Unit (s/IGV)'}</th>
                <th class="num" style="width:115px">Subtotal</th>
                <th class="num" style="width:115px">Total</th>
                <th style="width:42px"></th>
              </tr>
            </thead>
            <tbody>
              ${F.items.map((it, idx) => {
                const ln = T.lines[idx] || { vv: 0, tot: 0 };
                return `<tr>
                  <td><input type="text" data-ei="${idx}" data-k="codigo" value="${esc(it.codigo)}" placeholder="COD"></td>
                  <td><input type="text" data-ei="${idx}" data-k="descripcion" value="${esc(it.descripcion)}" placeholder="Descripción del repuesto/producto"></td>
                  <td><input type="text" data-ei="${idx}" data-k="unidad" value="${esc(it.unidad || 'UND')}"></td>
                  <td><input type="number" step="any" min="0" data-ei="${idx}" data-k="cant" value="${esc(it.cant)}" style="text-align:right"></td>
                  <td><input type="number" step="any" min="0" data-ei="${idx}" data-k="precio" value="${esc(it.precio)}" placeholder="0.00" style="text-align:right"></td>
                  <td class="num mono">${sym} ${fmt(ln.vv)}</td>
                  <td class="num mono"><b>${sym} ${fmt(ln.tot)}</b></td>
                  <td><button type="button" class="btn sm danger" data-sact="del-line" data-idx="${idx}" title="Quitar">✕</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <h3 class="fh">3 · Condición de pago y totales</h3>
        <div class="grid2" style="align-items:start">
          <div>
            <div class="form-grid">
              <label>Forma de pago
                <select data-ef="forma_pago">
                  <option value="CONTADO" ${F.forma_pago === 'CONTADO' ? 'selected' : ''}>Contado</option>
                  <option value="CREDITO" ${F.forma_pago === 'CREDITO' ? 'selected' : ''}>Crédito (entra a Cobranzas)</option>
                </select>
              </label>
              ${F.forma_pago === 'CREDITO' ? `<label>Fecha de vencimiento
                <input type="date" data-ef="fecha_vcto" value="${esc(F.fecha_vcto)}">
              </label>` : ''}
            </div>
            ${F.forma_pago === 'CREDITO' ? `<div class="row" style="margin:-6px 0 12px">
              <span class="small muted">Plazo rápido:</span>
              ${[15, 30, 45, 60].map((d) => `<button type="button" class="btn sm" data-sact="set-dias" data-d="${d}">+${d} días</button>`).join('')}
            </div>` : ''}
            <label class="small muted" style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">Observaciones (opcional)
              <input type="text" data-ef="observaciones" value="${esc(F.observaciones)}" placeholder="Ej. Orden de compra, nota interna…">
            </label>
            <label class="chk">
              <input type="checkbox" data-ef-chk="sincronizar" ${F.sincronizar ? 'checked' : ''}>
              Sincronizar automáticamente con Finanzas (Ventas), Stock y Cobranzas
            </label>
          </div>
          <div class="card" style="background:var(--surface-2);margin:0">
            <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Op. Gravada (Subtotal)</span><b class="mono">${sym} ${fmt(T.sub)}</b></div>
            <div style="display:flex;justify-content:space-between;padding:4px 0"><span>IGV (${ST.config.igv_pct || 18}%)</span><b class="mono">${sym} ${fmt(T.igv)}</b></div>
            <div style="display:flex;justify-content:space-between;padding:10px 0 4px;margin-top:6px;border-top:1px solid var(--line-strong);font-size:18px">
              <b>TOTAL A PAGAR</b><b class="mono">${sym} ${fmt(T.tot)}</b>
            </div>
            <div class="row" style="margin-top:14px;justify-content:flex-end">
              <button type="button" class="btn" data-sact="reset-emit">Limpiar</button>
              <button type="button" class="btn primary" data-sact="submit-emit" ${ST.busy || !canWrite() || ST.schemaMissing ? 'disabled' : ''}>
                ${ST.busy ? 'Emitiendo…' : (ST.config.modo === 'produccion' && ST.status.nubefactConfigured ? 'Emitir a SUNAT' : 'Emitir (Modo Demo)')}
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderNc() {
    if (!ST.ncForm) ST.ncForm = newNcForm(null);
    const F = ST.ncForm;
    const T = calcTotals(F.items, F.precio_incluye_igv);
    const sym = F.moneda === 'PEN' ? 'S/' : 'US$';
    const refs = ST.comprobantes.filter((c) => (c.tipo === '01' || c.tipo === '03') && c.estado !== 'anulado');
    const sers = seriesByTipo('07');

    return `
      ${renderLastResult()}
      <div class="card">
        <h2>Emitir Nota de Crédito Electrónica (07)</h2>
        <p class="hint">Selecciona la Factura o Boleta que deseas anular o ajustar. Se registrará en Finanzas y repondrá el stock.</p>
        <div class="form-grid">
          <label style="grid-column:span 2">Comprobante original a modificar
            <select data-sact-sel="pick-nc-ref">
              <option value="">— Selecciona una Factura o Boleta emitida —</option>
              ${refs.map((c) => `<option value="${esc(c.id)}" ${F.ref_id === c.id ? 'selected' : ''}>${esc(c.doc_codigo)} · ${esc(c.cliente_nombre)} · ${c.moneda === 'PEN' ? 'S/' : 'US$'} ${fmt(c.total)} (${dmy(c.fecha_emision)})</option>`).join('')}
            </select>
          </label>
          <label>O escribe N° de comprobante (si fue externo)
            <input type="text" data-nf="ref_doc" value="${esc(F.ref_doc)}" placeholder="F002-00000001">
          </label>
          <label>Serie Nota de Crédito
            <select data-nf="serie">
              ${sers.map((s) => `<option value="${esc(s.serie)}" ${F.serie === s.serie ? 'selected' : ''}>${esc(s.serie)} (próx. #${s.ultimo_numero + 1})</option>`).join('')}
            </select>
          </label>
          <label style="grid-column:span 2">Motivo SUNAT
            <select data-nf="motivo_nc">
              ${MOTIVOS_NC.map(([k, lbl]) => `<option value="${k}" ${F.motivo_nc === k ? 'selected' : ''}>${esc(lbl)}</option>`).join('')}
            </select>
          </label>
          <label>Fecha emisión
            <input type="date" data-nf="fecha_emision" value="${esc(F.fecha_emision)}">
          </label>
          <label>Moneda
            <select data-nf="moneda">
              <option value="USD" ${F.moneda === 'USD' ? 'selected' : ''}>Dólares (US$)</option>
              <option value="PEN" ${F.moneda === 'PEN' ? 'selected' : ''}>Soles (S/)</option>
            </select>
          </label>
          <label>RUC / DNI Cliente
            <input type="text" data-nf="cliente_doc" value="${esc(F.cliente_doc)}">
          </label>
          <label style="grid-column:span 2">Cliente
            <input type="text" data-nf="cliente_nombre" value="${esc(F.cliente_nombre)}">
          </label>
        </div>

        <div class="tbl-wrap" style="margin-bottom:12px">
          <table class="lines">
            <thead><tr><th style="width:120px">Código</th><th>Descripción</th><th class="num" style="width:90px">Cant.</th><th class="num" style="width:120px">V. Unit (s/IGV)</th><th class="num" style="width:115px">Total</th><th style="width:42px"></th></tr></thead>
            <tbody>
              ${F.items.map((it, idx) => {
                const ln = T.lines[idx] || { tot: 0 };
                return `<tr>
                  <td><input type="text" data-ni="${idx}" data-k="codigo" value="${esc(it.codigo)}"></td>
                  <td><input type="text" data-ni="${idx}" data-k="descripcion" value="${esc(it.descripcion)}"></td>
                  <td><input type="number" step="any" data-ni="${idx}" data-k="cant" value="${esc(it.cant)}" style="text-align:right"></td>
                  <td><input type="number" step="any" data-ni="${idx}" data-k="precio" value="${esc(it.precio)}" style="text-align:right"></td>
                  <td class="num mono">${sym} ${fmt(ln.tot)}</td>
                  <td><button type="button" class="btn sm danger" data-sact="del-nc-line" data-idx="${idx}">✕</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div class="row" style="justify-content:space-between;align-items:center">
          <button type="button" class="btn sm" data-sact="add-nc-line">+ Agregar línea</button>
          <div class="row" style="align-items:center">
            <span class="mono"><b>Total NC: ${sym} ${fmt(T.tot)}</b> (Sub ${sym} ${fmt(T.sub)} + IGV ${sym} ${fmt(T.igv)})</span>
            <button type="button" class="btn primary" data-sact="submit-nc" ${ST.busy || !canWrite() || ST.schemaMissing ? 'disabled' : ''}>
              ${ST.busy ? 'Emitiendo…' : 'Emitir Nota de Crédito'}
            </button>
          </div>
        </div>
      </div>`;
  }

  function renderGre() {
    if (!ST.greForm) ST.greForm = newGreForm(null);
    const F = ST.greForm;
    const G = F.gre_datos;
    const sers = seriesByTipo('09');
    const refs = ST.comprobantes.filter((c) => (c.tipo === '01' || c.tipo === '03') && c.estado !== 'anulado');
    const priv = G.modalidad === '02';

    return `
      ${renderLastResult()}
      <div class="card">
        <h2>Emitir Guía de Remisión Electrónica Remitente (GRE · 09)</h2>
        <p class="hint">Puedes precargar cliente e ítems desde una Factura ya emitida o llenarla manualmente.</p>
        <div class="form-grid">
          <label style="grid-column:span 2">Precargar desde Factura / Boleta (opcional)
            <select data-sact-sel="pick-gre-ref">
              <option value="">— Seleccionar comprobante —</option>
              ${refs.map((c) => `<option value="${esc(c.id)}">${esc(c.doc_codigo)} · ${esc(c.cliente_nombre)} (${dmy(c.fecha_emision)})</option>`).join('')}
            </select>
          </label>
          <label>Serie GRE
            <select data-gf="serie">
              ${sers.map((s) => `<option value="${esc(s.serie)}" ${F.serie === s.serie ? 'selected' : ''}>${esc(s.serie)} (próx. #${s.ultimo_numero + 1})</option>`).join('')}
            </select>
          </label>
          <label>Fecha emisión
            <input type="date" data-gf="fecha_emision" value="${esc(F.fecha_emision)}">
          </label>
        </div>

        <h3 class="fh">1 · Destinatario y traslado</h3>
        <div class="form-grid">
          <label>RUC / DNI Destinatario
            <input type="text" data-gf="cliente_doc" value="${esc(F.cliente_doc)}" placeholder="20123456789">
          </label>
          <label style="grid-column:span 2">Razón Social / Destinatario
            <input type="text" data-gf="cliente_nombre" value="${esc(F.cliente_nombre)}">
          </label>
          <label>Motivo de traslado
            <select data-gd="motivo">
              ${MOTIVOS_GRE.map(([k, lbl]) => `<option value="${k}" ${G.motivo === k ? 'selected' : ''}>${esc(lbl)}</option>`).join('')}
            </select>
          </label>
          <label>Fecha inicio traslado
            <input type="date" data-gd="fecha_traslado" value="${esc(G.fecha_traslado)}">
          </label>
          <label>Peso bruto total (KG)
            <input type="number" step="0.1" min="0.1" data-gd="peso_bruto" value="${esc(G.peso_bruto)}">
          </label>
          <label>Número de bultos
            <input type="number" min="1" data-gd="bultos" value="${esc(G.bultos)}">
          </label>
          <label>Modalidad de transporte
            <select data-gd="modalidad">
              <option value="02" ${priv ? 'selected' : ''}>02 · Transporte Privado (vehículo propio)</option>
              <option value="01" ${!priv ? 'selected' : ''}>01 · Transporte Público (agencia/courier)</option>
            </select>
          </label>
        </div>

        <div class="form-grid">
          <label>Ubigeo Partida (6 dígitos)
            <input type="text" maxlength="6" data-gd="partida_ubigeo" value="${esc(G.partida_ubigeo)}">
          </label>
          <label style="grid-column:span 2">Dirección de Partida
            <input type="text" data-gd="partida_direccion" value="${esc(G.partida_direccion)}" placeholder="Almacén PASEGA…">
          </label>
          <label>Ubigeo Llegada (6 dígitos)
            <input type="text" maxlength="6" data-gd="llegada_ubigeo" value="${esc(G.llegada_ubigeo)}">
          </label>
          <label style="grid-column:span 2">Dirección de Llegada
            <input type="text" data-gd="llegada_direccion" value="${esc(G.llegada_direccion)}" placeholder="Dirección de entrega del cliente…">
          </label>
        </div>

        <h3 class="fh">2 · Datos del transporte (${priv ? 'Privado' : 'Público'})</h3>
        <div class="form-grid">
          ${priv ? `
            <label>Placa del vehículo<input type="text" data-gd="placa" value="${esc(G.placa)}" placeholder="ABC123"></label>
            <label>DNI Conductor<input type="text" data-gd="conductor_dni" value="${esc(G.conductor_dni)}" placeholder="12345678"></label>
            <label>Nombres Conductor<input type="text" data-gd="conductor_nombre" value="${esc(G.conductor_nombre)}"></label>
            <label>Apellidos Conductor<input type="text" data-gd="conductor_apellidos" value="${esc(G.conductor_apellidos)}"></label>
            <label>N° Licencia (Brevete)<input type="text" data-gd="conductor_licencia" value="${esc(G.conductor_licencia)}" placeholder="Q12345678"></label>
          ` : `
            <label>RUC Empresa Transportista<input type="text" data-gd="transportista_ruc" value="${esc(G.transportista_ruc)}" placeholder="20..."></label>
            <label style="grid-column:span 2">Razón Social Transportista<input type="text" data-gd="transportista_nombre" value="${esc(G.transportista_nombre)}"></label>
            <label>Placa (opcional)<input type="text" data-gd="placa" value="${esc(G.placa)}"></label>
          `}
        </div>

        <h3 class="fh">3 · Bienes a trasladar</h3>
        <div class="tbl-wrap" style="margin-bottom:12px">
          <table class="lines">
            <thead><tr><th style="width:120px">Código</th><th>Descripción</th><th style="width:85px">Unid.</th><th class="num" style="width:95px">Cantidad</th><th style="width:42px"></th></tr></thead>
            <tbody>
              ${F.items.map((it, idx) => `<tr>
                <td><input type="text" data-gi="${idx}" data-k="codigo" value="${esc(it.codigo)}"></td>
                <td><input type="text" data-gi="${idx}" data-k="descripcion" value="${esc(it.descripcion)}"></td>
                <td><input type="text" data-gi="${idx}" data-k="unidad" value="${esc(it.unidad || 'UND')}"></td>
                <td><input type="number" step="any" data-gi="${idx}" data-k="cant" value="${esc(it.cant)}" style="text-align:right"></td>
                <td><button type="button" class="btn sm danger" data-sact="del-gre-line" data-idx="${idx}">✕</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="row" style="justify-content:space-between">
          <button type="button" class="btn sm" data-sact="add-gre-line">+ Agregar bien</button>
          <button type="button" class="btn primary" data-sact="submit-gre" ${ST.busy || !canWrite() || ST.schemaMissing ? 'disabled' : ''}>
            ${ST.busy ? 'Emitiendo…' : 'Emitir Guía de Remisión (GRE)'}
          </button>
        </div>
      </div>`;
  }

  function renderHistorial() {
    const q = (ST.histFilter.q || '').toLowerCase().trim();
    const list = ST.comprobantes.filter((c) => {
      if (ST.histFilter.tipo && c.tipo !== ST.histFilter.tipo) return false;
      if (q && !`${c.doc_codigo} ${c.cliente_nombre} ${c.cliente_doc} ${c.vendedor}`.toLowerCase().includes(q)) return false;
      return true;
    });

    const estBadge = (c) => {
      if (c.estado === 'aceptado') return '<span class="badge good">✓ Aceptado SUNAT</span>';
      if (c.estado === 'demo') return '<span class="badge warn">DEMO</span>';
      if (c.estado === 'anulado') return '<span class="badge bad">Anulado</span>';
      if (c.estado === 'rechazado') return '<span class="badge bad">Rechazado</span>';
      return `<span class="badge neutral">${esc(c.estado)}</span>`;
    };

    return `
      <div class="card">
        <div class="sec-title"><h2>Comprobantes emitidos desde PASEGA</h2><span class="muted small">${list.length} registro(s)</span></div>
        <div class="filters">
          <label>Tipo
            <select data-hf="tipo">
              <option value="">Todos</option>
              <option value="01" ${ST.histFilter.tipo === '01' ? 'selected' : ''}>Facturas (01)</option>
              <option value="03" ${ST.histFilter.tipo === '03' ? 'selected' : ''}>Boletas (03)</option>
              <option value="07" ${ST.histFilter.tipo === '07' ? 'selected' : ''}>Notas de Crédito (07)</option>
              <option value="09" ${ST.histFilter.tipo === '09' ? 'selected' : ''}>Guías de Remisión (09)</option>
            </select>
          </label>
          <label>Buscar
            <input type="search" data-hf="q" value="${esc(ST.histFilter.q)}" placeholder="Número, cliente, RUC…">
          </label>
          <div class="spacer"></div>
          <button type="button" class="btn sm" data-sact="refresh">Actualizar</button>
        </div>

        ${list.length ? `<div class="tbl-wrap"><table>
          <thead><tr><th>Comprobante</th><th>Fecha</th><th>Cliente</th><th>Pago</th><th class="num">Total</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${list.map((c) => {
              const sym = c.moneda === 'PEN' ? 'S/' : 'US$';
              return `<tr>
                <td><div class="pname mono">${esc(c.doc_codigo)}</div><div class="pcode">${esc((TIPOS[c.tipo] || {}).corto || c.tipo)}</div></td>
                <td class="small">${dmy(c.fecha_emision)}</td>
                <td><div class="pname">${esc(c.cliente_nombre)}</div><div class="pcode">${esc(c.cliente_doc || '—')}${c.vendedor ? ' · ' + esc(c.vendedor) : ''}</div></td>
                <td class="small">${c.tipo === '09' ? 'Traslado' : (c.forma_pago === 'CREDITO' ? `Crédito<br><span class="muted">Vcto ${dmy(c.fecha_vcto)}</span>` : 'Contado')}</td>
                <td class="num mono">${c.tipo === '09' ? '—' : `${sym} ${fmt(c.total)}`}</td>
                <td>${estBadge(c)}</td>
                <td style="white-space:nowrap">
                  <button type="button" class="btn sm" data-sact="pdf" data-id="${esc(c.id)}">PDF</button>
                  ${c.xml_url ? `<a class="btn sm" href="${esc(c.xml_url)}" target="_blank" rel="noopener">XML</a>` : ''}
                  <a class="btn sm cb-wa" href="${esc(waComprobanteUrl(c))}" target="_blank" rel="noopener">WA</a>
                  ${(c.tipo === '01' || c.tipo === '03') && c.estado !== 'anulado' ? `
                    <button type="button" class="btn sm" data-sact="to-nc" data-id="${esc(c.id)}" title="Emitir Nota de Crédito">NC</button>
                    <button type="button" class="btn sm" data-sact="to-gre" data-id="${esc(c.id)}" title="Emitir Guía de Remisión">GRE</button>
                  ` : ''}
                  ${c.estado !== 'anulado' && canWrite() ? `<button type="button" class="btn sm danger" data-sact="anular" data-id="${esc(c.id)}">Anular</button>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>` : `<div class="empty"><div class="big">Aún no has emitido comprobantes desde aquí</div><div>Ve a la pestaña <b>Emitir (Factura / Boleta)</b> para crear tu primer comprobante en Modo Demo.</div></div>`}
      </div>`;
  }

  function renderConfig() {
    const C = ST.config;
    return `
      <div class="grid2">
        <div class="card">
          <h2>Datos fiscales de PASEGA</h2>
          <p class="hint">Se muestran en tus comprobantes PDF y se usan como punto de partida por defecto en Guías de Remisión.</p>
          <div class="form-grid">
            <label>RUC de PASEGA<input type="text" maxlength="11" data-cf="ruc" value="${esc(C.ruc)}" placeholder="20..."></label>
            <label>IGV (%)<input type="number" step="0.5" data-cf="igv_pct" value="${esc(C.igv_pct)}"></label>
            <label style="grid-column:span 2">Razón Social<input type="text" data-cf="razon_social" value="${esc(C.razon_social)}"></label>
            <label style="grid-column:span 2">Dirección fiscal (Almacén / Oficina)<input type="text" data-cf="direccion" value="${esc(C.direccion)}" placeholder="Av. ... Lima"></label>
            <label>Ubigeo (6 dígitos)<input type="text" maxlength="6" data-cf="ubigeo" value="${esc(C.ubigeo)}"></label>
            <label>Modo de operación
              <select data-cf="modo">
                <option value="demo" ${C.modo !== 'produccion' ? 'selected' : ''}>Modo Demo (pruebas locales)</option>
                <option value="produccion" ${C.modo === 'produccion' ? 'selected' : ''} ${ST.status.nubefactConfigured ? '' : 'disabled'}>Producción SUNAT (Nubefact)${ST.status.nubefactConfigured ? '' : ' · requiere configurar Vercel'}</option>
              </select>
            </label>
          </div>
          <div class="row" style="justify-content:flex-end">
            <button type="button" class="btn primary" data-sact="save-config" ${!canWrite() || ST.schemaMissing ? 'disabled' : ''}>Guardar configuración</button>
          </div>
        </div>

        <div class="card">
          <h2>Estado de conexión Nubefact & RUC</h2>
          <p class="hint">Las llaves de Nubefact viven de forma segura en las variables de entorno de Vercel (nunca en el navegador).</p>
          <div style="display:grid;gap:10px;margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--surface-2);border-radius:8px">
              <span>Nubefact API (<code>NUBEFACT_URL</code> + <code>NUBEFACT_TOKEN</code>)</span>
              <span class="badge ${ST.status.nubefactConfigured ? 'good' : 'warn'}">${ST.status.nubefactConfigured ? '✓ Configurado' : 'Pendiente (Modo Demo)'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--surface-2);border-radius:8px">
              <span>Consulta RUC/DNI dedicada (<code>RUC_API_TOKEN</code>)</span>
              <span class="badge ${ST.status.rucApiConfigured ? 'good' : 'neutral'}">${ST.status.rucApiConfigured ? '✓ Configurado' : 'Opcional (usa respaldo gratis)'}</span>
            </div>
          </div>

          <h2 style="margin-top:16px">Series y correlativos</h2>
          <p class="hint">Por defecto usamos series nuevas (<code>F002</code>, <code>B002</code>, <code>T002</code>) para no chocar con comprobantes de tu sistema anterior.</p>
          <div class="tbl-wrap">
            <table class="lines">
              <thead><tr><th>Tipo</th><th>Serie</th><th class="num">Último N°</th></tr></thead>
              <tbody>
                ${ST.series.map((s) => `<tr>
                  <td class="small">${esc((TIPOS[s.tipo] || {}).corto || s.tipo)} (${esc(s.tipo)})</td>
                  <td class="mono"><b>${esc(s.serie)}</b></td>
                  <td class="num mono">${s.ultimo_numero}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  function render() {
    const host = document.getElementById('sunat-host');
    if (!host) return;
    host.hidden = !ST.visible;
    if (!ST.visible) return;

    const tabs = [
      ['emitir', 'Emitir (Factura / Boleta)'],
      ['nc', 'Notas de Crédito (07)'],
      ['gre', 'Guías de Remisión (GRE)'],
      ['historial', `Historial (${ST.comprobantes.length})`],
      ['config', 'Configuración y Series']
    ];

    const body = !ST.loaded
      ? '<div class="card empty"><div class="big">Cargando módulo SUNAT…</div></div>'
      : ST.tab === 'nc' ? renderNc()
      : ST.tab === 'gre' ? renderGre()
      : ST.tab === 'historial' ? renderHistorial()
      : ST.tab === 'config' ? renderConfig()
      : renderEmitir();

    host.innerHTML = `
      <header class="top">
        <div class="brand">
          <div>
            <h1>Facturación Electrónica · SUNAT</h1>
            <div class="sub">Emite Facturas, Boletas, Notas de Crédito y Guías (GRE) sincronizadas con Finanzas y Cobranzas</div>
          </div>
          <div class="status">
            <span class="dot ${ST.config.modo === 'produccion' && ST.status.nubefactConfigured ? '' : 'off'}"></span>
            ${ST.config.modo === 'produccion' && ST.status.nubefactConfigured ? 'Nubefact · Producción SUNAT' : 'Modo Demo (Pruebas)'}
          </div>
        </div>
        <nav class="tabs">
          ${tabs.map(([id, lbl]) => `<button type="button" class="${ST.tab === id ? 'on' : ''}" data-stab="${id}">${esc(lbl)}</button>`).join('')}
        </nav>
      </header>
      <main>
        ${renderBanner()}
        ${ST.msg}
        ${body}
      </main>`;
  }

  async function handleAction(el) {
    const act = el.dataset.sact;
    ST.msg = '';
    if (act === 'clear-res') {
      ST.lastResult = null;
      render();
      return;
    }
    if (act === 'refresh') {
      await refreshComprobantes();
      return;
    }
    if (act === 'igv-mode') {
      ST.form.precio_incluye_igv = el.dataset.val === '1';
      render();
      return;
    }
    if (act === 'set-dias') {
      const d = Number(el.dataset.d || 30);
      ST.form.fecha_vcto = addDaysIso(ST.form.fecha_emision, d);
      render();
      return;
    }
    if (act === 'add-line') {
      ST.form.items.push({ codigo: '', descripcion: '', unidad: 'UND', cant: 1, precio: '' });
      render();
      return;
    }
    if (act === 'del-line') {
      const i = Number(el.dataset.idx);
      ST.form.items.splice(i, 1);
      if (!ST.form.items.length) ST.form.items.push({ codigo: '', descripcion: '', unidad: 'UND', cant: 1, precio: '' });
      render();
      return;
    }
    if (act === 'add-cat') {
      const emptyIdx = ST.form.items.findIndex((it) => !it.codigo && !it.descripcion);
      const item = { codigo: el.dataset.code || '', descripcion: el.dataset.name || '', unidad: 'UND', cant: 1, precio: '' };
      if (emptyIdx >= 0) ST.form.items[emptyIdx] = item;
      else ST.form.items.push(item);
      ST.catQuery = '';
      render();
      return;
    }
    if (act === 'reset-emit') {
      ST.form = newEmitForm(ST.form.tipo);
      ST.lastResult = null;
      render();
      return;
    }
    if (act === 'lookup-client') {
      const F = ST.form;
      const num = String(F.cliente_doc || '').replace(/\D/g, '');
      const tipo = F.cliente_tipo_doc === '1' || num.length === 8 ? 'dni' : 'ruc';
      ST.busy = true;
      render();
      try {
        const res = await apiCall(`/api/sunat/consulta?tipo=${tipo}&numero=${encodeURIComponent(num)}`);
        if (res.found && res.cliente) {
          F.cliente_tipo_doc = res.cliente.tipo_doc;
          F.cliente_doc = res.cliente.numero_doc;
          F.cliente_nombre = res.cliente.razon_social || '';
          F.cliente_direccion = res.cliente.direccion || '';
          if (res.cliente.telefono) F.cliente_telefono = res.cliente.telefono;
          if (res.cliente.email) F.cliente_email = res.cliente.email;
          const stParts = [res.cliente.estado_sunat, res.cliente.condicion_sunat].filter(Boolean).join(' · ');
          F.cliente_sunat_info = `✓ Encontrado (${res.source === 'cache' ? 'clientes guardados' : 'padrón SUNAT/RENIEC'})${stParts ? ' · ' + stParts : ''}`;
        } else {
          F.cliente_sunat_info = res.message || 'No encontrado. Puedes ingresar los datos manualmente.';
        }
      } catch (e) {
        ST.msg = `<div class="callout warn"><div>${esc(e.message || e)}</div></div>`;
      } finally {
        ST.busy = false;
        render();
      }
      return;
    }
    if (act === 'submit-emit') {
      ST.busy = true;
      render();
      try {
        const res = await apiCall('/api/sunat/emitir', { method: 'POST', body: ST.form });
        ST.lastResult = res;
        ST.form = newEmitForm(ST.form.tipo);
        await refreshComprobantes();
      } catch (e) {
        ST.msg = `<div class="callout bad"><div>${esc(e.message || e)}</div></div>`;
      } finally {
        ST.busy = false;
        render();
      }
      return;
    }
    if (act === 'add-nc-line') {
      ST.ncForm.items.push({ codigo: '', descripcion: '', unidad: 'UND', cant: 1, precio: '' });
      render();
      return;
    }
    if (act === 'del-nc-line') {
      ST.ncForm.items.splice(Number(el.dataset.idx), 1);
      if (!ST.ncForm.items.length) ST.ncForm.items.push({ codigo: '', descripcion: '', unidad: 'UND', cant: 1, precio: '' });
      render();
      return;
    }
    if (act === 'submit-nc') {
      ST.busy = true;
      render();
      try {
        const res = await apiCall('/api/sunat/emitir', {
          method: 'POST',
          body: { ...ST.ncForm, tipo: '07' }
        });
        ST.lastResult = res;
        ST.ncForm = newNcForm(null);
        await refreshComprobantes();
      } catch (e) {
        ST.msg = `<div class="callout bad"><div>${esc(e.message || e)}</div></div>`;
      } finally {
        ST.busy = false;
        render();
      }
      return;
    }
    if (act === 'add-gre-line') {
      ST.greForm.items.push({ codigo: '', descripcion: '', unidad: 'UND', cant: 1 });
      render();
      return;
    }
    if (act === 'del-gre-line') {
      ST.greForm.items.splice(Number(el.dataset.idx), 1);
      if (!ST.greForm.items.length) ST.greForm.items.push({ codigo: '', descripcion: '', unidad: 'UND', cant: 1 });
      render();
      return;
    }
    if (act === 'submit-gre') {
      ST.busy = true;
      render();
      try {
        const res = await apiCall('/api/sunat/emitir', {
          method: 'POST',
          body: { ...ST.greForm, tipo: '09', sincronizar: false }
        });
        ST.lastResult = res;
        ST.greForm = newGreForm(null);
        await refreshComprobantes();
      } catch (e) {
        ST.msg = `<div class="callout bad"><div>${esc(e.message || e)}</div></div>`;
      } finally {
        ST.busy = false;
        render();
      }
      return;
    }
    if (act === 'pdf') {
      const c = ST.comprobantes.find((x) => x.id === el.dataset.id) || (ST.lastResult && ST.lastResult.comprobante);
      if (c) downloadComprobantePDF(c);
      return;
    }
    if (act === 'to-nc') {
      const c = ST.comprobantes.find((x) => x.id === el.dataset.id);
      if (c) {
        ST.ncForm = newNcForm(c);
        ST.tab = 'nc';
        ST.lastResult = null;
        render();
      }
      return;
    }
    if (act === 'to-gre') {
      const c = ST.comprobantes.find((x) => x.id === el.dataset.id) || (ST.lastResult && ST.lastResult.comprobante);
      if (c) {
        ST.greForm = newGreForm(c);
        ST.tab = 'gre';
        ST.lastResult = null;
        render();
      }
      return;
    }
    if (act === 'anular') {
      const c = ST.comprobantes.find((x) => x.id === el.dataset.id);
      if (!c) return;
      const motivo = window.prompt(`¿Motivo para anular ${c.doc_codigo}?`, 'ERROR EN EMISION');
      if (motivo === null) return;
      ST.busy = true;
      render();
      try {
        await apiCall('/api/sunat/anular', { method: 'POST', body: { id: c.id, motivo } });
        ST.msg = `<div class="callout good"><div><b>${esc(c.doc_codigo)} anulado correctamente.</b></div></div>`;
        await refreshComprobantes();
      } catch (e) {
        ST.msg = `<div class="callout bad"><div>${esc(e.message || e)}</div></div>`;
      } finally {
        ST.busy = false;
        render();
      }
      return;
    }
    if (act === 'save-config') {
      const client = window.PASEGA_AUTH && window.PASEGA_AUTH.getClient();
      if (!client) return;
      ST.busy = true;
      render();
      try {
        const { error } = await client.from('sunat_config').upsert({
          id: 1,
          ruc: String(ST.config.ruc || '').replace(/\D/g, '').slice(0, 11),
          razon_social: String(ST.config.razon_social || '').trim(),
          nombre_comercial: String(ST.config.nombre_comercial || 'PASEGA').trim(),
          direccion: String(ST.config.direccion || '').trim(),
          ubigeo: String(ST.config.ubigeo || '150101').replace(/\D/g, '').slice(0, 6) || '150101',
          igv_pct: Number(ST.config.igv_pct || 18),
          modo: ST.config.modo === 'produccion' && ST.status.nubefactConfigured ? 'produccion' : 'demo',
          updated_at: new Date().toISOString()
        });
        if (error) throw error;
        ST.msg = '<div class="callout good"><div>Configuración fiscal guardada correctamente.</div></div>';
      } catch (e) {
        ST.msg = `<div class="callout bad"><div>${esc(e.message || e)}</div></div>`;
      } finally {
        ST.busy = false;
        render();
      }
    }
  }

  function bindHost() {
    const host = document.getElementById('sunat-host');
    if (!host || host._sunatBound) return;
    host._sunatBound = true;

    host.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-stab]');
      if (tabBtn) {
        ST.tab = tabBtn.dataset.stab;
        ST.msg = '';
        render();
        return;
      }
      const actBtn = e.target.closest('[data-sact]');
      if (actBtn) {
        e.preventDefault();
        handleAction(actBtn);
      }
    });

    host.addEventListener('change', (e) => {
      const t = e.target;
      const d = t.dataset;
      if (d.ef) {
        ST.form[d.ef] = t.value;
        if (d.ef === 'tipo') {
          const sers = seriesByTipo(t.value);
          ST.form.serie = (sers[0] && sers[0].serie) || (t.value === '03' ? 'B002' : 'F002');
          ST.form.cliente_tipo_doc = t.value === '01' ? '6' : '1';
        }
        render();
        return;
      }
      if (d.efChk) {
        ST.form[d.efChk] = t.checked;
        return;
      }
      if (d.ei !== undefined) {
        ST.form.items[Number(d.ei)][d.k] = t.value;
        render();
        return;
      }
      if (d.nf) {
        ST.ncForm[d.nf] = t.value;
        render();
        return;
      }
      if (d.ni !== undefined) {
        ST.ncForm.items[Number(d.ni)][d.k] = t.value;
        render();
        return;
      }
      if (d.gf) {
        ST.greForm[d.gf] = t.value;
        render();
        return;
      }
      if (d.gd) {
        ST.greForm.gre_datos[d.gd] = t.value;
        render();
        return;
      }
      if (d.gi !== undefined) {
        ST.greForm.items[Number(d.gi)][d.k] = t.value;
        return;
      }
      if (d.cf) {
        ST.config[d.cf] = t.value;
        return;
      }
      if (d.hf) {
        ST.histFilter[d.hf] = t.value;
        render();
        return;
      }
      if (d.sactSel === 'pick-client' && t.value) {
        const [td, nd] = t.value.split('|');
        const cli = ST.clientes.find((c) => c.tipo_doc === td && c.numero_doc === nd);
        if (cli) {
          ST.form.cliente_tipo_doc = cli.tipo_doc;
          ST.form.cliente_doc = cli.numero_doc;
          ST.form.cliente_nombre = cli.razon_social || '';
          ST.form.cliente_direccion = cli.direccion || '';
          ST.form.cliente_telefono = cli.telefono || '';
          ST.form.cliente_email = cli.email || '';
          render();
        }
      }
      if (d.sactSel === 'pick-nc-ref' && t.value) {
        const ref = ST.comprobantes.find((c) => c.id === t.value);
        if (ref) {
          ST.ncForm = newNcForm(ref);
          render();
        }
      }
      if (d.sactSel === 'pick-gre-ref' && t.value) {
        const ref = ST.comprobantes.find((c) => c.id === t.value);
        if (ref) {
          ST.greForm = newGreForm(ref);
          render();
        }
      }
    });

    host.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'sunat-cat-q') {
        ST.catQuery = t.value;
        render();
        const el = document.getElementById('sunat-cat-q');
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
        return;
      }
      const d = t.dataset;
      if (d.ef) ST.form[d.ef] = t.value;
      else if (d.ei !== undefined) ST.form.items[Number(d.ei)][d.k] = t.value;
      else if (d.nf) ST.ncForm[d.nf] = t.value;
      else if (d.ni !== undefined) ST.ncForm.items[Number(d.ni)][d.k] = t.value;
      else if (d.gf) ST.greForm[d.gf] = t.value;
      else if (d.gd) ST.greForm.gre_datos[d.gd] = t.value;
      else if (d.gi !== undefined) ST.greForm.items[Number(d.gi)][d.k] = t.value;
      else if (d.cf) ST.config[d.cf] = t.value;
      else if (d.hf === 'q') {
        ST.histFilter.q = t.value;
        render();
        const el = host.querySelector('[data-hf="q"]');
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }
    });
  }

  window.SUNAT = {
    mostrar(v) {
      ST.visible = Boolean(v);
      bindHost();
      if (ST.visible && !ST.loaded) loadAll();
      render();
    },
    recargar() {
      return loadAll();
    }
  };
})();
