// src/components/TickerBar.jsx
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import styles from './TickerBar.module.css';

const HIDDEN_ON = new Set(['/', '/hero']);

const COINS = [
    { id: 'bitcoin', label: 'BTC' },
    { id: 'ethereum', label: 'ETH' },
    { id: 'pulsechain', label: 'PLS' },
    { id: 'tether', label: 'USDT' },
    { id: 'binancecoin', label: 'BNB' },
    { id: 'solana', label: 'SOL' },
    { id: 'usd-coin', label: 'USDC' },
    { id: 'chainlink', label: 'LINK' },
    { id: 'dogecoin', label: 'DOGE' },
    { id: 'cardano', label: 'ADA' },
    { id: 'tron', label: 'TRX' },
    { id: 'pulsex', label: 'PLSX' },
    { id: 'pulsex-incentive-token', label: 'INC' },
    { id: 'hex', label: 'eHEX' },
    { id: 'hex-pulsechain', label: 'HEX' }
];

const fmtUsd = (n) => {
    const v = Number(n) || 0;
    const a = Math.abs(v);
    let d = 2;
    if (a < 1) d = 3;
    if (a < 0.1) d = 4;
    if (a < 0.01) d = 5;
    if (a < 0.001) d = 6;
    if (a < 0.0001) d = 7;
    return `USD $${v.toLocaleString(undefined, {
        minimumFractionDigits: d,
        maximumFractionDigits: d
    })}`;
};

export default function TickerBar({
    refreshMs = 60_000,
    className = '',
    /** lower = faster, higher = slower (seconds per loop) */
    speedSec = 40
}) {
    const { pathname } = useLocation();
    const [items, setItems] = useState([]);

    // Hide on specific routes
    if (HIDDEN_ON.has(pathname)) return null;

    const reduceMotion = useMemo(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return false;
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }, []);

    useEffect(() => {
        let alive = true;
        let t;

        async function fetchMarkets() {
            try {
                const ids = COINS.map((c) => c.id).join(',');
                const url = new URL('https://api.coingecko.com/api/v3/coins/markets');
                url.searchParams.set('vs_currency', 'usd');
                url.searchParams.set('ids', ids);
                url.searchParams.set('order', 'market_cap_desc');
                url.searchParams.set('per_page', String(COINS.length));
                url.searchParams.set('page', '1');
                url.searchParams.set('sparkline', 'false');
                url.searchParams.set('price_change_percentage', '24h');

                const res = await fetch(url.toString(), {
                    headers: { accept: 'application/json' },
                    cache: 'no-store'
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const data = await res.json();
                const byId = new Map(
                    (Array.isArray(data) ? data : []).map((c) => [
                        c.id,
                        {
                            id: c.id,
                            symbol: (c.symbol || '').toUpperCase(),
                            price: c.current_price,
                            change24h:
                                typeof c.price_change_percentage_24h_in_currency === 'number'
                                    ? c.price_change_percentage_24h_in_currency
                                    : c.price_change_percentage_24h
                        }
                    ])
                );

                const mapped = COINS.map((coin) => {
                    const r = byId.get(coin.id);
                    if (!r) return null;
                    return {
                        id: r.id,
                        symbol: coin.label || r.symbol,
                        price: r.price,
                        change24h: r.change24h
                    };
                }).filter(Boolean);

                if (alive) setItems(mapped);
            } catch {
                if (alive) setItems([]); // no demo items; stays empty
            }
        }

        fetchMarkets();
        t = setInterval(fetchMarkets, refreshMs);
        return () => {
            alive = false;
            clearInterval(t);
        };
    }, [refreshMs]);

    const row = items.map((c) => (
        <div key={c.id} className={styles.item}>
            <span className={styles.symbol}>{c.symbol}</span>
            <span className={styles.price}>{fmtUsd(c.price)}</span>
            <span
                className={`${styles.change} ${Number(c.change24h) >= 0 ? 'text-success' : 'text-danger'
                    }`}
                title="24h change"
            >
                {Number(c.change24h) >= 0 ? '▲' : '▼'}{' '}
                {Math.abs(Number(c.change24h) || 0).toFixed(2)}%
            </span>
        </div>
    ));

    return (
        <>
            <div
                className={[styles.kwTicker, className].filter(Boolean).join(' ')}
                role="region"
                aria-label="Crypto ticker"
            >
                {/* Only animate when we have data */}
                <div
                    className={[styles.wrap, reduceMotion || items.length === 0 ? styles.wrapStatic : '']
                        .filter(Boolean)
                        .join(' ')}
                    style={{ animationDuration: `${speedSec}s` }}
                >
                    <div className={styles.track}>{row}</div>
                    <div className={styles.track}>{row}</div>
                </div>
            </div>

            {/* Spacer to offset the fixed ticker height (see .spacer in CSS) */}
            <div className={styles.spacer} />
        </>
    );
}
