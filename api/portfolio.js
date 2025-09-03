// api/portfolio.js
// Short Portfolio ID backend for Kinko Wallet
//
// POST /api/portfolio   { wallets:[{address,name?}], id? } -> { id }
// GET  /api/portfolio?id=XXXXXXXX                         -> { wallets:[...] }

const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // safe chars, no 0/O/1/I
const ID_RE = /^[A-HJ-NP-Z2-9]{6,8}$/;

function genId(len = 8) {
    const arr = new Uint32Array(len);
    (globalThis.crypto || require("crypto").webcrypto).getRandomValues(arr);
    return Array.from(arr, x => ABC[x % ABC.length]).join("");
}

function cors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function send(res, status, data) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
}

function kvCreds() {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("KV credentials missing");
    return { url, token };
}

async function kvSet(key, value, ttlSec = 60 * 60 * 24 * 365) {
    const { url, token } = kvCreds();
    const r = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ value: JSON.stringify(value), px: ttlSec * 1000 }),
    });
    if (!r.ok) throw new Error(`KV set failed: ${r.status}`);
}

async function kvGet(key) {
    const { url, token } = kvCreds();
    const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`KV get failed: ${r.status}`);
    const j = await r.json();
    if (!j || j.result == null) return null;
    try { return JSON.parse(j.result); } catch { return null; }
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

    try {
        if (req.method === "POST") {
            let raw = "";
            for await (const chunk of req) raw += chunk;
            const body = raw ? JSON.parse(raw) : {};
            const wallets = Array.isArray(body.wallets) ? body.wallets : [];
            if (!wallets.length) return send(res, 400, { error: "wallets required" });

            let id = body.id;
            if (id && !ID_RE.test(id)) return send(res, 400, { error: "invalid id" });
            if (!id) id = genId();

            const clean = wallets
                .filter(w => w && typeof w.address === "string" && w.address.trim())
                .map(w => ({ address: w.address.trim(), name: (w.name || "").trim() || undefined }));

            await kvSet(`kw:pf:${id}`, { wallets: clean });
            return send(res, 200, { id });
        }

        if (req.method === "GET") {
            const { id } = req.query || {};
            if (!id || !ID_RE.test(id)) return send(res, 400, { error: "invalid id" });
            const data = await kvGet(`kw:pf:${id}`);
            if (!data) return send(res, 404, { error: "not found" });
            return send(res, 200, data);
        }

        res.setHeader("Allow", "GET, POST, OPTIONS");
        return send(res, 405, { error: "method not allowed" });
    } catch (e) {
        return send(res, 500, { error: e.message || "server error" });
    }
}
