const { requireAuth, applyCors } = require('../../middleware/auth');

// PUT /api/profile/password  { new_password, current_password }
//
// Supabase's updateUser() only needs a valid session (which requireAuth
// already verified) to set a new password — but as an extra safety
// check we re-verify the current password first, using the user's own
// email + the password they claim to know, before allowing the change.
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;

  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'new_password must be at least 8 characters' });
  }
  if (!current_password) {
    return res.status(400).json({ error: 'current_password is required' });
  }

  // Re-verify identity
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current_password,
  });
  if (verifyErr) return res.status(401).json({ error: 'Current password is incorrect' });

  const { error } = await supabase.auth.updateUser({ password: new_password });
  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ message: 'Password updated.' });
};
