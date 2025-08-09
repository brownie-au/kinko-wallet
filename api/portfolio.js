// api/portfolio.js
// Works with either env var names:
// - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
// - KV_REST_API_URL / KV_REST_API_TOKEN

const REST_URL =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL;

const REST_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function upstash(commandArray) {
  if (!REST_URL || !REST_TOKEN) throw new Error('Upstash REST env vars missing');
  const r = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ command: commandArray })
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Upstash error ${r.status}: ${text}`);
  }
  return r.json(); // { result, error }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { slug } = req.query || {};
      if (!slug || typeof slug !== 'string') return res.status(400).json({ error: 'slug is required' });

      const { result } = await upstash(['GET', slug]);
      if (result == null) return res.status(404).json({ error: 'not found' });

      const record = JSON.parse(result);
      return res.status(200).json(record);
    }

    if (req.method === 'PUT') {
      const { slug, blob, prevVersion } = req.body || {};
      if (!slug || typeof slug !== 'string') return res.status(400).json({ error: 'slug is required' });
      if (typeof blob !== 'object' || blob == null) return res.status(400).json({ error: 'blob (encrypted object) required' });

      const { result } = await upstash(['GET', slug]);
      let existing = null;
      if (result != null) { try { existing = JSON.parse(result); } catch {} }

      if (existing && typeof prevVersion === 'number' && prevVersion !== existing.version) {
        return res.status(409).json({ error: 'version_mismatch', expected: existing.version });
      }

      const nextVersion = (existing?.version || 0) + 1;
      const record = { slug, version: nextVersion, updatedAt: new Date().toISOString(), blob };

      await upstash(['SET', slug, JSON.stringify(record)]);
      return res.status(200).json(record);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('portfolio api error:', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
};
