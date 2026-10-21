import React, { useState, useEffect, useRef, useMemo, useId } from 'react';
import { historyChartModel } from './historyChart.js';
import { NETWORKS } from './networks.js';
import { tokenIconUrl, tokenInitials } from './tokenIcons.js';
export function Icon({ name, size = 20, ...props }) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    wallet: (
      <>
        <path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v11H6a3 3 0 0 1-3-3V6" />
        <path d="M20 12h-6v5h6M17 14.5h.1" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 10 6-10 6L2 9l10-6ZM3 14l9 5 9-5M3 18l9 5 9-5" />
      </>
    ),
    activity: <path d="M2 12h5l3-8 4 16 3-8h5" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="m9 3-1 3-3 1-2 4 2 3v3l4 3 3-1 3 1 4-3v-3l2-3-2-4-3-1-1-3Z" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    up: <path d="M6 18 18 6M6 6h12v12" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    refresh: (
      <>
        <path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    down: <path d="m6 9 6 6 6-6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    key: (
      <>
        <circle cx="8" cy="8" r="5" />
        <path d="m12 12 9 9m-4-4 3-3m-6 0 3-3" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    logout: (
      <>
        <path d="M10 3H3v18h7M9 12h12m-5-5 5 5-5 5" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
      </>
    ),
    moon: <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" />
      </>
    ),
    upload: (
      <>
        <path d="M12 17V5m-5 5 5-5 5 5M4 17v4h16v-4" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
      </>
    ),
    edit: (
      <>
        <path d="m16 3 5 5-12 12H4v-5L16 3ZM13 6l5 5" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 2v6m10-6v6M3 10h18" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10h.01" />
      </>
    ),
    cloud: <path d="M6 19a5 5 0 0 1-1-10 7 7 0 0 1 13-2 6 6 0 0 1 0 12H6Z" />,
    back: <path d="M20 12H4m6-6-6 6 6 6" />,
    sort: (
      <>
        <path d="M7 4v16m-3-3 3 3 3-3M17 20V4m-3 3 3-3 3 3" />
      </>
    )
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.grid}
    </svg>
  );
}
export function Mark({ className = '' }) {
  return (
    <span className={`brand-mark ${className}`.trim()}>
      <img src="/assets/kinko-wallet-logo.png" alt="Kinko Wallet" width="256" height="256" />
    </span>
  );
}
export const shortAddress = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export function Copy({ text, label = 'Copy address', onCopy }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className="icon-button copy"
      title={label}
      aria-label={copied ? 'Copied' : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          onCopy?.();
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1700);
        } catch {
          onCopy?.('Copy failed. Select and copy the text manually.');
        }
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={15} />
      {copied && (
        <span className="copy-tip" role="status">
          Copied
        </span>
      )}
    </button>
  );
}
// Sign-in stays in normal document flow so extension security prompts remain reachable.
export function AccessPage({ title, subtitle, children, onClose }) {
  const heading = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    heading.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus?.();
    };
  }, []);
  return (
    <div className="welcome access-page">
      <header className="welcome-header">
        <button type="button" className="brand" onClick={onClose} aria-label="Kinko Wallet home">
          <Mark />
          <span>
            Kinko<span className="brand-sub">WALLET</span>
          </span>
        </button>
        <span className="watch-badge">
          <Icon name="shield" size={15} />
          Always watch-only
        </span>
      </header>
      <main className="access-main" aria-labelledby="access-title">
        <button type="button" className="button text-button" onClick={onClose}>
          <Icon name="arrow" size={16} className="back-arrow" />
          Back to Kinko
        </button>
        <section className="access-card">
          <h1 id="access-title" ref={heading} tabIndex={-1}>
            {title}
          </h1>
          <p className="access-subtitle">{subtitle}</p>
          {children}
        </section>
      </main>
    </div>
  );
}
export function Modal({ title, subtitle, children, onClose, wide = false, dismissOnBackdrop = true }) {
  const ref = useRef();
  const backdropPress = useRef(false);
  const isBackdrop = (event) => {
    if (event.target !== ref.current) return false;
    const bounds = ref.current.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  useEffect(() => {
    const old = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      old?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        // A lone click (including an extension-generated click) isn't an outside gesture.
        backdropPress.current = dismissOnBackdrop && e.button === 0 && isBackdrop(e);
      }}
      onPointerCancel={() => {
        backdropPress.current = false;
      }}
      onClick={(e) => {
        const dismiss = backdropPress.current && isBackdrop(e);
        backdropPress.current = false;
        if (dismiss) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function DataNotices({ notices, staleBalances, loading, saving, onTrackToken, onRetry }) {
  if (!notices.length) return null;
  return (
    <details className="provider-notice" open={staleBalances || undefined}>
      <summary>
        <Icon name="info" size={16} />
        {notices.length} data {notices.length === 1 ? 'notice' : 'notices'} ·{' '}
        {staleBalances ? 'Some balances are stale or unavailable' : 'Some coverage or prices are incomplete'}
      </summary>
      <ul>
        {notices.map((n) => (
          <li key={`${n.chain}:${n.code || n.message}`}>
            <b>{NETWORKS[n.chain]?.name || n.chain}</b>
            {n.wallets.length > 0 && ` · ${n.wallets.length} wallet${n.wallets.length === 1 ? '' : 's'}`} ·{' '}
            {n.code === 'price-missing' ? 'Price unavailable' : n.code === 'discovery-configuration' ? 'Provider setup needed' : n.kind === 'limitation' ? 'Coverage limit' : 'Read issue'}
            <p>{n.message}</p>
            {n.action === 'track-token' && (
              <button type="button" className="text-link" disabled={saving} onClick={() => onTrackToken(n.chain)}>
                Add a token contract
              </button>
            )}
            {n.action === 'retry' && (
              <button type="button" className="text-link" disabled={loading} onClick={() => onRetry(n.chain)}>
                Retry {NETWORKS[n.chain]?.name}
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
export function Empty({ icon = 'wallet', title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function NetworkBadge({ chain }) {
  return (
    <span className={`network-badge ${chain}`}>
      <i />
      {{ pulse: 'PulseChain', eth: 'Ethereum', base: 'Base', polygon: 'Polygon', bsc: 'BNB Chain' }[chain] || chain}
    </span>
  );
}
const failedIcons = new Map();
function TokenArtwork({ src, symbol }) {
  const [failed, setFailed] = useState(() => (failedIcons.get(src) || 0) > Date.now());
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {(!loaded || failed || !src) && <span className="token-initials">{tokenInitials(symbol)}</span>}
      {src && !failed && (
        <img
          src={src}
          alt=""
          width="32"
          height="32"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className={loaded ? 'loaded' : ''}
          onLoad={() => setLoaded(true)}
          onError={() => {
            failedIcons.set(src, Date.now() + 300000);
            if (failedIcons.size > 512) failedIcons.delete(failedIcons.keys().next().value);
            setFailed(true);
          }}
        />
      )}
    </>
  );
}
export function TokenIcon({ symbol, chain, address }) {
  const src = tokenIconUrl(chain, address);
  return (
    <span className="token-icon" aria-hidden="true">
      <TokenArtwork key={src || 'fallback'} src={src} symbol={symbol} />
      <i style={{ background: { pulse: '#8853cb', eth: '#6075b7', base: '#3269f0', polygon: '#8256d3', bsc: '#b78d22' }[chain] }} />
    </span>
  );
}
export function Sparkline({ values, label, large = false }) {
  const width = 700,
    height = large ? 190 : 40;
  const min = Math.min(...values),
    max = Math.max(...values),
    span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1 || 1)) * width},${height - 10 - ((v - min) / span) * (height - 25)}`)
    .join(' ');
  return (
    <svg
      className={large ? 'history-chart' : 'sparkline'}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity=".15" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {large && (
        <>
          <path
            d={`M0 ${height * 0.2}H${width}M0 ${height * 0.55}H${width}M0 ${height * 0.9}H${width}`}
            stroke="var(--line)"
            strokeDasharray="3 5"
          />
          <polygon points={`0,${height} ${points} ${width},${height}`} fill="url(#chart-fill)" />
        </>
      )}
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={large ? 3 : 2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

const historyStamp = (time) => new Date(time).toLocaleString('en-AU', {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'
});

export function HistoryChart({ observations, money, model }) {
  const [selectedTime, setSelectedTime] = useState(null);
  const width = 700, height = 160, pad = 8;
  const first = observations[0].time, elapsed = observations.at(-1).time - first || 1;
  let min = Infinity, max = -Infinity;
  for (const s of observations) { min = Math.min(min, s.value); max = Math.max(max, s.value); }
  const padding = (max - min) * 0.12 || Math.max(max * 0.005, 1);
  min = Math.max(0, min - padding); max += padding;
  const x = (time) => pad + (time - first) / elapsed * (width - 2 * pad);
  const y = (value) => height - pad - (value - min) / (max - min) * (height - 2 * pad);
  const selectedIndex = Math.max(0, observations.findIndex((s) => s.time === selectedTime));
  const selected = selectedTime === null ? null : observations[selectedIndex];
  const selectAt = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const target = first + (((event.clientX - rect.left) / rect.width * width - pad) / (width - 2 * pad)) * elapsed;
    let nearest = 0;
    for (let i = 1; i < observations.length; i++)
      if (Math.abs(observations[i].time - target) < Math.abs(observations[nearest].time - target)) nearest = i;
    setSelectedTime(observations[nearest].time);
  };
  const keyboard = (event) => {
    const current = selectedTime === null ? observations.length - 1 : selectedIndex;
    const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: observations.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setSelectedTime(observations[Math.max(0, Math.min(observations.length - 1, next))].time);
  };
  return (
    <div className="portfolio-plot">
      <div className="history-inspection" aria-live="polite">
        {selected ? <><strong>{money(selected.value)}</strong><span>{historyStamp(selected.time)} · {selected.partial ? 'Partial coverage' : 'Complete coverage'}</span></>
          : <span>Hover or tap to inspect · arrow keys to browse</span>}
      </div>
      <div className="portfolio-axis-y" aria-label="Portfolio value scale">
        {[max, (min + max) / 2, min].map((v, i) => <span key={i}>{money(v)}</span>)}
      </div>
      <div className="portfolio-plot-input" tabIndex="0" role="slider" aria-label="Portfolio reading"
        aria-valuemin={0} aria-valuemax={observations.length - 1} aria-valuenow={selectedTime === null ? observations.length - 1 : selectedIndex}
        aria-valuetext={`${historyStamp((selected || observations.at(-1)).time)}, ${money((selected || observations.at(-1)).value)}, ${(selected || observations.at(-1)).partial ? 'partial' : 'complete'} coverage`}
        onPointerMove={selectAt} onPointerDown={selectAt} onKeyDown={keyboard} onFocus={() => setSelectedTime(observations.at(-1).time)}>
        <svg className="history-chart" viewBox={`0 0 ${width} ${height}`} role="img"
          aria-label="Saved portfolio readings spaced by time. Shaded gaps have no readings; different asset coverage is not connected." preserveAspectRatio="none">
          {[pad, height / 2, height - pad].map((v) => <path key={v} d={`M0 ${v}H${width}`} stroke="var(--line)" strokeDasharray="3 5" />)}
          {model.gaps.map((gap) => <rect key={gap.from} data-history-gap x={x(gap.from)} y="0" width={x(gap.to) - x(gap.from)} height={height} fill="var(--history-gap)" />)}
          {model.segments.map((points, i) => <g key={i}>
            <polyline data-history-segment points={points.map((p) => `${x(p.time).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')}
              fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeDasharray={points[0].partial ? '5 4' : undefined}
              vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            {points.length === 1 && <circle cx={x(points[0].time)} cy={y(points[0].value)} r="3" fill="var(--accent)" />}
          </g>)}
          {selected && <g><path d={`M${x(selected.time)} 0V${height}`} stroke="var(--muted)" strokeDasharray="3 4" />
            <circle cx={x(selected.time)} cy={y(selected.value)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" /></g>}
        </svg>
        {model.gaps.filter((gap) => (gap.to - gap.from) / elapsed > 0.18).map((gap) =>
          <span key={gap.from} className="history-gap-label" style={{ left: `${(x((gap.from + gap.to) / 2) / width) * 100}%` }}>No readings recorded</span>)}
      </div>
      <div className="portfolio-axis-x"><span>{historyStamp(first)}</span><span>{historyStamp(first + elapsed / 2)}</span><span>{historyStamp(observations.at(-1).time)}</span></div>
      <div className="history-legend"><span className="legend-complete">Complete</span><span className="legend-partial">Partial</span>
        {model.gaps.length > 0 && <span className="legend-gap">No readings recorded</span>}</div>
    </div>
  );
}

function HistoryInfo() {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  return <div className="history-info" data-open={open} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" aria-label="About portfolio history" aria-expanded={open} aria-describedby={tooltipId}
      onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}><Icon name="info" size={16} /></button>
    <div className="history-info-popover" id={tooltipId} role="tooltip">Readings are saved encrypted in this browser for 32 days. Older readings are condensed.
      Collection runs every two minutes while Kinko is open and visible. Partial values exclude stale and unpriced assets.
      Different asset coverage is not comparable. These readings are not investment returns.</div>
  </div>;
}

export function PortfolioReadings({ observations, readings = observations, money, coverageChanged, historyError, historySaving, loading = false, unavailable = false }) {
  const model = useMemo(() => historyChartModel(observations), [observations]);
  const latest = observations.at(-1);
  if (!latest) return null;
  return (
    <div className="portfolio-readings">
      <div className="history-value-row">
        <div className="chart-amount">{money(latest.value)}<span>{latest.partial ? 'Partial value' : 'Liquid value'}</span></div>
        <HistoryInfo />
      </div>
      <p className="history-status" role="status">
        <span className={loading || historySaving ? 'history-status-dot updating' : 'history-status-dot'} />
        {historySaving ? 'Saving reading…' : `${historyError ? 'Last reading' : 'Last saved'} ${historyStamp(latest.time)}`}
        {loading ? ' · Updating…' : unavailable ? ' · Some networks unavailable · Previous history retained' : ''}
      </p>
      {model.sparse ? (
        <div className="history-building">
          <div className="history-building-heading"><span className="history-building-icon"><Icon name="activity" size={20} /></span>
            <div><h3>History building</h3><p>{readings.length} saved reading{readings.length === 1 ? '' : 's'} · {model.sessionCount} recording session{model.sessionCount === 1 ? '' : 's'}</p></div>
          </div>
          <p>{model.gaps.length ? 'Readings are separated by time away. More comparable readings will build a useful trend.' : 'A trend appears as more readings with the same asset coverage are recorded.'}</p>
          <div className="history-recent">
            {readings.slice(-3).reverse().map((s) => <div key={`${s.time}:${s.coverage}`}><time dateTime={new Date(s.time).toISOString()}>{historyStamp(s.time)}</time><strong>{money(s.value)}</strong><span>{s.partial ? 'Partial' : 'Complete'}</span></div>)}
          </div>
        </div>
      ) : <HistoryChart key={latest.scope} observations={observations} money={money} model={model} />}
      {coverageChanged && <p className="history-coverage-note"><Icon name="info" size={13} />Asset coverage changed. Values across different coverage cannot be compared.</p>}
      {historyError && <p className="history-note" role="alert">{historyError}</p>}
      <details className="history-saved-readings">
        <summary>View saved readings <span>{readings.length}</span></summary>
        <div className="reading-table-wrap"><table className="reading-table">
          <caption className="sr-only">Most recent saved portfolio readings</caption>
          <thead><tr><th>Recorded</th><th>Liquid value</th><th>Coverage</th></tr></thead>
          <tbody>{readings.slice(-50).reverse().map((s) => <tr key={`${s.scope}:${s.time}:${s.coverage}`}>
            <td>{historyStamp(s.time)}</td><td>{money(s.value)}</td><td>{s.partial ? 'Partial' : 'Complete'}</td>
          </tr>)}</tbody>
        </table>{readings.length > 50 && <p className="history-note">Showing the latest 50 readings in this range.</p>}</div>
      </details>
    </div>
  );
}
