const { createClient } = require('@supabase/supabase-js');
const { applyCors } = require('../../middleware/auth');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Exchanges a refresh_token for a new access_token, so the frontend
// (web or mobile) can stay logged in without asking the user to
// sign in again on every visit.
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token is required' });

  const { data, error } = await supabase.auth.refreshSession({ refresh_token });
  if (error) return res.status(401).json({ error: error.message });

  return res.status(200).json({ session: data.session, user: data.user });
};
