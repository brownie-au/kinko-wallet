// src/sections/dashboard/ai/AiPortfolioAnalyzer.jsx
/* Minimal, polished Analyzer:
   - Objectives with Risk + Timeframe underneath (left third)
   - Tabs on the right two thirds
   - Generate Report / Clear
   - Chain chips (from live portfolio prop)
*/
import { useState, useMemo } from 'react';
import {
    Card, Row, Col, Button, Form, Tabs, Tab, Badge, Spinner, Alert
} from 'react-bootstrap';
import { analyzePortfolio } from '../../../services/aiAnalyzerService';

const RISK_LEVELS = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
const TIMEFRAMES = [
    { key: '1y', label: '1 year' },
    { key: '3y', label: '3 years' },
    { key: '5y', label: '5+ years' }
];

// Chip colors (match dashboard palette)
const CHAIN_COLORS = { pulse: '#7c3aed', eth: '#10b981', base: '#3b82f6' };

export default function AiPortfolioAnalyzer({ portfolio }) {
    // Inputs
    const [objective, setObjective] = useState('');
    const [riskIndex, setRiskIndex] = useState(2); // Medium
    const [timeframe, setTimeframe] = useState('5y');

    // Status + results
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null); // { overviewHtml, observationsHtml, breakdownHtml, scorecard, news }
    const [lastRunAt, setLastRunAt] = useState(null);

    // Chain chips from live portfolio
    const chainChips = useMemo(() => {
        const by = { eth: 0, pulse: 0, base: 0 };
        const assets = Array.isArray(portfolio?.assets) ? portfolio.assets : [];
        for (const a of assets) {
            const chain = String(a?.chain || '').toLowerCase();
            const val = Number(a?.valueUsd) || 0;
            if (val <= 0) continue;
            if (chain.startsWith('eth') || chain === 'ethereum') by.eth += val;
            else if (chain === 'pulse' || chain.startsWith('pls')) by.pulse += val;
            else if (chain.startsWith('base')) by.base += val;
        }
        const total = Number(portfolio?.totalUsd) || (by.eth + by.pulse + by.base) || 0;
        const make = (key, label) => {
            const usd = by[key] || 0;
            const pct = total > 0 ? Math.round((usd / total) * 1000) / 10 : 0;
            return { key, label, usd, pct, color: CHAIN_COLORS[key] || '#999' };
        };
        const chips = [];
        if (by.eth > 0) chips.push(make('eth', 'Ethereum'));
        if (by.pulse > 0) chips.push(make('pulse', 'PulseChain'));
        if (by.base > 0) chips.push(make('base', 'Base'));
        chips.sort((a, b) => b.usd - a.usd);
        return { chips, total };
    }, [portfolio]);

    async function runAnalysis({ force = false } = {}) {
        setError('');
        if (!portfolio || !Array.isArray(portfolio.assets) || portfolio.assets.length === 0) {
            setResult(null);
            setError('No live assets found. Add a wallet with holdings first.');
            return;
        }
        try {
            setLoading(true);
            const out = await analyzePortfolio({ portfolio, objective, riskIndex, timeframe, force });
            setResult(out || null);
            setLastRunAt(new Date());
        } catch (e) {
            setResult(null);
            setError(e?.message || 'Failed to generate AI analysis.');
        } finally {
            setLoading(false);
        }
    }

    function handleClear() {
        setObjective('');
        setRiskIndex(2);
        setTimeframe('5y');
        setError('');
        setResult(null);
        setLastRunAt(null);
    }

    return (
        <Card className="mb-4">
            <Card.Body>
                {/* Header */}
                <Row className="align-items-center mb-2">
                    <Col>
                        <h5 className="mb-1">
                            AI Portfolio Analysis {result && <Badge bg="primary">Generated</Badge>}
                        </h5>
                        <div className="text-muted small">
                            "Your portfolio is a reflection of your research. This AI tool is the mirror to check your work." — <em>Brownie</em>
                        </div>
                    </Col>
                    <Col xs="auto" className="d-flex align-items-center gap-2 flex-wrap">
                        {lastRunAt && (
                            <span className="small text-muted">
                                Last run: {lastRunAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                        <Badge bg="info" pill>Live</Badge>
                    </Col>
                </Row>

                {/* Chain chips */}
                <div className="d-flex flex-wrap align-items-center gap-2 mb-3" style={{ fontSize: 12 }}>
                    {chainChips.chips.length > 0 ? (
                        chainChips.chips.map((c) => (
                            <div
                                key={c.key}
                                className="d-inline-flex align-items-center px-2 py-1 rounded-pill"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                                title={`${c.label}: USD ${c.usd.toLocaleString('en-AU', { maximumFractionDigits: 0 })}${chainChips.total > 0 ? ` (${c.pct}%)` : ''}`}
                            >
                                <span style={{ width: 10, height: 10, borderRadius: '50%', display: 'inline-block', marginRight: 8, backgroundColor: c.color }} />
                                <span className="me-2">{c.label}</span>
                                <span className="text-muted">
                                    ${c.usd.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    {chainChips.total > 0 && <> &nbsp;•&nbsp; {c.pct}%</>}
                                </span>
                            </div>
                        ))
                    ) : (
                        <span className="text-muted">No chain distribution available.</span>
                    )}
                </div>

                {/* Controls + Tabs (left third, right two thirds) */}
                <Row className="g-3">
                    {/* LEFT: 1/3 width */}
                    <Col xs={12} md={4}>
                        <Form.Label className="mb-1">State your objectives (optional)</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={6}
                            placeholder="e.g., Grow to $250k over 5+ years with moderate drawdowns."
                            value={objective}
                            onChange={(e) => setObjective(e.target.value)}
                            disabled={loading}
                        />

                        <Form.Label className="mt-3 mb-2">Risk tolerance</Form.Label>
                        <div className="d-flex align-items-center gap-3">
                            <span className="small text-muted">Very Low</span>
                            <Form.Range
                                min={0}
                                max={4}
                                step={1}
                                value={riskIndex}
                                onChange={(e) => setRiskIndex(parseInt(e.target.value, 10))}
                                disabled={loading}
                            />
                            <span className="small text-muted">Very High</span>
                        </div>
                        <div className="mt-1 small">
                            Selected: <strong>{RISK_LEVELS[riskIndex]}</strong>
                        </div>

                        <Form.Label className="mt-3 mb-1">Timeframe</Form.Label>
                        <Form.Select
                            value={timeframe}
                            onChange={(e) => setTimeframe(e.target.value)}
                            disabled={loading}
                        >
                            {TIMEFRAMES.map((t) => (
                                <option key={t.key} value={t.key}>{t.label}</option>
                            ))}
                        </Form.Select>

                        <div className="d-flex flex-wrap gap-2 mt-3">
                            <Button variant="success" onClick={() => runAnalysis({ force: false })} disabled={loading}>
                                {loading ? (<><Spinner size="sm" animation="border" className="me-2" />Generating...</>) : 'Generate Report'}
                            </Button>
                            <Button variant="outline-secondary" onClick={handleClear} disabled={loading}>Clear</Button>
                        </div>

                        {error && (
                            <Alert variant="danger" className="mb-0 mt-3">
                                {error}
                            </Alert>
                        )}
                    </Col>

                    {/* RIGHT: 2/3 width */}
                    <Col xs={12} md={8}>
                        <Tabs defaultActiveKey="overview" className="mb-0">
                            <Tab eventKey="overview" title="Overview">
                                <ScrollablePane>
                                    {loading && <MutedNote>Analyzing your holdings...</MutedNote>}
                                    {!loading && !result && <MutedNote>Click "Generate Report" to analyze your current portfolio.</MutedNote>}
                                    {!loading && result?.overviewHtml && <HtmlBlock html={result.overviewHtml} />}
                                </ScrollablePane>
                            </Tab>

                            <Tab eventKey="breakdown" title="Breakdown">
                                <ScrollablePane>
                                    {loading && <MutedNote>Compiling position-level notes...</MutedNote>}
                                    {!loading && result?.breakdownHtml && <HtmlBlock html={result.breakdownHtml} />}
                                    {!loading && !result?.breakdownHtml && <MutedNote>No breakdown available yet.</MutedNote>}
                                </ScrollablePane>
                            </Tab>

                            <Tab eventKey="observations" title="Strategic Observations">
                                <ScrollablePane>
                                    {loading && <MutedNote>Drafting strategic/tactical observations...</MutedNote>}
                                    {!loading && result?.observationsHtml && <HtmlBlock html={result.observationsHtml} />}
                                    {!loading && !result?.observationsHtml && <MutedNote>No observations yet.</MutedNote>}
                                </ScrollablePane>
                            </Tab>

                            <Tab eventKey="scorecard" title="Scorecard">
                                <ScrollablePane>
                                    {loading && <MutedNote>Scoring risk, concentration, quality...</MutedNote>}
                                    {!loading && result?.scorecard
                                        ? <ScorecardView scorecard={result.scorecard} />
                                        : <MutedNote>No scorecard yet.</MutedNote>
                                    }
                                </ScrollablePane>
                            </Tab>

                            <Tab eventKey="news" title="AI News Brief">
                                <ScrollablePane>
                                    {loading && <MutedNote>Collecting chain-weighted headlines...</MutedNote>}
                                    {!loading && result?.news
                                        ? <PreJson data={result.news} />
                                        : <MutedNote>No news items in this response.</MutedNote>
                                    }
                                </ScrollablePane>
                            </Tab>
                        </Tabs>
                    </Col>
                </Row>
            </Card.Body>
        </Card>
    );
}

/* Small UI helpers */
function ScrollablePane({ children, maxHeight = 280 }) {
    return <div style={{ maxHeight, overflowY: 'auto' }}>{children}</div>;
}
function MutedNote({ children }) { return <p className="text-muted">{children}</p>; }
function HtmlBlock({ html }) { return <div dangerouslySetInnerHTML={{ __html: html }} />; }
function ScorecardView({ scorecard }) {
    const items = Array.isArray(scorecard?.components) ? scorecard.components : [];
    const total = Number(scorecard?.total ?? 0);
    return (
        <div>
            <div className="d-flex align-items-center justify-content-between mb-2">
                <h6 className="m-0">Composite Score</h6>
                <span className="badge bg-primary" style={{ fontSize: 14 }}>{Math.round(total)}/100</span>
            </div>
            <div className="list-group">
                {items.map((it, i) => (
                    <div key={i} className="list-group-item d-flex align-items-center justify-content-between">
                        <div className="me-3">
                            <div className="fw-semibold">{it?.name || `Component ${i + 1}`}</div>
                            {it?.note && <small className="text-muted">{it.note}</small>}
                        </div>
                        <span className="badge bg-secondary">{Number(it?.score ?? 0)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
function PreJson({ data }) {
    return (
        <pre className="mb-0" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
            {JSON.stringify(data, null, 2)}
        </pre>
    );
}
