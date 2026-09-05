const { createClient } = require('@supabase/supabase-js');
const { applyCors } = require('../../middleware/auth');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password, full_name } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: full_name || '' } },
  });

  if (error) return res.status(400).json({ error: error.message });

  // A "profiles" row is created automatically by the on_auth_user_created
  // Postgres trigger (see sql/schema.sql), so it exists from this point on
  // and will follow the user to any device they log in from.
  return res.status(200).json({
    user: data.user,
    session: data.session, // null if email confirmation is required
    message: data.session
      ? 'Registered and logged in.'
      : 'Registered. Please check your email to confirm your account.',
  });
};
