const { applyCors } = require('../middleware/auth');
const supabaseAdmin = require('../lib/supabaseAdmin');

// GET /api/health
// Health check and Supabase keep-alive endpoint
// Pings database with a lightweight query to ensure Supabase stays active
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  const start = Date.now();
  let dbStatus = 'disconnected';
  let dbError = null;

  try {
    const { count, error } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    if (error) {
      dbError = error.message;
    } else {
      dbStatus = 'connected';
    }
  } catch (err) {
    dbError = err.message;
  }

  const durationMs = Date.now() - start;

  return res.status(dbStatus === 'connected' ? 200 : 503).json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    service: 'Expenses Note Backend',
    database: dbStatus,
    latency_ms: durationMs,
    error: dbError,
    timestamp: new Date().toISOString(),
  });
};
