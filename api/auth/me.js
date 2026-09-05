const { requireAuth, applyCors } = require('../../middleware/auth');

// GET /api/auth/me
// Returns current authenticated user details and profile
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, updated_at')
    .eq('id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || '',
      avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || null,
      created_at: user.created_at,
      updated_at: profile?.updated_at || user.updated_at,
    },
  });
};
