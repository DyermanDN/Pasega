const { requireAuth, sendJson } = require('./_auth');
const { getNubefactEnv } = require('./_providers/nubefact');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método no permitido' });
  const auth = await requireAuth(req, res, { requireWrite: false });
  if (!auth) return;

  const nf = getNubefactEnv();
  return sendJson(res, 200, {
    provider: 'nubefact',
    nubefactConfigured: nf.configured,
    rucApiConfigured: Boolean((process.env.RUC_API_TOKEN || '').trim()),
    role: auth.role
  });
};
