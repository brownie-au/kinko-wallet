// /api/ping.js  — Vercel serverless function (Node.js)
export default async function handler(req, res) {
    res.status(200).json({ ok: true, method: req.method, path: req.url });
}
