export default async function handler(req, res) {
    try {
        const { address } = req.query;
        const url = process.env.PRIVATE_QUICKNODE_HTTP; // your private QuickNode URL

        // Example: forward the request to QuickNode (adjust as needed)
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'eth_getBalance',
                params: [address, 'latest'],
                id: 1,
                jsonrpc: '2.0'
            })
        });

        const data = await r.json();
        res.status(200).json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Proxy failed' });
    }
}
