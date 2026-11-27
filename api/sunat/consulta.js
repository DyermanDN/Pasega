const { requireAuth, sbRest, sendJson } = require('./_auth');

async function lookupExternal(tipo, numero) {
  const token = (process.env.RUC_API_TOKEN || '').trim();
  const isRuc = tipo === 'ruc';

  // 1. Si hay token configurado (apis.net.pe v2), usar endpoint autenticado
  if (token) {
    const endpoint = isRuc
      ? `https://api.apis.net.pe/v2/sunat/ruc?numero=${encodeURIComponent(numero)}`
      : `https://api.apis.net.pe/v2/reniec/dni?numero=${encodeURIComponent(numero)}`;
    const r = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    if (r.ok) {
      const d = await r.json();
      if (isRuc && (d.razonSocial || d.nombre)) {
        return {
          razon_social: String(d.razonSocial || d.nombre).trim(),
          direccion: String(d.direccion || '').trim(),
          ubigeo: String(d.ubigeo || '').trim(),
          estado_sunat: String(d.estado || '').trim(),
          condicion_sunat: String(d.condicion || '').trim()
        };
      }
      if (!isRuc && (d.nombreCompleto || d.nombres)) {
        const full = d.nombreCompleto || [d.nombres, d.apellidoPaterno, d.apellidoMaterno].filter(Boolean).join(' ');
        return {
          razon_social: String(full).trim(),
          direccion: '',
          ubigeo: '',
          estado_sunat: 'ACTIVO',
          condicion_sunat: 'HABIDO'
        };
      }
    }
  }

  // 2. Respaldo gratuito público (apis.net.pe v1) si no hay token configurado
  const freeUrl = isRuc
    ? `https://api.apis.net.pe/v1/ruc?numero=${encodeURIComponent(numero)}`
    : `https://api.apis.net.pe/v1/dni?numero=${encodeURIComponent(numero)}`;
  try {
    const r = await fetch(freeUrl, { headers: { Accept: 'application/json' } });
    if (r.ok) {
      const d = await r.json();
      if (d && d.nombre) {
        return {
          razon_social: String(d.nombre).trim(),
          direccion: String(d.direccion || '').trim(),
          ubigeo: String(d.ubigeo || '').trim(),
          estado_sunat: String(d.estado || '').trim(),
          condicion_sunat: String(d.condicion || '').trim()
        };
      }
    }
  } catch (e) {
    // Fallback silencioso
  }

  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método no permitido' });
  const auth = await requireAuth(req, res, { requireWrite: false });
  if (!auth) return;

  const urlObj = new URL(req.url, 'http://localhost');
  const rawTipo = String(urlObj.searchParams.get('tipo') || '').toLowerCase();
  const numero = String(urlObj.searchParams.get('numero') || '').replace(/\D/g, '');
  const tipo = rawTipo === 'dni' || (!rawTipo && numero.length === 8) ? 'dni' : 'ruc';

  if (tipo === 'ruc' && numero.length !== 11) {
    return sendJson(res, 400, { error: 'El RUC debe tener exactamente 11 dígitos.' });
  }
  if (tipo === 'dni' && numero.length !== 8) {
    return sendJson(res, 400, { error: 'El DNI debe tener exactamente 8 dígitos.' });
  }

  const tipoDoc = tipo === 'ruc' ? '6' : '1';

  // 1. Buscar en caché local (sunat_clientes)
  try {
    const cached = await sbRest(
      auth.jwt,
      `/sunat_clientes?select=*&tipo_doc=eq.${tipoDoc}&numero_doc=eq.${encodeURIComponent(numero)}`
    );
    if (Array.isArray(cached) && cached[0]) {
      return sendJson(res, 200, { found: true, source: 'cache', cliente: cached[0] });
    }
  } catch (e) {
    // Si la tabla sunat_clientes aún no se crea, continuar con la consulta externa
  }

  // 2. Consulta externa al padrón SUNAT/RENIEC
  try {
    const found = await lookupExternal(tipo, numero);
    if (!found) {
      return sendJson(res, 200, {
        found: false,
        message: 'No se encontró en el padrón automático (o falta RUC_API_TOKEN en Vercel). Puedes escribir los datos manualmente.'
      });
    }

    const cliente = {
      tipo_doc: tipoDoc,
      numero_doc: numero,
      razon_social: found.razon_social,
      direccion: found.direccion,
      ubigeo: found.ubigeo,
      telefono: '',
      email: '',
      estado_sunat: found.estado_sunat,
      condicion_sunat: found.condicion_sunat,
      updated_at: new Date().toISOString()
    };

    // Guardar en caché si el usuario puede escribir
    if (auth.role === 'owner' || auth.role === 'editor') {
      try {
        await sbRest(auth.jwt, '/sunat_clientes?on_conflict=tipo_doc,numero_doc', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: cliente
        });
      } catch (e) {
        // Ignorar error de caché para no bloquear la respuesta
      }
    }

    return sendJson(res, 200, { found: true, source: 'sunat', cliente });
  } catch (err) {
    return sendJson(res, 502, { error: 'Error consultando padrón: ' + err.message });
  }
};
