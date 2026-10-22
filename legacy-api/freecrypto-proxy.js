export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const query = url.searchParams.toString();
    const target = `https://www.freecryptoapi.com/api/v1/coins/markets?${query}&x_cg_pro_api_key=${process.env.VITE_FREECRYPTO_KEY}`;

    try {
        const response = await fetch(target, {
            headers: { 'User-Agent': 'KinkoWalletProxy/1.0' },
        });
        const data = await response.json();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Proxy failed', details: err.message });
    }
}
