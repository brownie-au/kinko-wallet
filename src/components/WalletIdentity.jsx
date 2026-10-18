import { useEffect, useRef, useState } from 'react';

export default function WalletIdentity({ name, address }) {
  const [notice, setNotice] = useState('');
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(address);
      setNotice('Copied');
    } catch {
      setNotice('Unable to copy. Open the address to select it.');
    }
    timer.current = setTimeout(() => setNotice(''), 2500);
  };
  return (
    <div className="kw-identity-row">
      {name && <strong className="kw-identity-name">{name}</strong>}
      <details className="kw-address-disclosure">
        <summary aria-label={`View full wallet address ${address}`} title={address}>
          {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'No address'}
        </summary>
        <span className="kw-full-address">{address}</span>
      </details>
      <button
        type="button"
        className="kw-copy-btn kw-identity-copy"
        onClick={copy}
        aria-label="Copy wallet address"
        title="Copy wallet address"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
        </svg>
      </button>
      <span className="kw-copy-feedback" role="status">
        {notice}
      </span>
    </div>
  );
}
