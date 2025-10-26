export default async function handler(req, res) {
    try {
        const target = req.query.url;
        if (!target || !target.startsWith('https://')) {
            return res.status(400).json({ error: 'Invalid or missing target URL' });
        }

        // Forward request to target (with API key if Blockscout)
        const headers = {};
        if (target.includes('blockscout.com') && process.env.VITE_ETH_BLOCKSCOUT_KEY) {
            headers['x-api-key'] = process.env.VITE_ETH_BLOCKSCOUT_KEY;
        }

        const response = await fetch(target, { headers });
        const text = await response.text();

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.status(response.status).send(text);
    } catch (err) {
        console.error('Proxy error:', err);
        res.status(500).json({ error: 'Proxy request failed' });
    }
}
