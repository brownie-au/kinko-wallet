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

/* ---------------- Skeleton while loading ---------------- */
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
                                        <Placeholder as="div" animation="wave">
                                            <Placeholder xs={j === 0 ? 6 : 4} />
                                        </Placeholder>
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
    /* Wallets source (context first, LS fallback) */
    const ctx = (typeof useWallets === 'function') ? useWallets() : null;
    const ctxWallets = ctx?.wallets || [];
    const lsWallets = useMemo(() => loadWallets() || [], []);
    const sourceWallets = ctxWallets.length ? ctxWallets : lsWallets;

    /* Accept both [{address, name/label}] and ["0x..."] */
    const pulseAddresses = useMemo(
        () => (sourceWallets || []).map(w => (typeof w === 'string' ? w : w?.address)).filter(Boolean),
        [sourceWallets]
    );

    /* Map: address(lowercase) -> friendly name */
    const walletNameMap = useMemo(() => {
        const map = {};
        for (const w of (sourceWallets || [])) {
            const addr = (typeof w === 'string' ? w : w?.address);
            if (!addr) continue;
            const name = (typeof w === 'string' ? '' : (w.name || w.label || w.title || w.nickname || ''));
            if (name) map[addr.toLowerCase()] = name;
        }
        return map;
    }, [sourceWallets]);

    /* Data state */
    const [rows, setRows] = useState([]);
    const [currentDay, setCurrentDay] = useState(null);
    const [payoutPerTShareDailyHex, setPayoutPerTShareDailyHex] = useState(null);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [setupError, setSetupError] = useState('');
    const [progress, setProgress] = useState({ done: 0, total: 0 });

    /* Sorting state */
    const [sort, setSort] = useState({ key: 'stakeId', dir: 'asc' }); // default

    const toggleSort = (key) => {
        setSort(prev =>
            prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
        );
    };

    const sortValue = (r, key) => {
        switch (key) {
            case 'wallet': {
                const friendly = walletNameMap[(r.wallet || '').toLowerCase()];
                const shortAddr = `0x…${(r.wallet || '').slice(-4)}`;
                return (friendly ? `${shortAddr} — ${friendly}` : shortAddr).toLowerCase();
            }
            case 'stakeIndex': return Number(r.stakeIndex) || 0;
            case 'stakeId': return Number(r.stakeId) || 0;
            case 'principalHex': return Number(r.principalHex) || 0;
            case 'tShares': return Number(r.tShares) || 0;
            case 'lockedDay': return Number(r.lockedDay) || 0;
            case 'stakedDays': return Number(r.stakedDays) || 0;
            case 'unlockedDay': return Number(r.unlockedDay) || 0;
            case 'auto': return r.isAutoStake ? 1 : 0;
            case 'status': {
                const cd = currentDay ?? 0;
                const endDay = (r.lockedDay || 0) + (r.stakedDays || 0);
                const matured = cd >= endDay;
                const ended = (r.unlockedDay || 0) > 0;
                return ended ? 0 : matured ? 1 : 2; // ended < matured < active
            }
            default: return 0;
        }
    };

    const sortedRows = useMemo(() => {
        const arr = [...rows];
        arr.sort((a, b) => {
            const av = sortValue(a, sort.key);
            const bv = sortValue(b, sort.key);
            const cmp = (typeof av === 'string' || typeof bv === 'string')
                ? String(av).localeCompare(String(bv))
                : (av ?? 0) - (bv ?? 0);
            return sort.dir === 'asc' ? cmp : -cmp;
        });
        return arr;
    }, [rows, sort, currentDay, walletNameMap]);

    /* cache → background refresh */
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

    const ariaSort = (key) => sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';

    return (
        <Row className="gy-3">
            {/* Unified header */}
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
                                        <th aria-sort={ariaSort('wallet')}>
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('wallet')}>
                                                Wallet {sort.key === 'wallet' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('stakeIndex')}>
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('stakeIndex')}>
                                                Stake # {sort.key === 'stakeIndex' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('stakeId')}>
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('stakeId')}>
                                                Stake ID {sort.key === 'stakeId' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('principalHex')}>
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('principalHex')}>
                                                Principal (HEX) {sort.key === 'principalHex' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('tShares')}>
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('tShares')}>
                                                T-Shares {sort.key === 'tShares' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('lockedDay')}>
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('lockedDay')}>
                                                Locked Day {sort.key === 'lockedDay' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('stakedDays')}>
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('stakedDays')}>
                                                Staked Days {sort.key === 'stakedDays' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('unlockedDay')}>
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('unlockedDay')}>
                                                Unlocked Day {sort.key === 'unlockedDay' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('auto')}>
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('auto')}>
                                                Auto {sort.key === 'auto' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                        <th aria-sort={ariaSort('status')}>
                                            <button type="button" className="kw-sort-plain" onClick={() => toggleSort('status')}>
                                                Status {sort.key === 'status' && <span className={`kw-sort-arrow ${sort.dir}`} aria-hidden />}
                                            </button>
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {sortedRows.map(r => {
                                        const endDay = (r.lockedDay || 0) + (r.stakedDays || 0);
                                        const cd = currentDay ?? 0;
                                        const matured = cd >= endDay;
                                        const ended = (r.unlockedDay || 0) > 0;

                                        const addr = (r.wallet || '');
                                        const shortAddr = `0x…${addr.slice(-4)}`;
                                        const friendlyName = walletNameMap[addr.toLowerCase()];
                                        const walletDisplay = friendlyName ? `${shortAddr} — ${friendlyName}` : shortAddr;

                                        return (
                                            <tr key={r.id}>
                                                <td><span className="kw-wallet-chip">{walletDisplay}</span></td>
                                                <td>{Number(r.stakeIndex ?? '')}</td>
                                                <td>{Number(r.stakeId ?? '')}</td>
                                                <td>{r.principalHex != null ? fmt2(r.principalHex) : '—'}</td>
                                                <td>{r.tShares != null ? fmt2(r.tShares) : '—'}</td>
                                                <td>{r.lockedDay ?? '—'}</td>
                                                <td>{r.stakedDays ?? '—'}</td>
                                                <td>{r.unlockedDay ?? (matured ? <Badge bg="warning">Matured</Badge> : '0')}</td>
                                                <td>{r.isAutoStake ? 'Yes' : 'No'}</td>
                                                <td>
                                                    {ended ? (
                                                        <Badge bg="success">Ended</Badge>
                                                    ) : matured ? (
                                                        <Badge bg="warning">Matured</Badge>
                                                    ) : (
                                                        <Badge bg="info">Active</Badge>
                                                    )}
                                                </td>
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
