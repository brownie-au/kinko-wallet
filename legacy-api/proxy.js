// 🔒 Universal JSON Proxy for Blockscout (with rate-limit + cache)
// Compatible with Vercel Edge & Node runtimes
// Prevents CORS blocks and shields Blockscout from API abuse

const cache = new Map();
const CACHE_TTL_MS = 60_000; // cache 1 minute
const MAX_REQ_PER_MIN = 3; // per unique URL

export default async function handler(req, res) {
    try {
        // ✅ Handle both query param and direct URL parsing (for Vercel Edge)
        const fullUrl = req.query.url || new URL(req.url, `http://${req.headers.host}`).searchParams.get('url');
        if (!fullUrl || !fullUrl.startsWith('https://')) {
            return res.status(400).json({ error: 'Invalid or missing target URL' });
        }

        // Rate limit key
        const key = fullUrl.slice(0, 200);
        const now = Date.now();
        const entry = cache.get(key) || { count: 0, last: 0, data: null, ts: 0 };

        if (now - entry.last < 60_000 && entry.count >= MAX_REQ_PER_MIN) {
            console.warn('Rate limit triggered for', fullUrl);
            return res.status(429).json({ error: 'Rate limit exceeded, try again soon.' });
        }

        // Serve from cache
        if (entry.data && now - entry.ts < CACHE_TTL_MS) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/json');
            return res.status(200).send(entry.data);
        }

        // Prepare headers
        const headers = {};
        if (fullUrl.includes('blockscout.com') && process.env.VITE_ETH_BLOCKSCOUT_KEY) {
            headers['x-api-key'] = process.env.VITE_ETH_BLOCKSCOUT_KEY;
        }

        const response = await fetch(fullUrl, { headers });
        const text = await response.text();

        cache.set(key, {
            count: entry.count + 1,
            last: now,
            data: text,
            ts: now
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.status(response.status).send(text);
    } catch (err) {
        console.error('Proxy error:', err);
        res.status(500).json({ error: err?.message || 'Proxy request failed' });
    }
}
