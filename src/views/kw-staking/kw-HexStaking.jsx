/* src/views/kw-staking/kw-HexStaking.jsx */
import { useEffect, useMemo, useState } from 'react';
import { Row, Col, Card, Badge, Table, Alert, Placeholder, Button } from 'react-bootstrap';
import { useWallets } from '../../contexts/WalletContext';
import { loadWallets } from '../../utils/walletStorage';
import {
    readHexStakesCache,
    refreshHexStakesAndCache
} from '../../services/kw-hexPulseService';

const nf0 = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 });
function fmt0(x) { return nf0.format(x || 0); }
function fmt2(x) { return nf2.format(x || 0); }
function fmtTime(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

// --- Shimmer (skeleton) while loading ---
function ShimmerTable() {
    return (
        <Card>
            <Card.Body>
                <div className="mb-3">
                    <Placeholder as="div" animation="wave">
                        <Placeholder xs={3} />{' '}<Placeholder xs={2} />{' '}<Placeholder xs={1} />
                    </Placeholder>
                </div>
                <Table responsive size="sm" className="align-middle mb-0">
                    <thead>
                        <tr>
                            <th>Wallet</th><th>Stake #</th><th>Stake ID</th><th>Principal (HEX)</th>
                            <th>T-Shares</th><th>Locked Day</th><th>Staked Days</th><th>Unlocked Day</th>
                            <th>Auto</th><th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i}>
                                {Array.from({ length: 10 }).map((__, j) => (
                                    <td key={j} style={{ minWidth: j === 0 ? 120 : 80 }}>
                                        <Placeholder as="div" animation="wave"><Placeholder xs={j === 0 ? 6 : 4} /></Placeholder>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </Card.Body>
        </Card>
    );
}

function SummaryTile({ label, value, sub }) {
    return (
        <Card className="mb-3 h-100">
            <Card.Body>
                <div className="text-muted small">{label}</div>
                <div className="fs-4 fw-semibold">{value}</div>
                {sub && <div className="text-muted small mt-1">{sub}</div>}
            </Card.Body>
        </Card>
    );
}

export default function KwHexStaking() {
    // Try context first
    const ctx = (typeof useWallets === 'function') ? useWallets() : null;
    const ctxWallets = ctx?.wallets || [];

    // Fallback to localStorage if context empty
    const lsWallets = useMemo(() => loadWallets() || [], []);
    const sourceWallets = ctxWallets.length ? ctxWallets : lsWallets;

    // Accept both [{address}] and ["0x..."]
    const pulseAddresses = useMemo(() => {
        return (sourceWallets || [])
            .map(w => (typeof w === 'string' ? w : w?.address))
            .filter(Boolean);
    }, [sourceWallets]);

    // State
    const [rows, setRows] = useState([]);
    const [currentDay, setCurrentDay] = useState(null);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [loading, setLoading] = useState(true);        // true only if no cache yet
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [setupError, setSetupError] = useState('');
    const [progress, setProgress] = useState({ done: 0, total: 0 });

    // Load cache instantly, then refresh in background (SWR)
    useEffect(() => {
        let alive = true;

        // 1) Instant cache render
        const cached = readHexStakesCache(pulseAddresses);
        if (cached) {
            setRows(cached.rows || []);
            setCurrentDay(cached.currentDay ?? null);
            setUpdatedAt(cached.updatedAt || null);
            setLoading(false);
        } else {
            setRows([]);
            setCurrentDay(null);
            setUpdatedAt(null);
            setLoading(true);
        }

        // 2) Background refresh
        setIsRefreshing(true);
        setSetupError('');
        setProgress({ done: 0, total: pulseAddresses.length });

        (async () => {
            try {
                if (!pulseAddresses.length) {
                    if (alive) {
                        setRows([]);
                        setCurrentDay(null);
                        setUpdatedAt(null);
                    }
                } else {
                    const payload = await refreshHexStakesAndCache(
                        pulseAddresses,
                        (done, total) => alive && setProgress({ done, total })
                    );
                    if (!alive) return;
                    setRows(payload.rows || []);
                    setCurrentDay(payload.currentDay ?? null);
                    setUpdatedAt(Date.now());
                }
            } catch (e) {
                if (alive) setSetupError(e?.message || String(e));
            } finally {
                if (alive) {
                    setIsRefreshing(false);
                    setLoading(false);
                }
            }
        })();

        return () => { alive = false; };
    }, [pulseAddresses]);

    // Manual refresh
    const handleRefresh = async () => {
        setIsRefreshing(true);
        setProgress({ done: 0, total: pulseAddresses.length });
        try {
            const payload = await refreshHexStakesAndCache(
                pulseAddresses,
                (done, total) => setProgress({ done, total })
            );
            setRows(payload.rows || []);
            setCurrentDay(payload.currentDay ?? null);
            setUpdatedAt(Date.now());
        } catch (e) {
            setSetupError(e?.message || String(e));
        } finally {
            setIsRefreshing(false);
        }
    };

    // --- Summary rollup (uses currentDay) ---
    const summary = useMemo(() => {
        if (!rows?.length) {
            return {
                active: 0, ended: 0, tShares: 0, totalPrincipal: 0,
                nextMaturityDays: null, avgLengthYears: 0
            };
        }
        const cd = currentDay ?? 0;
        let active = 0, ended = 0;
        let tShares = 0, principal = 0, lengthDaysTotal = 0;
        let next = null;

        for (const r of rows) {
            if (r.error) continue;
            const endDay = (r.lockedDay || 0) + (r.stakedDays || 0);
            const isEnded = (r.unlockedDay || 0) > 0;
            const isMature = cd >= endDay;

            if (isEnded) ended++;
            else {
                active++;
                const rem = Math.max(0, endDay - cd);
                if (next === null || rem < next) next = rem;
            }

            tShares += r.tShares || 0;
            principal += r.principalHex || 0;
            lengthDaysTotal += r.stakedDays || 0;
        }

        const avgLenYears = rows.length ? (lengthDaysTotal / rows.length) / 365 : 0;

        return {
            active, ended, tShares, totalPrincipal: principal,
            nextMaturityDays: next, avgLengthYears: avgLenYears
        };
    }, [rows, currentDay]);

    return (
        <>
            <Row className="gy-3">
                <Col xs={12}>
                    <div className="d-flex align-items-center justify-content-between">
                        <div>
                            <h3 className="mb-1">
                                HEX Staking <small className="text-muted">PulseChain (watch-only)</small>
                            </h3>
                            <div className="text-muted">
                                Aggregates stakes for your addresses in <Badge bg="secondary">Manage Wallets</Badge>. No keys required.
                            </div>
                        </div>
                        <div className="text-muted small">
                            Updated: {fmtTime(updatedAt)}{isRefreshing ? ' (refreshing...)' : ''}
                            <Button
                                size="sm"
                                variant="outline-light"
                                className="ms-2"
                                onClick={handleRefresh}
                                disabled={isRefreshing || !pulseAddresses.length}
                            >
                                Refresh
                            </Button>
                        </div>
                    </div>
                </Col>

                {/* Summary header */}
                {!loading && (
                    <>
                        <Col xs={6} md={3}><SummaryTile label="Active Stakes" value={fmt0(summary.active)} /></Col>
                        <Col xs={6} md={3}><SummaryTile label="Ended Stakes" value={fmt0(summary.ended)} /></Col>
                        <Col xs={6} md={3}><SummaryTile label="T-Shares" value={fmt2(summary.tShares)} /></Col>
                        <Col xs={6} md={3}>
                            <SummaryTile
                                label="Next Maturity"
                                value={summary.nextMaturityDays != null ? `${fmt0(summary.nextMaturityDays)} days` : '—'}
                            />
                        </Col>
                        <Col xs={6} md={3}><SummaryTile label="Total Principal" value={`${fmt2(summary.totalPrincipal)} HEX`} /></Col>
                        <Col xs={6} md={3}><SummaryTile label="Avg Length" value={`${(summary.avgLengthYears || 0).toFixed(1)} yrs`} /></Col>
                    </>
                )}

                <Col xs={12} className="mt-2">
                    {setupError && (
                        <Alert variant="warning" className="mb-3">
                            {setupError}
                        </Alert>
                    )}

                    {!pulseAddresses.length && !loading && (
                        <Card><Card.Body className="text-muted">
                            No wallets detected. Add one in <strong>Manage Wallets</strong> to begin.
                        </Card.Body></Card>
                    )}

                    {loading && (
                        <>
                            <Card className="mb-3">
                                <Card.Body>
                                    <div className="d-flex align-items-center gap-2">
                                        <span className="text-muted">Loading HEX stakes…</span>
                                        {progress.total > 0 && (
                                            <small className="text-muted">
                                                ({progress.done}/{progress.total} wallets)
                                            </small>
                                        )}
                                    </div>
                                </Card.Body>
                            </Card>
                            <ShimmerTable />
                        </>
                    )}

                    {!loading && pulseAddresses.length > 0 && (
                        <Card className="mb-3">
                            <Card.Body className="text-muted">
                                <div className="mb-1">Addresses:</div>
                                {pulseAddresses.map((a) => (
                                    <code key={a} className="me-2 d-inline-block">0x…{a.slice(-4)}</code>
                                ))}
                            </Card.Body>
                        </Card>
                    )}

                    {!loading && rows.length > 0 && (
                        <Card>
                            <Card.Body>
                                <Table responsive size="sm" className="align-middle mb-0">
                                    <thead>
                                        <tr>
                                            <th>Wallet</th>
                                            <th>Stake #</th>
                                            <th>Stake ID</th>
                                            <th>Principal (HEX)</th>
                                            <th>T-Shares</th>
                                            <th>Locked Day</th>
                                            <th>Staked Days</th>
                                            <th>Unlocked Day</th>
                                            <th>Auto</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(r => {
                                            const endDay = (r.lockedDay || 0) + (r.stakedDays || 0);
                                            const cd = currentDay ?? 0;
                                            const matured = cd >= endDay;
                                            const ended = (r.unlockedDay || 0) > 0;
                                            return (
                                                <tr key={r.id}>
                                                    <td><code>0x…{(r.wallet || '').slice(-4)}</code></td>
                                                    <td>{Number(r.stakeIndex ?? '')}</td>
                                                    <td>{Number(r.stakeId ?? '')}</td>
                                                    <td>{r.principalHex != null ? fmt2(r.principalHex) : '—'}</td>
                                                    <td>{r.tShares != null ? fmt2(r.tShares) : '—'}</td>
                                                    <td>{r.lockedDay ?? '—'}</td>
                                                    <td>{r.stakedDays ?? '—'}</td>
                                                    <td>{r.unlockedDay ?? (matured ? <Badge bg="warning">Matured</Badge> : '0')}</td>
                                                    <td>{r.isAutoStake ? 'Yes' : 'No'}</td>
                                                    <td>{ended ? <Badge bg="success">Ended</Badge> : (matured ? <Badge bg="warning">Matured</Badge> : <Badge bg="info">Active</Badge>)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </Table>
                            </Card.Body>
                        </Card>
                    )}

                    {!loading && !rows.length && !!pulseAddresses.length && !setupError && (
                        <Card><Card.Body>No stakes detected for current wallets.</Card.Body></Card>
                    )}
                </Col>
            </Row>
        </>
    );
}
