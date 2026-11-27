const { requireAuth, readJsonBody, sbRest, sendJson } = require('./_auth');
const nubefact = require('./_providers/nubefact');

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
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

  const id = String(body.id || '').trim();
  const motivo = String(body.motivo || 'ERROR EN EMISION').trim();
  if (!id) return sendJson(res, 400, { error: 'Falta el ID del comprobante a anular.' });

  const rows = await sbRest(auth.jwt, `/sunat_comprobantes?select=*&id=eq.${encodeURIComponent(id)}`);
  const doc = Array.isArray(rows) && rows[0];
  if (!doc) return sendJson(res, 404, { error: 'Comprobante no encontrado.' });
  if (doc.estado === 'anulado') return sendJson(res, 400, { error: 'Este comprobante ya está anulado.' });

  let provRes;
  try {
    provRes = await nubefact.anular(doc, motivo);
  } catch (e) {
    return sendJson(res, 502, { error: 'No se pudo anular en Nubefact/SUNAT: ' + e.message });
  }

  await sbRest(auth.jwt, `/sunat_comprobantes?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: {
      estado: 'anulado',
      sunat_mensaje: provRes.mensaje,
      updated_at: new Date().toISOString()
    }
  });

  // Si estaba sincronizado con Finanzas y Cobranzas, retirarlo automáticamente
  if (doc.sincronizado) {
    try {
      await sbRest(
        auth.jwt,
        `/pasega_docs?collection=eq.ventas&doc_id=eq.${encodeURIComponent(doc.doc_codigo)}`,
        { method: 'DELETE' }
      );
    } catch {}

    if (doc.forma_pago === 'CREDITO') {
      try {
        const repRows = await sbRest(
          auth.jwt,
          '/pasega_docs?select=data&collection=eq.cobranza&doc_id=eq.reporte'
        );
        const rep = Array.isArray(repRows) && repRows[0] && repRows[0].data;
        if (rep && Array.isArray(rep.filas)) {
          const filas = rep.filas.filter((f) => f && f.doc !== doc.doc_codigo);
          const sumaUsd = r2(filas.filter((f) => f.moneda === 'US$').reduce((a, f) => a + (Number(f.saldo) || 0), 0));
          await sbRest(auth.jwt, '/pasega_docs?on_conflict=collection,doc_id', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates' },
            body: {
              collection: 'cobranza',
              doc_id: 'reporte',
              data: { ...rep, filas, suma: sumaUsd, cargadoEn: new Date().toISOString() },
              updated_at: new Date().toISOString(),
              updated_by: auth.user.id
            }
          });
        }
      } catch {}
    }
  }

  return sendJson(res, 200, { ok: true, doc_codigo: doc.doc_codigo, mensaje: provRes.mensaje });
};
