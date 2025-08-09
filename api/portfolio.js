// api/portfolio.js
// Serverless API for saving/loading encrypted portfolio blobs in Upstash Redis (KV).
// Methods:
//   GET  /api/portfolio?slug=abc
//   PUT  /api/portfolio   body: { slug, blob, prevVersion? }
//
// Notes:
// - `blob` is your client-side ENCRYPTED object (ciphertext, iv, etc.).
// - We keep a simple optimistic lock via `version`.
// - Env vars are auto-added by the Upstash integration in Vercel.
const REST_URL  = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function upstash(commandArray) {
  const r = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ command: commandArray })
  });
  if (!r.ok) throw new Error(`Upstash error ${r.status}`);
  return r.json(); // { result: ..., error: ... }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!REST_URL || !REST_TOKEN) {
    return res.status(500).json({ error: 'Upstash env vars missing' });
  }

  try {
    if (req.method === 'GET') {
      const { slug } = req.query || {};
      if (!slug || typeof slug !== 'string') {
        return res.status(400).json({ error: 'slug is required' });
      }

      const { result } = await upstash(['GET', slug]);
      if (result == null) return res.status(404).json({ error: 'not found' });

      // Stored value is a JSON string
      const record = JSON.parse(result);
      return res.status(200).json(record);
    }

    if (req.method === 'PUT') {
      const { slug, blob, prevVersion } = req.body || {};
      if (!slug || typeof slug !== 'string') {
        return res.status(400).json({ error: 'slug is required' });
      }
      if (typeof blob !== 'object' || blob == null) {
        return res.status(400).json({ error: 'blob (encrypted object) required' });
      }

      // Fetch existing to apply optimistic version check
      const { result } = await upstash(['GET', slug]);
      let existing = null;
      if (result != null) {
        try { existing = JSON.parse(result); } catch {}
      }

      if (existing && typeof prevVersion === 'number' && prevVersion !== existing.version) {
        return res.status(409).json({
          error: 'version_mismatch',
          expected: existing.version
        });
      }

      const nextVersion = (existing?.version || 0) + 1;
      const record = {
        slug,
        version: nextVersion,
        updatedAt: new Date().toISOString(),
        blob // <- your encrypted data as-is
      };

      // Save
      await upstash(['SET', slug, JSON.stringify(record)]);
      return res.status(200).json(record);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('portfolio api error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
};
