const { supabaseForUser } = require('../lib/supabaseForUser');

// Verifies the Authorization: Bearer <access_token> header against Supabase Auth
// and returns { user, supabase } where `supabase` is a client scoped to that user
// (so every query automatically respects Row Level Security).
//
// Usage inside an api/*.js handler:
//   const auth = await requireAuth(req, res);
//   if (!auth) return; // response already sent (401)
//   const { user, supabase } = auth;
async function requireAuth(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing Authorization Bearer token' });
    return null;
  }

  const supabase = supabaseForUser(token);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return null;
  }

  return { user: data.user, supabase, accessToken: token };
}

function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true; // caller should return immediately
  }
  return false;
}

module.exports = { requireAuth, applyCors };
