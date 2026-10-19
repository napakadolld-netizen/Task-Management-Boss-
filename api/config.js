module.exports = function handler(_req, res) {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return res.status(503).json({ ready: false });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ready: true, url, publishableKey });
};
