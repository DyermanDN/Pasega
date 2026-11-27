function getSupabaseEnv() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  ).trim().replace(/\/+$/, '');

  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  return { url, anonKey };
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body || '{}')); } catch { return Promise.resolve({}); }
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) reject(new Error('Payload demasiado grande'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

async function sbRest(jwt, path, opts = {}) {
  const { url, anonKey } = getSupabaseEnv();
  const res = await fetch(`${url}/rest/v1${path}`, {
    method: opts.method || 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.message || data.error_description || data.hint)) || text || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data && data.code;
    throw err;
  }
  return data;
}

async function requireAuth(req, res, { requireWrite = false } = {}) {
  const { url, anonKey } = getSupabaseEnv();
  if (!url || !anonKey) {
    res.status(500).json({ error: 'Faltan variables SUPABASE_URL o SUPABASE_ANON_KEY en el servidor.' });
    return null;
  }

  const header = String((req.headers && (req.headers.authorization || req.headers.Authorization)) || '');
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    res.status(401).json({ error: 'Sesión requerida. Inicia sesión para continuar.' });
    return null;
  }
  const jwt = m[1].trim();

  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` }
  });
  if (!userRes.ok) {
    res.status(401).json({ error: 'Sesión expirada o inválida. Vuelve a iniciar sesión.' });
    return null;
  }
  const user = await userRes.json();
  if (!user || !user.id) {
    res.status(401).json({ error: 'Usuario no autenticado.' });
    return null;
  }

  let role = 'editor';
  try {
    const rows = await sbRest(jwt, `/pasega_users?select=role&user_id=eq.${encodeURIComponent(user.id)}`);
    if (Array.isArray(rows) && rows[0] && rows[0].role) role = rows[0].role;
  } catch (e) {
    // Si no existe fila en pasega_users, el rol por defecto es editor
  }

  if (role === 'blocked') {
    res.status(403).json({ error: 'Tu usuario no tiene acceso a este módulo.' });
    return null;
  }
  if (requireWrite && role !== 'owner' && role !== 'editor') {
    res.status(403).json({ error: 'Tu usuario es de solo lectura y no puede emitir ni anular comprobantes.' });
    return null;
  }

  return { jwt, user, role };
}

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(status).json(payload);
}

module.exports = {
  getSupabaseEnv,
  readJsonBody,
  sbRest,
  requireAuth,
  sendJson
};
