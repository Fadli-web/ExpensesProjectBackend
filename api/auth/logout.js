const { requireAuth, applyCors } = require('../../middleware/auth');

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { error } = await auth.supabase.auth.signOut();
  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ message: 'Logged out' });
};
