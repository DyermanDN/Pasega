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
    ['04', '04 · Traslado entre establecimientos'],
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

  function injectStyles() {
    if (document.getElementById('sunat-ui-styles')) return;
    const s = document.createElement('style');
    s.id = 'sunat-ui-styles';
    s.textContent = `
      #sunat-host main{max-width:1260px;margin:0 auto;padding:18px 24px 64px}
      .sn-modebar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:9px 14px;border-radius:9px;margin-bottom:16px;font-size:12.5px;border:1px solid var(--line)}
      .sn-modebar.demo{background:var(--warn-bg);color:var(--warn);border-color:transparent}
      .sn-modebar.prod{background:var(--good-bg);color:var(--good);border-color:transparent}
      .sn-modebar.err{background:var(--bad-bg);color:var(--bad);border-color:transparent}
      .sn-modebar .sn-ml{display:flex;align-items:center;gap:8px;min-width:0}
      .sn-modebar button.sn-link{background:none;border:0;color:inherit;font-weight:600;text-decoration:underline;cursor:pointer;padding:0;white-space:nowrap}

      .sn-work{display:grid;grid-template-columns:minmax(0,1fr) 332px;gap:18px;align-items:start}
      .sn-col-main{display:flex;flex-direction:column;gap:16px;min-width:0}
      .sn-col-side{position:sticky;top:18px;display:flex;flex-direction:column;gap:14px;min-width:0}
      @media (max-width:1080px){.sn-work{grid-template-columns:minmax(0,1fr)}.sn-col-side{position:static}}

      .sn-box{background:var(--surface-1);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px}
      .sn-box-h{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--line)}
      .sn-box-h h2{margin:0;font-size:14.5px;font-weight:600;color:var(--text-primary)}
      .sn-box-h .sn-sub{font-size:12px;color:var(--text-muted)}

      .sn-topstrip{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 16px;background:var(--surface-1);border:1px solid var(--line);border-radius:var(--r)}
      .sn-topstrip-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .sn-inline-f{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);font-weight:500}
      .sn-inline-f select,.sn-inline-f input{min-height:34px;padding:5px 9px;font-size:13px}

      .sn-g12{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px}
      .sn-f{display:flex;flex-direction:column;gap:5px;min-width:0}
      .sn-f > span{font-size:12px;font-weight:500;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sn-f input,.sn-f select{width:100%;min-height:36px;padding:7px 10px}
      .c-2{grid-column:span 2}.c-3{grid-column:span 3}.c-4{grid-column:span 4}.c-5{grid-column:span 5}
      .c-6{grid-column:span 6}.c-7{grid-column:span 7}.c-8{grid-column:span 8}.c-9{grid-column:span 9}.c-12{grid-column:span 12}
      @media (max-width:740px){.sn-g12{grid-template-columns:repeat(6,minmax(0,1fr))}.c-2,.c-3{grid-column:span 3}.c-4,.c-5,.c-6,.c-7,.c-8,.c-9,.c-12{grid-column:span 6}}
      @media (max-width:500px){.sn-g12{grid-template-columns:1fr}.sn-g12 > *{grid-column:span 1!important}}

      .sn-input-btn{display:flex;align-items:stretch}
      .sn-input-btn input{border-radius:8px 0 0 8px;border-right:0;flex:1;min-width:0}
      .sn-input-btn button{border-radius:0 8px 8px 0;min-height:36px;padding:0 13px;white-space:nowrap}

      .sn-search-row{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
      .sn-search-wrap{position:relative;flex:1;min-width:220px}
      .sn-search-wrap input{width:100%;min-height:36px}
      .sn-drop-list{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:25;background:var(--surface-1);border:1px solid var(--line-strong);border-radius:9px;box-shadow:0 10px 28px rgba(10,20,40,.16);max-height:240px;overflow:auto}
      .sn-drop-item{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);padding:9px 12px;cursor:pointer;font-size:13px;color:var(--text-primary)}
      .sn-drop-item:last-child{border-bottom:0}
      .sn-drop-item:hover,.sn-drop-item:focus{background:var(--navy-soft);outline:none}

      .sn-tbl-wrap{overflow:auto;border:1px solid var(--line);border-radius:8px}
      .sn-tbl{width:100%;border-collapse:collapse;font-size:13px}
      .sn-tbl th{font-size:11px;font-weight:600;color:var(--text-secondary);background:var(--surface-2);padding:8px 8px;text-align:left;border-bottom:1px solid var(--line-strong);white-space:nowrap;text-transform:none;letter-spacing:0}
      .sn-tbl th.num,.sn-tbl td.num{text-align:right}
      .sn-tbl td{padding:6px 6px;border-bottom:1px solid var(--line);vertical-align:middle}
      .sn-tbl tbody tr:last-child td{border-bottom:0}
      .sn-tbl input{width:100%;min-height:33px;padding:5px 8px;font-size:13px;border-radius:6px}
      .sn-rm{width:28px;height:28px;border-radius:6px;border:1px solid transparent;background:none;color:var(--text-muted);cursor:pointer;display:grid;place-items:center;font-size:14px}
      .sn-rm:hover{background:var(--bad-bg);color:var(--bad)}

      .sn-side-box{background:var(--surface-1);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;display:flex;flex-direction:column;gap:14px}
      .sn-side-box h3{margin:0;font-size:14px;font-weight:600}
      .sn-seg-full{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line-strong);border-radius:8px;overflow:hidden;background:var(--surface-2)}
      .sn-seg-full button{border:0;background:none;padding:8px 10px;cursor:pointer;font-size:13px;font-weight:500;color:var(--text-secondary)}
      .sn-seg-full button.on{background:var(--navy);color:#fff}
      @media (prefers-color-scheme: dark){.sn-seg-full button.on{color:#0d1a2b}}

      .sn-pills{display:flex;gap:6px;flex-wrap:wrap}
      .sn-pill{border:1px solid var(--line-strong);background:var(--surface-1);border-radius:999px;padding:4px 10px;font-size:12px;cursor:pointer;color:var(--text-secondary)}
      .sn-pill:hover{border-color:var(--navy);color:var(--text-primary)}

      .sn-totbox{background:var(--surface-2);border-radius:9px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
      .sn-totrow{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;color:var(--text-secondary)}
      .sn-totrow b{color:var(--text-primary);font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
      .sn-totmain{display:flex;justify-content:space-between;align-items:baseline;padding-top:9px;margin-top:4px;border-top:1px solid var(--line-strong);font-size:15px;font-weight:600}
      .sn-totmain b{font-size:20px;font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;color:var(--navy)}

      .sn-submit{width:100%;min-height:42px;font-size:14.5px;font-weight:600}
      .sn-ghost{width:100%;background:none;border:0;color:var(--text-muted);font-size:12.5px;cursor:pointer;padding:4px}
      .sn-ghost:hover{color:var(--text-primary);text-decoration:underline}

      .sn-client-chip{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:4px 10px;border-radius:999px;background:var(--good-bg);color:var(--good);font-size:12px;font-weight:500}
      .sn-client-chip.warn{background:var(--warn-bg);color:var(--warn)}

      .sn-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
      @media (max-width:760px){.sn-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .sn-status-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;background:var(--surface-2);border-radius:8px;font-size:13px}
    `;
    document.head.appendChild(s);
  }

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
      cliente_sunat_ok: true,
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

    if (isDemo) {
      doc.setTextColor(235, 210, 210);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(46);
      doc.text('DEMO · SIN VALIDEZ SUNAT', 105, 155, { align: 'center', angle: 35 });
    }

    doc.setTextColor(...NAVY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(String(ST.config.razon_social || 'PASEGA IMPORTACIONES S.A.C.'), 14, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    if (ST.config.direccion) doc.text(String(ST.config.direccion), 14, 24);
    doc.text(`RUC: ${ST.config.ruc || '(Configurar en Facturación → Configuración)'}`, 14, 29);

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
      doc.text('Op. Gravada (Subtotal):', 132, y);
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

  function renderModeBar() {
    const isProd = ST.config.modo === 'produccion' && ST.status.nubefactConfigured;
    if (ST.schemaMissing) {
      return `<div class="sn-modebar err">
        <div class="sn-ml"><b>Faltan las tablas SUNAT en Supabase.</b> Ejecuta <code>supabase/sunat_schema.sql</code> en el SQL Editor y recarga.</div>
      </div>`;
    }
    if (isProd) {
      return `<div class="sn-modebar prod">
        <div class="sn-ml"><b>Producción SUNAT activa (Nubefact)</b> — Los comprobantes emitidos tienen validez tributaria oficial.</div>
        <button type="button" class="sn-link" data-stab="config">Ver configuración</button>
      </div>`;
    }
    return `<div class="sn-modebar demo">
      <div class="sn-ml"><b>Modo pruebas (Demo)</b> — Los comprobantes son simulados y no se envían a SUNAT real.</div>
      <button type="button" class="sn-link" data-stab="config">Conectar Nubefact</button>
    </div>`;
  }

  function renderLastResult() {
    if (!ST.lastResult) return '';
    const { comprobante: c, synced } = ST.lastResult;
    const syncNotes = [];
    if (synced && synced.ventas) syncNotes.push('Finanzas (Ventas)');
    if (synced && synced.cobranzas) syncNotes.push('Cobranzas (Crédito)');
    return `<div class="callout good" style="flex-direction:column;gap:8px;margin-bottom:16px">
      <div><b>✓ Comprobante emitido: ${esc(c.doc_codigo)}</b> (${esc((TIPOS[c.tipo] || {}).corto || c.tipo)})${syncNotes.length ? ` · Sincronizado con ${esc(syncNotes.join(' y '))}.` : ''}</div>
      <div class="row">
        <button type="button" class="btn sm primary" data-sact="pdf" data-id="${esc(c.id)}">${c.pdf_url ? 'Abrir PDF oficial' : 'Descargar PDF'}</button>
        ${c.xml_url ? `<a class="btn sm" href="${esc(c.xml_url)}" target="_blank" rel="noopener">XML</a>` : ''}
        ${c.cdr_url ? `<a class="btn sm" href="${esc(c.cdr_url)}" target="_blank" rel="noopener">CDR</a>` : ''}
        <a class="btn sm cb-wa" href="${esc(waComprobanteUrl(c))}" target="_blank" rel="noopener">Enviar WhatsApp</a>
        ${c.tipo === '01' || c.tipo === '03' ? `<button type="button" class="btn sm" data-sact="to-gre" data-id="${esc(c.id)}">Generar Guía (GRE)</button>` : ''}
        <button type="button" class="btn sm" data-sact="clear-res">Cerrar</button>
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
    const sellers = window.PASEGA_CTX && window.PASEGA_CTX.getVendedores ? window.PASEGA_CTX.getVendedores() : [];
    const isProd = ST.config.modo === 'produccion' && ST.status.nubefactConfigured;

    return `
      ${renderLastResult()}
      <div class="sn-work">
        <div class="sn-col-main">
          <!-- Barra superior del comprobante -->
          <div class="sn-topstrip">
            <div class="seg" role="group" aria-label="Tipo de comprobante">
              <button type="button" class="${F.tipo === '01' ? 'on' : ''}" data-sact="set-tipo" data-val="01">Factura (01)</button>
              <button type="button" class="${F.tipo === '03' ? 'on' : ''}" data-sact="set-tipo" data-val="03">Boleta (03)</button>
            </div>
            <div class="sn-topstrip-right">
              <label class="sn-inline-f">Serie
                <select data-ef="serie" aria-label="Serie">
                  ${sers.map((s) => `<option value="${esc(s.serie)}" ${F.serie === s.serie ? 'selected' : ''}>${esc(s.serie)} · #${s.ultimo_numero + 1}</option>`).join('')}
                </select>
              </label>
              <label class="sn-inline-f">Fecha
                <input type="date" data-ef="fecha_emision" value="${esc(F.fecha_emision)}" aria-label="Fecha de emisión">
              </label>
              <div class="seg" role="group" aria-label="Moneda">
                <button type="button" class="${F.moneda === 'USD' ? 'on' : ''}" data-sact="set-moneda" data-val="USD">US$</button>
                <button type="button" class="${F.moneda === 'PEN' ? 'on' : ''}" data-sact="set-moneda" data-val="PEN">S/</button>
              </div>
            </div>
          </div>

          <!-- Bloque Cliente -->
          <section class="sn-box">
            <div class="sn-box-h">
              <h2>Cliente</h2>
              ${ST.clientes.length ? `<select data-sact-sel="pick-client" aria-label="Seleccionar cliente guardado" style="min-height:30px;padding:3px 9px;font-size:12.5px;max-width:290px">
                <option value="">Clientes guardados (${ST.clientes.length})…</option>
                ${ST.clientes.slice(0, 80).map((c) => `<option value="${esc(c.tipo_doc + '|' + c.numero_doc)}">${esc(c.numero_doc)} · ${esc(c.razon_social)}</option>`).join('')}
              </select>` : '<span class="sn-sub">Consulta automática por RUC o DNI</span>'}
            </div>
            <div class="sn-g12">
              <label class="sn-f c-2">
                <span>Documento</span>
                <select data-ef="cliente_tipo_doc">
                  <option value="6" ${F.cliente_tipo_doc === '6' ? 'selected' : ''}>RUC</option>
                  <option value="1" ${F.cliente_tipo_doc === '1' ? 'selected' : ''}>DNI</option>
                  <option value="0" ${F.cliente_tipo_doc === '0' ? 'selected' : ''}>Varios</option>
                </select>
              </label>
              <label class="sn-f c-4">
                <span>Número</span>
                <div class="sn-input-btn">
                  <input type="text" data-ef="cliente_doc" value="${esc(F.cliente_doc)}" placeholder="${F.cliente_tipo_doc === '6' ? '20123456789' : '12345678'}">
                  <button type="button" class="btn primary" data-sact="lookup-client" ${ST.busy ? 'disabled' : ''}>Buscar</button>
                </div>
              </label>
              <label class="sn-f c-6">
                <span>Razón social o nombre</span>
                <input type="text" data-ef="cliente_nombre" value="${esc(F.cliente_nombre)}" placeholder="EMPRESA CLIENTE S.A.C.">
              </label>
              <label class="sn-f c-6">
                <span>Dirección fiscal</span>
                <input type="text" data-ef="cliente_direccion" value="${esc(F.cliente_direccion)}" placeholder="Av. Principal 123, Lima">
              </label>
              <label class="sn-f c-3">
                <span>Teléfono</span>
                <input type="text" data-ef="cliente_telefono" value="${esc(F.cliente_telefono)}" placeholder="999 888 777">
              </label>
              <label class="sn-f c-3">
                <span>Correo</span>
                <input type="text" data-ef="cliente_email" value="${esc(F.cliente_email)}" placeholder="correo@empresa.com">
              </label>
            </div>
            ${F.cliente_sunat_info ? `<div class="sn-client-chip ${F.cliente_sunat_ok ? '' : 'warn'}">${esc(F.cliente_sunat_info)}</div>` : ''}
          </section>

          <!-- Bloque Productos -->
          <section class="sn-box">
            <div class="sn-box-h">
              <h2>Productos</h2>
              <div class="seg" role="group" aria-label="Modo de precios">
                <button type="button" class="${!F.precio_incluye_igv ? 'on' : ''}" data-sact="igv-mode" data-val="0">Sin IGV</button>
                <button type="button" class="${F.precio_incluye_igv ? 'on' : ''}" data-sact="igv-mode" data-val="1">Con IGV (${ST.config.igv_pct || 18}%)</button>
              </div>
            </div>

            <div class="sn-search-row">
              <div class="sn-search-wrap">
                <input type="search" id="sunat-cat-q" value="${esc(ST.catQuery)}" placeholder="Buscar en tu catálogo por código o nombre…">
                ${matches.length ? `<div class="sn-drop-list" role="listbox">
                  ${matches.map((p) => `<button type="button" class="sn-drop-item" data-sact="add-cat" data-code="${esc(p.code)}" data-name="${esc(p.name)}">
                    <span><b>${esc(p.code || 'S/C')}</b> · ${esc(p.name)}</span>
                    <span class="muted small">${p.stock != null ? `Stock: ${fmt(p.stock, 0)}` : ''}</span>
                  </button>`).join('')}
                </div>` : ''}
              </div>
              <button type="button" class="btn" data-sact="add-line">+ Agregar fila</button>
            </div>

            <div class="sn-tbl-wrap">
              <table class="sn-tbl">
                <thead>
                  <tr>
                    <th style="width:110px">Código</th>
                    <th>Descripción</th>
                    <th style="width:74px">Unid.</th>
                    <th class="num" style="width:78px">Cant.</th>
                    <th class="num" style="width:112px">${F.precio_incluye_igv ? 'Precio (c/IGV)' : 'Valor (s/IGV)'}</th>
                    <th class="num" style="width:104px">Total</th>
                    <th style="width:36px"></th>
                  </tr>
                </thead>
                <tbody>
                  ${F.items.map((it, idx) => {
                    const ln = T.lines[idx] || { tot: 0 };
                    return `<tr>
                      <td><input type="text" data-ei="${idx}" data-k="codigo" value="${esc(it.codigo)}" placeholder="COD"></td>
                      <td><input type="text" data-ei="${idx}" data-k="descripcion" value="${esc(it.descripcion)}" placeholder="Descripción del producto"></td>
                      <td><input type="text" data-ei="${idx}" data-k="unidad" value="${esc(it.unidad || 'UND')}"></td>
                      <td><input type="number" step="any" min="0" data-ei="${idx}" data-k="cant" value="${esc(it.cant)}" style="text-align:right"></td>
                      <td><input type="number" step="any" min="0" data-ei="${idx}" data-k="precio" value="${esc(it.precio)}" placeholder="0.00" style="text-align:right"></td>
                      <td class="num mono" data-line-tot="${idx}"><b>${sym} ${fmt(ln.tot)}</b></td>
                      <td><button type="button" class="sn-rm" data-sact="del-line" data-idx="${idx}" aria-label="Quitar fila" title="Quitar fila">×</button></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <!-- Columna derecha fija: Resumen y Emisión -->
        <aside class="sn-col-side">
          <div class="sn-side-box">
            <h3>Pago y emisión</h3>

            <div class="sn-g12">
              <label class="sn-f c-7">
                <span>Vendedor</span>
                <input type="text" list="psg-vends-dl" data-ef="vendedor" value="${esc(F.vendedor)}" placeholder="Opcional">
                <datalist id="psg-vends-dl">${sellers.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>
              </label>
              <label class="sn-f c-5">
                <span>Tipo de cambio</span>
                <input type="number" step="0.001" data-ef="tipo_cambio" value="${esc(F.tipo_cambio)}">
              </label>
            </div>

            <div class="sn-f">
              <span>Forma de pago</span>
              <div class="sn-seg-full" role="group" aria-label="Forma de pago">
                <button type="button" class="${F.forma_pago === 'CONTADO' ? 'on' : ''}" data-sact="set-pago" data-val="CONTADO">Contado</button>
                <button type="button" class="${F.forma_pago === 'CREDITO' ? 'on' : ''}" data-sact="set-pago" data-val="CREDITO">Crédito</button>
              </div>
            </div>

            ${F.forma_pago === 'CREDITO' ? `
              <div class="sn-f">
                <span>Vencimiento</span>
                <input type="date" data-ef="fecha_vcto" value="${esc(F.fecha_vcto)}">
              </div>
              <div class="sn-pills">
                ${[15, 30, 45, 60].map((d) => `<button type="button" class="sn-pill" data-sact="set-dias" data-d="${d}">+${d} días</button>`).join('')}
              </div>
              <div class="small muted" style="margin-top:-6px">Entrará automáticamente a <b>Cobranzas</b>.</div>
            ` : ''}

            <label class="sn-f">
              <span>Observaciones</span>
              <input type="text" data-ef="observaciones" value="${esc(F.observaciones)}" placeholder="Orden de compra o nota">
            </label>

            <div class="sn-totbox">
              <div class="sn-totrow"><span>Op. gravada</span><b id="sn-tot-sub">${sym} ${fmt(T.sub)}</b></div>
              <div class="sn-totrow"><span>IGV (${ST.config.igv_pct || 18}%)</span><b id="sn-tot-igv">${sym} ${fmt(T.igv)}</b></div>
              <div class="sn-totmain"><span>Total</span><b id="sn-tot-all">${sym} ${fmt(T.tot)}</b></div>
            </div>

            <label class="chk small">
              <input type="checkbox" data-ef-chk="sincronizar" ${F.sincronizar ? 'checked' : ''}>
              Sincronizar con Finanzas y Cobranzas
            </label>

            <button type="button" class="btn primary sn-submit" data-sact="submit-emit" ${ST.busy || !canWrite() || ST.schemaMissing ? 'disabled' : ''}>
              ${ST.busy ? 'Emitiendo…' : (isProd ? `Emitir ${F.tipo === '03' ? 'Boleta' : 'Factura'} a SUNAT` : `Emitir ${F.tipo === '03' ? 'Boleta' : 'Factura'} (Demo)`)}
            </button>
            <button type="button" class="sn-ghost" data-sact="reset-emit">Limpiar formulario</button>
          </div>
        </aside>
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
      <div class="sn-work">
        <div class="sn-col-main">
          <section class="sn-box">
            <div class="sn-box-h">
              <h2>Comprobante de referencia</h2>
              <span class="sn-sub">Anula o ajusta una Factura o Boleta emitida</span>
            </div>
            <div class="sn-g12">
              <label class="sn-f c-8">
                <span>Elegir comprobante emitido</span>
                <select data-sact-sel="pick-nc-ref">
                  <option value="">— Selecciona una Factura o Boleta —</option>
                  ${refs.map((c) => `<option value="${esc(c.id)}" ${F.ref_id === c.id ? 'selected' : ''}>${esc(c.doc_codigo)} · ${esc(c.cliente_nombre)} · ${c.moneda === 'PEN' ? 'S/' : 'US$'} ${fmt(c.total)}</option>`).join('')}
                </select>
              </label>
              <label class="sn-f c-4">
                <span>O escribir número</span>
                <input type="text" data-nf="ref_doc" value="${esc(F.ref_doc)}" placeholder="F002-00000001">
              </label>
              <label class="sn-f c-4">
                <span>RUC / DNI Cliente</span>
                <input type="text" data-nf="cliente_doc" value="${esc(F.cliente_doc)}">
              </label>
              <label class="sn-f c-8">
                <span>Cliente</span>
                <input type="text" data-nf="cliente_nombre" value="${esc(F.cliente_nombre)}">
              </label>
            </div>
          </section>

          <section class="sn-box">
            <div class="sn-box-h">
              <h2>Detalle de ítems</h2>
              <button type="button" class="btn sm" data-sact="add-nc-line">+ Agregar fila</button>
            </div>
            <div class="sn-tbl-wrap">
              <table class="sn-tbl">
                <thead><tr><th style="width:110px">Código</th><th>Descripción</th><th class="num" style="width:82px">Cant.</th><th class="num" style="width:115px">Valor (s/IGV)</th><th class="num" style="width:105px">Total</th><th style="width:36px"></th></tr></thead>
                <tbody>
                  ${F.items.map((it, idx) => {
                    const ln = T.lines[idx] || { tot: 0 };
                    return `<tr>
                      <td><input type="text" data-ni="${idx}" data-k="codigo" value="${esc(it.codigo)}"></td>
                      <td><input type="text" data-ni="${idx}" data-k="descripcion" value="${esc(it.descripcion)}"></td>
                      <td><input type="number" step="any" data-ni="${idx}" data-k="cant" value="${esc(it.cant)}" style="text-align:right"></td>
                      <td><input type="number" step="any" data-ni="${idx}" data-k="precio" value="${esc(it.precio)}" style="text-align:right"></td>
                      <td class="num mono"><b>${sym} ${fmt(ln.tot)}</b></td>
                      <td><button type="button" class="sn-rm" data-sact="del-nc-line" data-idx="${idx}" aria-label="Quitar">×</button></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside class="sn-col-side">
          <div class="sn-side-box">
            <h3>Nota de Crédito (07)</h3>
            <div class="sn-g12">
              <label class="sn-f c-6">
                <span>Serie</span>
                <select data-nf="serie">
                  ${sers.map((s) => `<option value="${esc(s.serie)}" ${F.serie === s.serie ? 'selected' : ''}>${esc(s.serie)} · #${s.ultimo_numero + 1}</option>`).join('')}
                </select>
              </label>
              <label class="sn-f c-6">
                <span>Fecha</span>
                <input type="date" data-nf="fecha_emision" value="${esc(F.fecha_emision)}">
              </label>
              <label class="sn-f c-12">
                <span>Motivo SUNAT</span>
                <select data-nf="motivo_nc">
                  ${MOTIVOS_NC.map(([k, lbl]) => `<option value="${k}" ${F.motivo_nc === k ? 'selected' : ''}>${esc(lbl)}</option>`).join('')}
                </select>
              </label>
              <label class="sn-f c-12">
                <span>Moneda</span>
                <select data-nf="moneda">
                  <option value="USD" ${F.moneda === 'USD' ? 'selected' : ''}>Dólares (US$)</option>
                  <option value="PEN" ${F.moneda === 'PEN' ? 'selected' : ''}>Soles (S/)</option>
                </select>
              </label>
            </div>
            <div class="sn-totbox">
              <div class="sn-totrow"><span>Op. gravada</span><b>${sym} ${fmt(T.sub)}</b></div>
              <div class="sn-totrow"><span>IGV (${ST.config.igv_pct || 18}%)</span><b>${sym} ${fmt(T.igv)}</b></div>
              <div class="sn-totmain"><span>Total NC</span><b>${sym} ${fmt(T.tot)}</b></div>
            </div>
            <button type="button" class="btn primary sn-submit" data-sact="submit-nc" ${ST.busy || !canWrite() || ST.schemaMissing ? 'disabled' : ''}>
              ${ST.busy ? 'Emitiendo…' : 'Emitir Nota de Crédito'}
            </button>
          </div>
        </aside>
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
      <div class="sn-work">
        <div class="sn-col-main">
          <section class="sn-box">
            <div class="sn-box-h">
              <h2>Destinatario y ruta</h2>
              ${refs.length ? `<select data-sact-sel="pick-gre-ref" aria-label="Precargar desde factura" style="min-height:30px;padding:3px 9px;font-size:12.5px;max-width:290px">
                <option value="">Precargar desde factura…</option>
                ${refs.map((c) => `<option value="${esc(c.id)}">${esc(c.doc_codigo)} · ${esc(c.cliente_nombre)}</option>`).join('')}
              </select>` : ''}
            </div>
            <div class="sn-g12">
              <label class="sn-f c-4">
                <span>RUC / DNI destinatario</span>
                <input type="text" data-gf="cliente_doc" value="${esc(F.cliente_doc)}" placeholder="20123456789">
              </label>
              <label class="sn-f c-8">
                <span>Razón social destinatario</span>
                <input type="text" data-gf="cliente_nombre" value="${esc(F.cliente_nombre)}" placeholder="EMPRESA DESTINO S.A.C.">
              </label>
              <label class="sn-f c-3">
                <span>Ubigeo partida</span>
                <input type="text" maxlength="6" data-gd="partida_ubigeo" value="${esc(G.partida_ubigeo)}">
              </label>
              <label class="sn-f c-9">
                <span>Dirección de partida</span>
                <input type="text" data-gd="partida_direccion" value="${esc(G.partida_direccion)}" placeholder="Almacén PASEGA">
              </label>
              <label class="sn-f c-3">
                <span>Ubigeo llegada</span>
                <input type="text" maxlength="6" data-gd="llegada_ubigeo" value="${esc(G.llegada_ubigeo)}">
              </label>
              <label class="sn-f c-9">
                <span>Dirección de llegada</span>
                <input type="text" data-gd="llegada_direccion" value="${esc(G.llegada_direccion)}" placeholder="Dirección de entrega">
              </label>
            </div>
          </section>

          <section class="sn-box">
            <div class="sn-box-h">
              <h2>Bienes a trasladar</h2>
              <button type="button" class="btn sm" data-sact="add-gre-line">+ Agregar bien</button>
            </div>
            <div class="sn-tbl-wrap">
              <table class="sn-tbl">
                <thead><tr><th style="width:115px">Código</th><th>Descripción</th><th style="width:82px">Unid.</th><th class="num" style="width:92px">Cantidad</th><th style="width:36px"></th></tr></thead>
                <tbody>
                  ${F.items.map((it, idx) => `<tr>
                    <td><input type="text" data-gi="${idx}" data-k="codigo" value="${esc(it.codigo)}"></td>
                    <td><input type="text" data-gi="${idx}" data-k="descripcion" value="${esc(it.descripcion)}"></td>
                    <td><input type="text" data-gi="${idx}" data-k="unidad" value="${esc(it.unidad || 'UND')}"></td>
                    <td><input type="number" step="any" data-gi="${idx}" data-k="cant" value="${esc(it.cant)}" style="text-align:right"></td>
                    <td><button type="button" class="sn-rm" data-sact="del-gre-line" data-idx="${idx}" aria-label="Quitar">×</button></td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside class="sn-col-side">
          <div class="sn-side-box">
            <h3>Traslado y transporte</h3>
            <div class="sn-g12">
              <label class="sn-f c-6">
                <span>Serie GRE</span>
                <select data-gf="serie">
                  ${sers.map((s) => `<option value="${esc(s.serie)}" ${F.serie === s.serie ? 'selected' : ''}>${esc(s.serie)} · #${s.ultimo_numero + 1}</option>`).join('')}
                </select>
              </label>
              <label class="sn-f c-6">
                <span>Inicio traslado</span>
                <input type="date" data-gd="fecha_traslado" value="${esc(G.fecha_traslado)}">
              </label>
              <label class="sn-f c-12">
                <span>Motivo de traslado</span>
                <select data-gd="motivo">
                  ${MOTIVOS_GRE.map(([k, lbl]) => `<option value="${k}" ${G.motivo === k ? 'selected' : ''}>${esc(lbl)}</option>`).join('')}
                </select>
              </label>
              <label class="sn-f c-6">
                <span>Peso bruto (KG)</span>
                <input type="number" step="0.1" min="0.1" data-gd="peso_bruto" value="${esc(G.peso_bruto)}">
              </label>
              <label class="sn-f c-6">
                <span>Bultos</span>
                <input type="number" min="1" data-gd="bultos" value="${esc(G.bultos)}">
              </label>
            </div>

            <div class="sn-f">
              <span>Modalidad</span>
              <div class="sn-seg-full">
                <button type="button" class="${priv ? 'on' : ''}" data-sact="gre-mod" data-val="02">Privado</button>
                <button type="button" class="${!priv ? 'on' : ''}" data-sact="gre-mod" data-val="01">Público</button>
              </div>
            </div>

            <div class="sn-g12">
              ${priv ? `
                <label class="sn-f c-6"><span>Placa</span><input type="text" data-gd="placa" value="${esc(G.placa)}" placeholder="ABC123"></label>
                <label class="sn-f c-6"><span>DNI conductor</span><input type="text" data-gd="conductor_dni" value="${esc(G.conductor_dni)}"></label>
                <label class="sn-f c-6"><span>Nombres</span><input type="text" data-gd="conductor_nombre" value="${esc(G.conductor_nombre)}"></label>
                <label class="sn-f c-6"><span>Apellidos</span><input type="text" data-gd="conductor_apellidos" value="${esc(G.conductor_apellidos)}"></label>
                <label class="sn-f c-12"><span>Licencia (brevete)</span><input type="text" data-gd="conductor_licencia" value="${esc(G.conductor_licencia)}" placeholder="Q12345678"></label>
              ` : `
                <label class="sn-f c-12"><span>RUC transportista</span><input type="text" data-gd="transportista_ruc" value="${esc(G.transportista_ruc)}" placeholder="20..."></label>
                <label class="sn-f c-12"><span>Razón social transportista</span><input type="text" data-gd="transportista_nombre" value="${esc(G.transportista_nombre)}"></label>
                <label class="sn-f c-12"><span>Placa (opcional)</span><input type="text" data-gd="placa" value="${esc(G.placa)}"></label>
              `}
            </div>

            <button type="button" class="btn primary sn-submit" data-sact="submit-gre" ${ST.busy || !canWrite() || ST.schemaMissing ? 'disabled' : ''}>
              ${ST.busy ? 'Emitiendo…' : 'Emitir Guía de Remisión'}
            </button>
          </div>
        </aside>
      </div>`;
  }

  function renderHistorial() {
    const q = (ST.histFilter.q || '').toLowerCase().trim();
    const list = ST.comprobantes.filter((c) => {
      if (ST.histFilter.tipo && c.tipo !== ST.histFilter.tipo) return false;
      if (q && !`${c.doc_codigo} ${c.cliente_nombre} ${c.cliente_doc} ${c.vendedor}`.toLowerCase().includes(q)) return false;
      return true;
    });

    const activos = ST.comprobantes.filter((c) => c.estado !== 'anulado');
    const nFact = activos.filter((c) => c.tipo === '01' || c.tipo === '03').length;
    const nCred = activos.filter((c) => (c.tipo === '01' || c.tipo === '03') && c.forma_pago === 'CREDITO').length;
    const nGre = activos.filter((c) => c.tipo === '09').length;

    const estBadge = (c) => {
      if (c.estado === 'aceptado') return '<span class="badge good">✓ SUNAT</span>';
      if (c.estado === 'demo') return '<span class="badge warn">Demo</span>';
      if (c.estado === 'anulado') return '<span class="badge bad">Anulado</span>';
      if (c.estado === 'rechazado') return '<span class="badge bad">Rechazado</span>';
      return `<span class="badge neutral">${esc(c.estado)}</span>`;
    };

    return `
      <div class="sn-kpis">
        <div class="kpi"><div class="l">Comprobantes emitidos</div><div class="v">${ST.comprobantes.length}</div><div class="s">Desde este módulo</div></div>
        <div class="kpi"><div class="l">Facturas y boletas</div><div class="v">${nFact}</div><div class="s">Activos</div></div>
        <div class="kpi"><div class="l">Ventas al crédito</div><div class="v">${nCred}</div><div class="s">Enviadas a Cobranzas</div></div>
        <div class="kpi"><div class="l">Guías de remisión</div><div class="v">${nGre}</div><div class="s">GRE remitente</div></div>
      </div>

      <section class="sn-box">
        <div class="sn-box-h">
          <h2>Historial de emisión</h2>
          <button type="button" class="btn sm" data-sact="refresh">Actualizar</button>
        </div>
        <div class="filters" style="margin-bottom:12px">
          <label>Tipo
            <select data-hf="tipo">
              <option value="">Todos</option>
              <option value="01" ${ST.histFilter.tipo === '01' ? 'selected' : ''}>Facturas (01)</option>
              <option value="03" ${ST.histFilter.tipo === '03' ? 'selected' : ''}>Boletas (03)</option>
              <option value="07" ${ST.histFilter.tipo === '07' ? 'selected' : ''}>Notas de Crédito (07)</option>
              <option value="09" ${ST.histFilter.tipo === '09' ? 'selected' : ''}>Guías de Remisión (09)</option>
            </select>
          </label>
          <label style="flex:1;min-width:200px">Buscar
            <input type="search" data-hf="q" value="${esc(ST.histFilter.q)}" placeholder="Número, cliente, RUC o vendedor…">
          </label>
        </div>

        ${list.length ? `<div class="sn-tbl-wrap"><table class="sn-tbl">
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
                    <button type="button" class="btn sm" data-sact="to-nc" data-id="${esc(c.id)}">NC</button>
                    <button type="button" class="btn sm" data-sact="to-gre" data-id="${esc(c.id)}">GRE</button>
                  ` : ''}
                  ${c.estado !== 'anulado' && canWrite() ? `<button type="button" class="btn sm danger" data-sact="anular" data-id="${esc(c.id)}">Anular</button>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>` : `<div class="empty"><div class="big">Aún no hay comprobantes emitidos</div><div>Usa la pestaña <b>Emitir</b> para probar tu primera Factura o Boleta en Modo Demo.</div></div>`}
      </section>`;
  }

  function renderConfig() {
    const C = ST.config;
    return `
      <div class="grid2">
        <section class="sn-box">
          <div class="sn-box-h">
            <h2>Datos fiscales de PASEGA</h2>
            <span class="sn-sub">Aparecen en tus PDFs y Guías</span>
          </div>
          <div class="sn-g12">
            <label class="sn-f c-6"><span>RUC</span><input type="text" maxlength="11" data-cf="ruc" value="${esc(C.ruc)}" placeholder="20..."></label>
            <label class="sn-f c-3"><span>Ubigeo</span><input type="text" maxlength="6" data-cf="ubigeo" value="${esc(C.ubigeo)}"></label>
            <label class="sn-f c-3"><span>IGV (%)</span><input type="number" step="0.5" data-cf="igv_pct" value="${esc(C.igv_pct)}"></label>
            <label class="sn-f c-12"><span>Razón social</span><input type="text" data-cf="razon_social" value="${esc(C.razon_social)}"></label>
            <label class="sn-f c-12"><span>Dirección fiscal</span><input type="text" data-cf="direccion" value="${esc(C.direccion)}" placeholder="Av. ... Lima"></label>
            <label class="sn-f c-12"><span>Modo de emisión</span>
              <select data-cf="modo">
                <option value="demo" ${C.modo !== 'produccion' ? 'selected' : ''}>Modo Demo (pruebas sin enviar a SUNAT)</option>
                <option value="produccion" ${C.modo === 'produccion' ? 'selected' : ''} ${ST.status.nubefactConfigured ? '' : 'disabled'}>Producción SUNAT (Nubefact)${ST.status.nubefactConfigured ? '' : ' · falta configurar Vercel'}</option>
              </select>
            </label>
          </div>
          <div class="row" style="justify-content:flex-end;margin-top:14px">
            <button type="button" class="btn primary" data-sact="save-config" ${!canWrite() || ST.schemaMissing ? 'disabled' : ''}>Guardar cambios</button>
          </div>
        </section>

        <section class="sn-box">
          <div class="sn-box-h">
            <h2>Conexión Nubefact y Series</h2>
            <span class="sn-sub">Credenciales guardadas en Vercel</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
            <div class="sn-status-row">
              <span>Nubefact API (<code>NUBEFACT_URL</code> + <code>NUBEFACT_TOKEN</code>)</span>
              <span class="badge ${ST.status.nubefactConfigured ? 'good' : 'warn'}">${ST.status.nubefactConfigured ? '✓ Conectado' : 'Modo Demo'}</span>
            </div>
            <div class="sn-status-row">
              <span>Consulta RUC/DNI dedicada (<code>RUC_API_TOKEN</code>)</span>
              <span class="badge ${ST.status.rucApiConfigured ? 'good' : 'neutral'}">${ST.status.rucApiConfigured ? '✓ Activa' : 'Respaldo gratis'}</span>
            </div>
          </div>

          <div class="sn-tbl-wrap">
            <table class="sn-tbl">
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
        </section>
      </div>`;
  }

  function updateEmitTotalsInPlace() {
    if (!ST.form) return;
    const T = calcTotals(ST.form.items, ST.form.precio_incluye_igv);
    const sym = ST.form.moneda === 'PEN' ? 'S/' : 'US$';
    const sub = document.getElementById('sn-tot-sub');
    const igv = document.getElementById('sn-tot-igv');
    const all = document.getElementById('sn-tot-all');
    if (sub) sub.textContent = `${sym} ${fmt(T.sub)}`;
    if (igv) igv.textContent = `${sym} ${fmt(T.igv)}`;
    if (all) all.textContent = `${sym} ${fmt(T.tot)}`;
    T.lines.forEach((ln, idx) => {
      const cell = document.querySelector(`#sunat-host [data-line-tot="${idx}"]`);
      if (cell) cell.innerHTML = `<b>${sym} ${fmt(ln.tot)}</b>`;
    });
  }

  function render() {
    injectStyles();
    const host = document.getElementById('sunat-host');
    if (!host) return;
    host.hidden = !ST.visible;
    if (!ST.visible) return;

    const tabs = [
      ['emitir', 'Emitir'],
      ['nc', 'Notas de Crédito'],
      ['gre', 'Guías (GRE)'],
      ['historial', `Historial (${ST.comprobantes.length})`],
      ['config', 'Configuración']
    ];

    const body = !ST.loaded
      ? '<div class="sn-box empty"><div class="big">Cargando módulo de facturación…</div></div>'
      : ST.tab === 'nc' ? renderNc()
      : ST.tab === 'gre' ? renderGre()
      : ST.tab === 'historial' ? renderHistorial()
      : ST.tab === 'config' ? renderConfig()
      : renderEmitir();

    const isProd = ST.config.modo === 'produccion' && ST.status.nubefactConfigured;

    host.innerHTML = `
      <header class="top">
        <div class="brand">
          <div>
            <h1>Facturación Electrónica · SUNAT</h1>
            <div class="sub">Facturas, Boletas, Notas de Crédito y Guías integradas con Finanzas y Cobranzas</div>
          </div>
          <div class="status">
            <span class="dot ${isProd ? '' : 'off'}"></span>
            ${isProd ? 'Producción SUNAT' : 'Modo Demo'}
          </div>
        </div>
        <nav class="tabs">
          ${tabs.map(([id, lbl]) => `<button type="button" class="${ST.tab === id ? 'on' : ''}" data-stab="${id}">${esc(lbl)}</button>`).join('')}
        </nav>
      </header>
      <main>
        ${renderModeBar()}
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
    if (act === 'set-tipo') {
      const v = el.dataset.val === '03' ? '03' : '01';
      ST.form.tipo = v;
      const sers = seriesByTipo(v);
      ST.form.serie = (sers[0] && sers[0].serie) || (v === '03' ? 'B002' : 'F002');
      ST.form.cliente_tipo_doc = v === '01' ? '6' : '1';
      render();
      return;
    }
    if (act === 'set-moneda') {
      ST.form.moneda = el.dataset.val === 'PEN' ? 'PEN' : 'USD';
      render();
      return;
    }
    if (act === 'set-pago') {
      ST.form.forma_pago = el.dataset.val === 'CREDITO' ? 'CREDITO' : 'CONTADO';
      render();
      return;
    }
    if (act === 'gre-mod') {
      ST.greForm.gre_datos.modalidad = el.dataset.val === '01' ? '01' : '02';
      render();
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
          F.cliente_sunat_ok = true;
          F.cliente_sunat_info = `✓ ${res.source === 'cache' ? 'Cliente guardado' : 'Padrón SUNAT/RENIEC'}${stParts ? ' · ' + stParts : ''}`;
        } else {
          F.cliente_sunat_ok = false;
          F.cliente_sunat_info = res.message || 'No encontrado. Ingresa los datos manualmente.';
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
        ST.msg = '<div class="callout good"><div>Configuración guardada.</div></div>';
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
        if (d.ef === 'cliente_tipo_doc' || d.ef === 'serie' || d.ef === 'fecha_emision') render();
        return;
      }
      if (d.efChk) {
        ST.form[d.efChk] = t.checked;
        return;
      }
      if (d.ei !== undefined) {
        ST.form.items[Number(d.ei)][d.k] = t.value;
        updateEmitTotalsInPlace();
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
          ST.form.cliente_sunat_ok = true;
          ST.form.cliente_sunat_info = '✓ Cliente cargado';
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
      else if (d.ei !== undefined) {
        ST.form.items[Number(d.ei)][d.k] = t.value;
        if (d.k === 'cant' || d.k === 'precio') updateEmitTotalsInPlace();
      } else if (d.nf) ST.ncForm[d.nf] = t.value;
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
