const { requireAuth, applyCors } = require('../../middleware/auth');

// GET  /api/profile      -> return the logged-in user's profile + email
// PUT  /api/profile      -> update full_name (and optionally email)
//
// Because "profiles" is keyed by the permanent Supabase auth user id,
// this data is identical no matter which device or browser the user
// logs in from. It only changes if the user explicitly edits it here.
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;

  if (req.method === 'GET') {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, updated_at')
      .eq('id', user.id)
      .single();

    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || '',
      avatar_url: profile?.avatar_url || null,
      updated_at: profile?.updated_at,
    });
  }

  if (req.method === 'PUT') {
    const { full_name, email } = req.body || {};

    // Email changes go through Supabase Auth itself (it will send a
    // confirmation email to both the old and new address).
    if (email && email !== user.email) {
      const { error: emailErr } = await supabase.auth.updateUser({ email });
      if (emailErr) return res.status(400).json({ error: emailErr.message });
    }

    if (full_name !== undefined) {
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ full_name, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (profileErr) return res.status(400).json({ error: profileErr.message });
    }

    return res.status(200).json({ message: 'Profile updated.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
