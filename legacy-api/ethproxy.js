export default async function handler(req, res) {
    try {
        const rpcUrls = process.env.VITE_ETH_RPC_URLS?.split(',') || [];
        const url = rpcUrls[0];
        const body = req.body;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}
