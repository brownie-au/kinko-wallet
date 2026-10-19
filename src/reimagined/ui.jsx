import React, { useState, useEffect, useRef } from 'react';
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
export function Mark() {
  return (
    <span className="brand-mark">
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M9 5v22M25 5 14 16l11 11M9 16h5" stroke="currentColor" strokeWidth="3.4" strokeLinejoin="round" />
      </svg>
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
export function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef();
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
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
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
export function TokenIcon({ symbol, chain }) {
  return (
    <span className={`token-icon token-${symbol?.toLowerCase()}`}>
      <span>
        {symbol === 'ETH'
          ? '♦'
          : symbol === 'HEX'
            ? '⬡'
            : symbol === 'PLS'
              ? 'ϟ'
              : symbol === 'PLSX'
                ? '×'
                : symbol === 'USDC'
                  ? '$'
                  : symbol?.slice(0, 2)}
      </span>
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
