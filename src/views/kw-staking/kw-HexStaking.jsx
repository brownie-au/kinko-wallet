/* src/views/kw-staking/kw-HexStaking.jsx */
import { useEffect, useMemo, useState } from 'react';
import { Row, Col, Card, Badge, Table, Alert, Placeholder } from 'react-bootstrap';
import { useWallets } from '../../contexts/WalletContext';
import { loadWallets } from '../../utils/walletStorage';
import { readHexStakesCache, refreshHexStakesAndCache } from '../../services/kw-hexPulseService';

import KwHexStakingHeaderContainer from '../../components/kw-HexStakingHeaderContainer.jsx';
import '../../styles/kw-hex-staking-header.css';

const nf2 = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 });
const fmt2 = (x) => nf2.format(x || 0);

function ShimmerTable() {
    return (
        <Card>
            <Card.Body>
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

export default function KwHexStaking() {
    // wallets source (context first, LS fallback)
    const ctx = (typeof useWallets === 'function') ? useWallets() : null;
    const ctxWallets = ctx?.wallets || [];
    const lsWallets = useMemo(() => loadWallets() || [], []);
    const sourceWallets = ctxWallets.length ? ctxWallets : lsWallets;

    const pulseAddresses = useMemo(
        () => (sourceWallets || []).map(w => (typeof w === 'string' ? w : w?.address)).filter(Boolean),
        [sourceWallets]
    );

    // state
    const [rows, setRows] = useState([]);
    const [currentDay, setCurrentDay] = useState(null);
    const [payoutPerTShareDailyHex, setPayoutPerTShareDailyHex] = useState(null);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [setupError, setSetupError] = useState('');
    const [progress, setProgress] = useState({ done: 0, total: 0 });

    // cache → background refresh
    useEffect(() => {
        let alive = true;
        const cached = readHexStakesCache(pulseAddresses);
        if (cached) {
            setRows(cached.rows || []);
            setCurrentDay(cached.currentDay ?? null);
            setPayoutPerTShareDailyHex(cached.payoutPerTShareDailyHex ?? null);
            setUpdatedAt(cached.updatedAt || null);
            setLoading(false);
        } else {
            setLoading(true);
        }

        setIsRefreshing(true);
        setSetupError('');
        setProgress({ done: 0, total: pulseAddresses.length });

        (async () => {
            try {
                if (pulseAddresses.length) {
                    const payload = await refreshHexStakesAndCache(
                        pulseAddresses,
                        (done, total) => alive && setProgress({ done, total })
                    );
                    if (!alive) return;
                    setRows(payload.rows || []);
                    setCurrentDay(payload.currentDay ?? null);
                    setPayoutPerTShareDailyHex(payload.payoutPerTShareDailyHex ?? null);
                    setUpdatedAt(new Date());
                } else {
                    if (alive) {
                        setRows([]);
                        setCurrentDay(null);
                        setPayoutPerTShareDailyHex(null);
                        setUpdatedAt(null);
                    }
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
            setPayoutPerTShareDailyHex(payload.payoutPerTShareDailyHex ?? null);
            setUpdatedAt(new Date());
        } catch (e) {
            setSetupError(e?.message || String(e));
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <Row className="gy-3">
            {/* ⬇️ ONLY the unified header at the top; legacy title/Updated/Refresh block removed */}
            {!loading && (
                <Col xs={12} className="pt-0 mt-0">
                    <KwHexStakingHeaderContainer
                        stakes={rows}
                        currentHexDay={currentDay ?? 0}
                        payoutPerTShareDailyHex={payoutPerTShareDailyHex ?? 0}
                        updatedAt={updatedAt}
                        onRefresh={handleRefresh}
                        sticky
                    />
                </Col>
            )}

            <Col xs={12} className="mt-2">
                {setupError && <Alert variant="warning" className="mb-3">{setupError}</Alert>}

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
                                        <small className="text-muted">({progress.done}/{progress.total} wallets)</small>
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
    );
}
