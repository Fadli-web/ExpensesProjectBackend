export default function handler(req, res) {
  res.status(200).json({ status: 'ok', v: '2.0', time: new Date().toISOString() });
}
