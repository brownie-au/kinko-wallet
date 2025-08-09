// api/health.js
module.exports = (req, res) => {
  res.setHeader('content-type', 'application/json');
  res.status(200).json({ ok: true, time: Date.now() });
};
