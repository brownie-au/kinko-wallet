import { splitTokens, tokenKey, assetListTokens } from './tokenFilter.js';
import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { generateAccessKey, deriveAccess, encryptWatchlist, decryptWatchlist, normalizeKey } from './crypto.js';
import {
  blankWatchlist,
  validateWatchlist,
  createVault,
  readVault,
  saveVault,
  vaultRequest,
  writeLocalEncrypted,
  clearCachedPublicData
} from './vault.js';
import { createDeviceSessions, forgetDeviceAccess, resumeWatchlist, LOGOUT_STORAGE_KEY } from './deviceSession.js';
import { NETWORKS } from './networks.js';
import { portfolioHistory, identifyObservation } from './portfolioHistory.js';
import { dataNotices, portfolioObservation, appendObservation, observationSeries } from './dataQuality.js';
import { aggregateHoldings } from '../services/portfolioAggregation.js';
import { addDecimal } from '../utils/tokenMath.js';
import { isAddress } from './validation.js';
import {
  Icon,
  Mark,
  Copy,
  Modal,
  AccessPage,
  DataNotices,
  PortfolioReadings,
  Empty,
  NetworkBadge,
  TokenIcon,
  Sparkline,
  shortAddress
} from './ui.jsx';
import { demoRows, demoWatchlist, demoStakes } from './demo.js';
import './styles.css';
const date = (v) => new Date(v).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const number = (v, dp = 2) => Number(v).toLocaleString('en-AU', { maximumFractionDigits: dp });
const nav = [
  ['overview', 'grid', 'Overview'],
  ['assets', 'layers', 'Assets'],
  ['wallets', 'wallet', 'Watch wallets'],
  ['stakes', 'calendar', 'HEX staking'],
  ['activity', 'activity', 'Activity']
];
async function api(action, chain, address, contracts = [], excludedContracts = []) {
  const r = await fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, chain, address, contracts, excludedContracts }),
    signal: AbortSignal.timeout(55000)
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Data unavailable');
  return d;
}
function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Welcome({ onCreate, onRestore, onDemo }) {
  return (
    <div className="welcome">
      <header className="welcome-header">
        <a className="brand" href="#">
          <Mark />
          <span>
            Kinko<span className="brand-sub">WALLET</span>
          </span>
        </a>
        <span className="watch-badge">
          <Icon name="shield" size={15} />
          Always watch-only
        </span>
        <button className="button subtle" onClick={onRestore}>
          Access my Kinko <Icon name="arrow" size={16} />
        </button>
      </header>
      <main className="welcome-grid">
        <div className="welcome-copy">
          <div className="eyebrow">
            <span /> A CLEARER VIEW OF YOUR CRYPTO
          </div>
          <h1>
            Your keys.
            <br />
            Your coins.
            <br />
            <em>Your control.</em>
          </h1>
          <p className="welcome-intro">
            All your wallets. Your HEX stakes. One beautifully clear view. Kinko keeps you informed, while your crypto stays yours.
          </p>
          <div className="welcome-actions">
            <button className="button primary" onClick={onCreate}>
              Create my Kinko Wallet <Icon name="arrow" size={18} />
            </button>
            <button className="button text-button" onClick={onDemo}>
              Take a look around <Icon name="chevron" size={16} />
            </button>
          </div>
          <div className="welcome-points">
            <span>
              <Icon name="check" size={16} />
              No email or registration
            </span>
            <span>
              <Icon name="check" size={16} />
              Encrypted watchlists
            </span>
            <span>
              <Icon name="check" size={16} />
              No wallet connection
            </span>
          </div>
        </div>
        <div className="welcome-art" aria-label="Illustrative Kinko portfolio preview">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-k">金庫</div>
          <div className="preview-card">
            <div className="preview-top">
              <span>
                <Mark /> Portfolio overview
              </span>
              <span className="tiny-label">ILLUSTRATIVE PREVIEW</span>
            </div>
            <p>One clear view</p>
            <h2>
              Your portfolio,
              <br />
              at a glance.
            </h2>
            <Sparkline
              values={[22, 25, 24, 32, 30, 40, 38, 49, 46, 53, 50, 63, 61, 74, 72, 81]}
              large
              label="Illustrative design preview; not live market data"
            />
            <div className="preview-bottom">
              <span>
                <i className="chain-dot pulse" />
                PulseChain
              </span>
              <span>
                <i className="chain-dot eth" />
                Ethereum
              </span>
              <span>+ more networks</span>
            </div>
          </div>
          <div className="floating-note">
            <span className="note-icon">
              <Icon name="lock" />
            </span>
            <span>
              Your watchlist. Encrypted.<small>Restore it with your Kinko Access Key.</small>
            </span>
            <Icon name="check" size={17} />
          </div>
        </div>
      </main>
      <footer className="welcome-footer">
        <span>
          <Icon name="shield" size={18} />
          <b>Not your keys, not your coins.</b> Never share your seed phrase.
        </span>
        <span>金庫 · Japanese for “vault”</span>
      </footer>
    </div>
  );
}
function AccessFlow({ mode, onClose, onOpen, toast }) {
  const [key, setKey] = useState(() => (mode === 'new' ? generateAccessKey() : ''));
  const [saved, setSaved] = useState(false),
    [suffix, setSuffix] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [backup, setBackup] = useState(null),
    [localAvailable, setLocalAvailable] = useState(false),
    [remember, setRemember] = useState(false);
  const completeOpen = async (access, data, rev, storage) => {
    let warning = '';
    try {
      await createDeviceSessions().save(key, remember, storage);
    } catch (error) {
      if (error.code === 'SESSION_CANCELLED') throw error;
      try {
        await forgetDeviceAccess();
      } catch {}
      warning = 'Browser storage is unavailable. You are signed in for this page only; keep your Access Key for next time.';
    }
    await onOpen(access, data, rev, storage);
    if (warning) toast(warning);
  };
  const valid = mode !== 'new' || (saved && suffix.trim().toUpperCase() === key.slice(-4));
  const open = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const normalized = normalizeKey(key);
      const access = await deriveAccess(normalized);
      if (backup) {
        const data = validateWatchlist(await decryptWatchlist(access, backup.envelope));
        await completeOpen(access, data, backup.revision || 0, 'local');
        return;
      }
      if (mode === 'new') {
        const data = blankWatchlist();
        const r = await createVault(access, data);
        await completeOpen(access, data, r.revision, 'cloud');
      } else {
        try {
          const r = await readVault(access);
          await completeOpen(access, r.data, r.revision, 'cloud');
        } catch (err) {
          setLocalAvailable(!!localStorage.getItem(`kinko:vault:${access.id}`));
          throw err;
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const openLocal = async () => {
    setBusy(true);
    try {
      const access = await deriveAccess(key);
      const cached = JSON.parse(localStorage.getItem(`kinko:vault:${access.id}`));
      const data = validateWatchlist(await decryptWatchlist(access, cached.envelope));
      await completeOpen(access, data, cached.revision, 'local');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const AccessSurface = mode === 'new' ? Modal : AccessPage;
  return (
    <AccessSurface
      title={mode === 'new' ? 'Your Kinko starts here.' : 'Welcome back.'}
      subtitle={mode === 'new' ? 'A private watchlist. No email. No wallet connection.' : 'Your Access Key brings your watchlist back.'}
      onClose={onClose}
      dismissOnBackdrop={false}
    >
      <form onSubmit={open} data-form-type="other">
        <div className="notice">
          <Icon name="key" />
          <p>
            <b>This is a Kinko Access Key.</b> It unlocks saved watchlists only. Never enter your cryptocurrency private key or seed phrase.
          </p>
        </div>
        <label className="field-label" htmlFor="access-key">
          Kinko Access Key
        </label>
        <div className="key-input-wrap">
          <textarea
            id="access-key"
            data-form-type="other"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            readOnly={mode === 'new'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="KINKO-XXXXXXXX-…"
            rows="3"
            required
          />
          {mode === 'new' && <Copy text={key} label="Copy Kinko Access Key" onCopy={(m) => m && toast(m)} />}
        </div>
        {mode === 'new' ? (
          <>
            <p className="muted small">
              Save this somewhere safe. If you lose it, we cannot recover your watchlist. Your actual cryptocurrency is unaffected.
            </p>
            <label className="check-label">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I have saved my Access Key securely.
            </label>
            <label className="field-label" htmlFor="key-confirm">
              Confirm the last 4 characters of your saved key
            </label>
            <input
              id="key-confirm"
              data-form-type="other"
              className="input"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              maxLength={4}
              autoComplete="off"
              placeholder="Last 4 characters"
            />
          </>
        ) : (
          <div className="backup-import">
            <label className="file-button">
              <Icon name="upload" size={16} />
              Use an encrypted backup
              <input
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  try {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 180000) throw new Error('Backup is too large.');
                    const d = JSON.parse(await f.text());
                    if (d.app !== 'Kinko Wallet' || d.version !== 2 || !d.envelope) throw new Error('Choose a Kinko encrypted backup.');
                    setBackup(d);
                    setError('');
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              />
            </label>
            {backup && <p className="small">Encrypted backup selected. Enter its Access Key above.</p>}
          </div>
        )}
        <div className="remember-device">
          <label className="check-label" htmlFor="remember-device">
            <input
              id="remember-device"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={busy}
              aria-describedby="remember-device-help"
            />
            Remember This Device
          </label>
          <p id="remember-device-help" className="small muted">
            {remember
              ? 'Stay signed in on this browser after closing it. Only use on a device you trust.'
              : 'Stay signed in for this tab session, including page refreshes.'}
          </p>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="button primary full" disabled={!valid || busy}>
          {busy ? 'Opening your watchlist…' : mode === 'new' ? 'Create my encrypted watchlist' : 'Unlock my watchlist'}
          <Icon name="arrow" size={17} />
        </button>
        {localAvailable && (
          <button type="button" className="button full subtle" onClick={openLocal} disabled={busy}>
            Open this browser’s encrypted copy
          </button>
        )}
        <p className="small muted center">No key is sent to the server. Keep your device and browser secure.</p>
      </form>
    </AccessSurface>
  );
}
function WalletForm({ wallet, onClose, onSave, busy, error }) {
  const [name, setName] = useState(wallet?.name || ''),
    [address, setAddress] = useState(wallet?.address || ''),
    [networks, setNetworks] = useState(wallet?.networks || ['pulse', 'eth']);
  const [message, setMessage] = useState('');
  return (
    <Modal
      title={wallet ? 'Edit watch wallet' : 'Add a watch wallet'}
      subtitle="Just the public address. Your crypto stays exactly where it is."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!isAddress(address)) {
            setMessage('Enter a valid EVM public address. Check its checksum and all 42 characters.');
            return;
          }
          if (!networks.length) {
            setMessage('Choose at least one network.');
            return;
          }
          onSave({ address: address.trim(), name: name.trim(), networks, hidden: false });
        }}
      >
        <label className="field-label" htmlFor="wallet-name">
          Wallet name
        </label>
        <input
          id="wallet-name"
          className="input"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Long-term holdings"
          required
        />
        <label className="field-label" htmlFor="wallet-address">
          Public wallet address
        </label>
        <input
          id="wallet-address"
          className="input mono"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x…"
          required
          readOnly={!!wallet}
          autoComplete="off"
          spellCheck="false"
        />
        <label className="field-label">Networks to monitor</label>
        <div className="network-options">
          {Object.entries(NETWORKS).map(([k, n]) => (
            <label key={k} className={networks.includes(k) ? 'selected' : ''}>
              <input
                type="checkbox"
                checked={networks.includes(k)}
                onChange={() => setNetworks((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))}
              />
              <i style={{ background: n.color }} />
              {n.name}
              <Icon name="check" size={14} />
            </label>
          ))}
        </div>
        <div className="notice small">
          <Icon name="shield" size={20} />
          <p>Watch-only, always. No connection requests. No transaction permissions. Never share your seed phrase.</p>
        </div>
        {(message || error) && (
          <p className="error" role="alert">
            {message || error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? 'Saving…' : wallet ? 'Save wallet' : 'Add watch wallet'}
          <Icon name="plus" size={17} />
        </button>
      </form>
    </Modal>
  );
}
export function App() {
  const [session, setSession] = useState(null),
    [data, setData] = useState(blankWatchlist),
    [revision, setRevision] = useState(0),
    [mode, setMode] = useState('cloud'),
    [flow, setFlow] = useState(null),
    [restoring, setRestoring] = useState(true),
    [page, setPage] = useState('overview'),
    [walletFilter, setWalletFilter] = useState('all'),
    [chainFilter, setChainFilter] = useState('all'),
    [privacy, setPrivacy] = useState(false),
    [search, setSearch] = useState(''),
    [notice, setNotice] = useState(''),
    [modal, setModal] = useState(null),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false),
    [syncError, setSyncError] = useState(''),
    [results, setResults] = useState({}),
    [stakeResults, setStakeResults] = useState({}),
    [activities, setActivities] = useState({}),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [fx, setFx] = useState(null),
    [sort, setSort] = useState('value'),
    [hideDust, setHideDust] = useState(false),
    [stakeStatus, setStakeStatus] = useState('all'),
    [history, setHistory] = useState([]),
    [historyError, setHistoryError] = useState(''),
    [historySaving, setHistorySaving] = useState(false),
    [range, setRange] = useState(30);
  const savingRef = useRef(false),
    noticeTimer = useRef(),
    generation = useRef(0);
  const demo = session === 'demo';
  const toast = (text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 4000);
  };
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  useEffect(() => {
    document.documentElement.dataset.theme = data.theme;
  }, [data.theme]);
  useEffect(() => {
    const fn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [dirty]);
  const open = async (access, next, rev, storage) => {
    const openedGeneration = generation.current;
    let savedHistory = [],
      historyMessage = '';
    try {
      savedHistory = await portfolioHistory.load(access);
    } catch {
      historyMessage = 'Previous browser history could not be restored. New readings will start here.';
    }
    if (generation.current !== openedGeneration) return;
    setHistory(savedHistory);
    setHistoryError(historyMessage);
    setHistorySaving(false);
    setSession(access);
    setData(next);
    setRevision(rev);
    setMode(storage);
    setFlow(null);
    setDirty(false);
    setSyncError('');
    setPage('overview');
    try {
      writeLocalEncrypted(access, await encryptWatchlist(access, next), rev);
    } catch {
      toast('Encrypted browser backup could not be saved. Export a backup from Settings.');
    }
  };
  const clearWorkspace = () => {
    generation.current++;
    setSession(null);
    setData(blankWatchlist());
    setResults({});
    setStakeResults({});
    setActivities({});
    setHistory([]);
    setHistoryError('');
    setHistorySaving(false);
    setSyncError('');
    setDirty(false);
    setWalletFilter('all');
    setChainFilter('all');
    setModal(null);
    setFlow(null);
    clearCachedPublicData();
  };
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const saved = await createDeviceSessions().restore();
        if (saved && !cancelled) {
          const result = await resumeWatchlist(saved);
          if (!cancelled) await open(saved.access, result.data, result.revision, result.mode);
        }
      } catch (error) {
        // An offline outage can be retried next visit; rejected/corrupt credentials are removed.
        if (error.status === 401 || error.status === 404 || /authentication|JSON/.test(error.message)) {
          try {
            await forgetDeviceAccess();
          } catch {}
        }
        if (!cancelled) toast('Saved access could not be restored. Please enter your Kinko Access Key.');
      } finally {
        if (!cancelled) setRestoring(false);
      }
    };
    const loggedOutElsewhere = (event) => {
      if (event.key !== LOGOUT_STORAGE_KEY || !event.newValue) return;
      cancelled = true;
      try {
        sessionStorage.removeItem('kinko:authentication:v1');
      } catch {}
      clearWorkspace();
      setRestoring(false);
    };
    window.addEventListener('storage', loggedOutElsewhere);
    restore();
    return () => {
      cancelled = true;
      window.removeEventListener('storage', loggedOutElsewhere);
    };
  }, []);
  const persist = async (next) => {
    if (savingRef.current) return false;
    if (demo) {
      setData(next);
      return true;
    }
    savingRef.current = true;
    setSaving(true);
    setSyncError('');
    setData(next);
    setDirty(true);
    try {
      let rev = revision;
      if (mode === 'cloud') {
        const r = await saveVault(session, next, revision);
        rev = r.revision;
        setRevision(rev);
      }
      writeLocalEncrypted(session, await encryptWatchlist(session, next), rev);
      setDirty(false);
      return true;
    } catch (e) {
      setSyncError(e.message);
      try {
        writeLocalEncrypted(session, await encryptWatchlist(session, next), revision);
      } catch {}
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const reload = async () => {
    if (demo) return;
    if (
      dirty &&
      !window.confirm('Replace pending edits with the saved cloud copy? Export an encrypted backup first if you need these edits.')
    )
      return;
    setSaving(true);
    try {
      const r = await readVault(session);
      await open(session, r.data, r.revision, 'cloud');
      toast('Saved watchlist restored.');
    } catch (e) {
      setSyncError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const signOut = async () => {
    if (dirty && !window.confirm('Your edits have not synced. Export an encrypted backup before leaving. Sign out anyway?')) return;
    let error;
    if (!demo) {
      try {
        await forgetDeviceAccess();
      } catch (e) {
        error = e;
      }
    }
    clearWorkspace();
    if (error) toast(error.message);
  };
  const walletSignature = JSON.stringify(data.wallets.map((w) => [w.address, w.networks]));
  const contractSignature = JSON.stringify([data.tokens || [], data.hiddenTokens || []]);
  useEffect(() => {
    if (!session) return;
    if (demo) {
      setResults({});
      setStakeResults({});
      setLoading(false);
      return;
    }
    const g = ++generation.current;
    let stopped = false;
    setLoading(true);
    const jobs = [];
    for (const w of data.wallets) for (const c of w.networks) jobs.push({ w, c });
    const activeKeys = new Set(jobs.map(({ w, c }) => `${w.address.toLowerCase()}:${c}`));
    setResults((p) => Object.fromEntries(Object.entries(p).filter(([k]) => activeKeys.has(k))));
    setStakeResults((p) => Object.fromEntries(Object.entries(p).filter(([k]) => activeKeys.has(k))));
    let index = 0;
    const run = async () => {
      while (index < jobs.length) {
        const { w, c } = jobs[index++];
        const key = `${w.address.toLowerCase()}:${c}`;
        const contracts = (data.tokens || []).filter((t) => t.chain === c).map((t) => t.address);
        try {
          const d = await api('holdings', c, w.address, contracts, (data.hiddenTokens || []).filter((t) => t.chain === c).map((t) => t.address));
          if (!stopped && generation.current === g) setResults((p) => ({ ...p, [key]: { ...d, error: null } }));
        } catch (e) {
          if (!stopped && generation.current === g)
            setResults((p) => ({ ...p, [key]: { ...(p[key] || { rows: [], asOf: null }), error: e.message, stale: true } }));
        }
      }
    };
    Promise.all(Array.from({ length: Math.min(3, jobs.length) }, run)).finally(() => {
      if (!stopped && generation.current === g) setLoading(false);
    });
    return () => {
      stopped = true;
    };
  }, [session, walletSignature, contractSignature, refresh]);
  useEffect(() => {
    if (!session || demo) return;
    let stopped = false;
    api('fx')
      .then((d) => !stopped && setFx(d))
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [session, demo]);
  useEffect(() => {
    if (!session || demo || !['stakes', 'overview'].includes(page)) return;
    let stop = false;
    let i = 0;
    const jobs = data.wallets.flatMap((w) => w.networks.filter((c) => c === 'eth' || c === 'pulse').map((c) => ({ w, c })));
    const run = async () => {
      while (i < jobs.length) {
        const { w, c } = jobs[i++];
        const key = `${w.address.toLowerCase()}:${c}`;
        try {
          const d = await api('stakes', c, w.address);
          if (!stop) setStakeResults((p) => ({ ...p, [key]: d }));
        } catch (e) {
          if (!stop) setStakeResults((p) => ({ ...p, [key]: { ...(p[key] || {}), error: e.message, stale: true } }));
        }
      }
    };
    Promise.all([run(), run()]);
    return () => {
      stop = true;
    };
  }, [session, walletSignature, page, refresh]);
  useEffect(() => {
    if (!session || demo || page !== 'activity') return;
    let stop = false;
    const jobs = data.wallets.flatMap((w) => w.networks.map((c) => ({ w, c })));
    let index = 0;
    const run = async () => {
      while (index < jobs.length) {
        const { w, c } = jobs[index++];
        const key = `${w.address.toLowerCase()}:${c}`;
        try {
          const d = await api('activity', c, w.address);
          if (!stop) setActivities((p) => ({ ...p, [key]: d }));
        } catch (e) {
          if (!stop) setActivities((p) => ({ ...p, [key]: { error: e.message, chain: c, wallet: w.address } }));
        }
      }
    };
    Promise.all([run(), run()]);
    return () => {
      stop = true;
    };
  }, [session, walletSignature, page, refresh]);
  const selectedWallets = data.wallets.filter((w) => walletFilter === 'all' || w.address.toLowerCase() === walletFilter);
  const matches = (r) =>
    selectedWallets.some((w) => w.address.toLowerCase() === r.wallet?.toLowerCase()) && (chainFilter === 'all' || r.chain === chainFilter);
  const scopedResults = Object.entries(results)
    .filter(
      ([k]) =>
        selectedWallets.some((w) => k.startsWith(w.address.toLowerCase() + ':')) && (chainFilter === 'all' || k.endsWith(':' + chainFilter))
    )
    .map(([key, v]) => ({ ...v, wallet: key.split(':')[0], chain: key.split(':')[1] }));
  const rawRows = demo
    ? demoRows
    : Object.values(results).flatMap((r) => (r.rows || []).map((t) => ({ ...t, stale: !!(r.stale || t.stale) })));
  const screened = splitTokens(rawRows.filter(matches), data.tokens, data.hiddenTokens);
  const rows = screened.visible;
  const filteredTokens = [...new Map([
    ...scopedResults.flatMap((r) => (r.filtered || []).map((t) => ({ ...t, chain: r.chain }))),
    ...screened.filtered,
    ...(data.hiddenTokens || []).filter((t) => (chainFilter === 'all' || chainFilter === t.chain) && selectedWallets.some((w) => w.networks.includes(t.chain)))
      .map((t) => ({ ...rawRows.find((r) => tokenKey(r.chain, r.address) === tokenKey(t.chain, t.address)), ...t, reason: 'Hidden by you' }))
  ].map((t) => [tokenKey(t.chain, t.address), t])).values()]
    .filter((t) => !rows.some((r) => tokenKey(r.chain, r.address) === tokenKey(t.chain, t.address)));
  const setTokenHidden = async (token, hidden) => {
    const prior = data.hiddenTokens || [];
    const key = tokenKey(token.chain, token.address);
    if (hidden && prior.length >= 100) { toast('Maximum 100 hidden contracts per watchlist.'); return; }
    const next = prior.filter((t) => tokenKey(t.chain, t.address) !== key);
    if (hidden) next.push({ chain: token.chain, address: token.address });
    if (await persist({ ...data, hiddenTokens: next })) { setModal(null); toast(hidden ? 'Token hidden. Review filtered tokens on Assets to restore it.' : 'Token restored. Its balance will be refreshed.'); }
  };
  const aggregate = aggregateHoldings(rows);
  const allStakes = (
    demo ? demoStakes : Object.values(stakeResults).flatMap((r) => (r.stakes || []).map((s) => ({ ...s, stale: r.stale })))
  ).filter(matches);
  const stakes = allStakes
    .filter(
      (s) =>
        stakeStatus === 'all' ||
        (stakeStatus === 'active' ? ['Active', 'Due soon', 'Pending'].includes(s.status) : s.status === stakeStatus)
    )
    .sort((a, b) => a.endTime - b.endTime);
  const currency = data.currency === 'AUD' && fx ? 'AUD' : 'USD',
    rate = currency === 'AUD' ? fx.rate : 1;
  const money = (value) =>
    privacy
      ? '••••••'
      : value == null
        ? '—'
        : new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value * rate);
  const price = (value) =>
    privacy
      ? '••••••'
      : value == null
        ? '—'
        : new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: value * rate < 1 ? 8 : 2 }).format(
            value * rate
          );
  const quantity = (value, dp = 4) => (privacy ? '••••' : number(value, dp));
  const issues = scopedResults.flatMap((r) => [...(r.issues || []), ...(r.error ? [r.error] : [])]);
  const notices = dataNotices(scopedResults, rawRows.filter(matches), {
    tracked: data.tokens, hidden: data.hiddenTokens, loading
  });
  const unknown = rows.filter((t) => Number(t.amountExact) > 0 && t.priceUsd == null).length;
  const priced = rows.some((t) => t.priceUsd != null);
  const unavailable = !demo && (issues.length > 0 || rows.some((t) => t.stale));
  const staleBalances = !demo && scopedResults.some((r) => r.stale || r.error);
  const total = priced ? aggregate.totalUsd : rows.length === 0 && !loading && scopedResults.length > 0 && !issues.length ? 0 : null;
  const observedAt = Math.max(0, ...scopedResults.map((r) => r.asOf || 0));
  const scopeKey = `${walletFilter}:${chainFilter}`;
  const observationKey = demo ? '' : JSON.stringify(portfolioObservation({ rows, results: scopedResults, scope: scopeKey, loading }));
  useEffect(() => {
    if (!observationKey) return;
    let cancelled = false;
    identifyObservation(JSON.parse(observationKey))
      .then((sample) => {
        if (!cancelled) setHistory((prior) => appendObservation(prior, sample));
      })
      .catch(() => setHistoryError('This reading could not be saved. Keep the page open and retry.'));
    return () => {
      cancelled = true;
    };
  }, [observationKey]);
  useEffect(() => {
    if (!session || demo || !history.length) return;
    setHistorySaving(true);
    let cancelled = false;
    const timer = setTimeout(
      () =>
        portfolioHistory
          .save(session, history)
          .then(() => {
            if (!cancelled) {
              setHistoryError('');
              setHistorySaving(false);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setHistoryError('Browser storage is unavailable. These readings are kept only while this page is open.');
              setHistorySaving(false);
            }
          }),
      250
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [history, session, demo]);
  useEffect(() => {
    if (!session || demo || loading) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) setRefresh((value) => value + 1);
    }, 120000);
    return () => clearInterval(timer);
  }, [session, demo, loading]);
  const { observations, readings, coverageChanged } = observationSeries(history, scopeKey, range);
  const lastObservation = observations.at(-1);
  const tokens = aggregate.tokens
    .filter((t) => `${t.name} ${t.symbol} ${t.address || ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.symbol.localeCompare(b.symbol) : (b.valueUsd || 0) - (a.valueUsd || 0)));
  const listedTokens = assetListTokens(tokens, { tracked: data.tokens, showUnpriced: data.showUnpricedTokens, hideDust });
  const defaultAssetTokens = assetListTokens(tokens, { tracked: data.tokens });
  const unpricedCount = tokens.length - defaultAssetTokens.length;
  const expectedStakeReads = selectedWallets.reduce(
    (n, w) => n + w.networks.filter((c) => (c === 'eth' || c === 'pulse') && (chainFilter === 'all' || chainFilter === c)).length,
    0
  );
  const availableStakeReads = Object.entries(stakeResults).filter(
    ([k, r]) =>
      !r.error &&
      Array.isArray(r.stakes) &&
      selectedWallets.some((w) => k.startsWith(w.address.toLowerCase() + ':')) &&
      (chainFilter === 'all' || k.endsWith(':' + chainFilter))
  ).length;
  const stakeCoverage = demo || availableStakeReads === expectedStakeReads;
  const stakingPrincipal = allStakes.reduce((sum, s) => addDecimal(sum, s.principal), '0');
  const tShares = allStakes.reduce((sum, s) => addDecimal(sum, s.tShares), '0');
  const upcoming = allStakes
    .filter((s) => !s.unlockedDay)
    .sort((a, b) => a.endTime - b.endTime)
    .slice(0, 3);
  const exportBackup = async () => {
    if (demo) {
      toast('Create your own watchlist to export an encrypted backup.');
      return;
    }
    download('kinko-encrypted-watchlist.json', {
      app: 'Kinko Wallet',
      version: 2,
      revision,
      envelope: await encryptWatchlist(session, data)
    });
    toast('Encrypted backup downloaded. Keep your Access Key separately.');
  };
  const addWallet = () => setModal({ kind: 'wallet' });
  if (restoring)
    return (
      <div className="fatal" role="status">
        <Mark />
        <h1>Opening your Kinko…</h1>
        <p>Restoring saved access on this browser.</p>
      </div>
    );
  if (!session)
    return (
      <>
        <div hidden={flow === 'restore'}>
          <Welcome
            onCreate={() => setFlow('new')}
            onRestore={() => setFlow('restore')}
            onDemo={() => {
              setSession('demo');
              setData(demoWatchlist);
              setMode('demo');
              setPage('overview');
            }}
          />
        </div>
        {flow && <AccessFlow mode={flow} onClose={() => setFlow(null)} onOpen={open} toast={toast} />}{' '}
        {notice && (
          <div className="toast" role="status">
            {notice}
          </div>
        )}
      </>
    );
  const totalsByChain = Object.entries(NETWORKS)
    .map(([chain, n]) => ({ ...n, chain, value: rows.filter((t) => t.chain === chain).reduce((s, t) => s + (t.valueUsd || 0), 0) }))
    .filter((n) => n.value > 0)
    .sort((a, b) => b.value - a.value);
  const navTo = (p) => {
    setPage(p);
    setSearch('');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            navTo('overview');
          }}
        >
          <Mark />
          <span>
            Kinko<span className="brand-sub">WALLET</span>
          </span>
        </a>
        <div className="sidebar-eyebrow">YOUR PORTFOLIO</div>
        <nav aria-label="Main navigation">
          {nav.map(([id, icon, label]) => (
            <button key={id} className={page === id ? 'nav-item active' : 'nav-item'} onClick={() => navTo(id)}>
              <Icon name={icon} size={19} />
              <span>{label}</span>
              {id === 'stakes' && <i className="nav-dot" />}
              {id === 'wallets' && <small>{data.wallets.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="custody-note">
            <span>
              <Icon name="shield" size={21} />
              Your keys. Your control.
            </span>
            <p>
              We see the numbers.
              <br />
              Only you hold the crypto.
            </p>
            <b>100% watch-only</b>
          </div>
          <button className={page === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => navTo('settings')}>
            <Icon name="settings" size={19} />
            Settings & security
          </button>
          <button className="nav-item" onClick={signOut}>
            <Icon name="logout" size={18} />
            {demo ? 'Exit demo' : 'Lock & sign out'}
          </button>
          <div className="sidebar-version">
            <span>KINKO WALLET</span>
            <span>REIMAGINED</span>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="mobile-brand">
            <Mark />
            <strong>Kinko</strong>
          </div>
          <div className="breadcrumb">
            My workspace <Icon name="chevron" size={13} />
            <strong>{nav.find((n) => n[0] === page)?.[2] || 'Settings & security'}</strong>
          </div>
          <div className="top-actions">
            <span className="watch-badge">
              <Icon name="shield" size={14} />
              Watch-only
            </span>
            <button
              className="icon-button"
              onClick={() => setPrivacy((v) => !v)}
              aria-label={privacy ? 'Show balances' : 'Hide balances'}
              title={privacy ? 'Show balances' : 'Hide balances'}
            >
              <Icon name={privacy ? 'lock' : 'eye'} size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Toggle light or dark theme"
              onClick={() => persist({ ...data, theme: data.theme === 'dark' ? 'light' : 'dark' })}
              disabled={saving || dirty}
            >
              <Icon name={data.theme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>
            <span className="workspace-avatar">K</span>
          </div>
        </header>
        <main className="workspace">
          {demo && (
            <div className="demo-banner">
              <span>
                <b>Illustrative demo</b> · Sample balances and stakes. No live financial data.
              </span>
              <button
                onClick={() => {
                  signOut();
                  setFlow('new');
                }}
              >
                Create my Kinko <Icon name="arrow" size={15} />
              </button>
            </div>
          )}
          {mode === 'local' && (
            <div className="notice amber">
              <Icon name="info" />
              <p>
                <b>Local encrypted copy.</b> Cross-device sync is not active. Export a backup or restore the cloud copy in Settings.
              </p>
            </div>
          )}
          {syncError && (
            <div className="sync-error" role="alert">
              <span>
                <b>Watchlist not synced.</b> {syncError}
              </span>
              <div>
                <button className="button small-button" onClick={exportBackup}>
                  Export pending edits
                </button>
                <button className="button small-button" onClick={reload} disabled={saving}>
                  Load saved copy
                </button>
                <button className="button small-button" onClick={() => persist(data)} disabled={saving}>
                  Retry save
                </button>
              </div>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow small-eyebrow">YOUR CRYPTO. YOUR PERSPECTIVE.</div>
              <h1>
                {
                  {
                    overview: 'A little clarity. A lot of control.',
                    assets: 'Every asset. In focus.',
                    wallets: 'Your wallets, together.',
                    stakes: 'Time on your side.',
                    activity: 'Follow the movement.',
                    settings: 'Private by design.'
                  }[page]
                }
              </h1>
              <p>
                {
                  {
                    overview: 'Your portfolio, across wallets and networks. One clear view.',
                    assets: 'Token balances and market estimates, with the details that matter.',
                    wallets: 'Public addresses only. Give each one a name that makes sense to you.',
                    stakes: 'Your HEX stake ladder, straight from the contract. Always read-only.',
                    activity: 'Recent on-chain transactions from public blockchain explorers.',
                    settings: 'Your preferences, encrypted backup, and watchlist controls.'
                  }[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {page === 'assets' && (
                <button className="button subtle" onClick={() => navTo('activity')}>
                  <Icon name="activity" size={16} />
                  Activity
                </button>
              )}

              {page !== 'settings' && (
                <button
                  className="button subtle refresh-button"
                  onClick={() => {
                    setRefresh((v) => v + 1);
                    if (demo) toast('Demo uses illustrative data. Create a watchlist for live reads.');
                  }}
                  disabled={loading}
                >
                  <Icon name="refresh" size={17} className={loading ? 'spinning' : ''} />
                  <span>{loading ? 'Refreshing' : 'Refresh'}</span>
                </button>
              )}
              {['overview', 'wallets'].includes(page) && (
                <button className="button primary" onClick={addWallet} disabled={saving || dirty}>
                  <Icon name="plus" size={17} />
                  Add wallet
                </button>
              )}
            </div>
          </div>
          {page !== 'settings' && (
            <div className="filter-bar">
              <div className="select-wrap">
                <Icon name="wallet" size={17} />
                <label className="sr-only" htmlFor="wallet-filter">
                  Filter by wallet
                </label>
                <select id="wallet-filter" value={walletFilter} onChange={(e) => setWalletFilter(e.target.value)}>
                  <option value="all">All wallets ({data.wallets.length})</option>
                  {data.wallets.map((w) => (
                    <option key={w.address} value={w.address.toLowerCase()}>
                      {w.name || shortAddress(w.address)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="network-tabs" role="group" aria-label="Filter by network">
                <button className={chainFilter === 'all' ? 'selected' : ''} onClick={() => setChainFilter('all')}>
                  All networks
                </button>
                {[
                  'pulse',
                  'eth',
                  ...Object.keys(NETWORKS).filter((c) => !['pulse', 'eth'].includes(c) && data.wallets.some((w) => w.networks.includes(c)))
                ].map((c) => (
                  <button key={c} className={chainFilter === c ? 'selected' : ''} onClick={() => setChainFilter(c)}>
                    <i style={{ background: NETWORKS[c].color }} />
                    {NETWORKS[c].name.replace(' Smart Chain', '')}
                  </button>
                ))}
              </div>
              <div className="data-status">
                <i className={loading ? 'working' : unavailable ? 'warning' : ''} />
                {demo
                  ? 'Demo data'
                  : loading
                    ? 'Reading networks'
                    : observedAt
                      ? `Updated ${new Date(observedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
                      : 'Ready to monitor'}
              </div>
            </div>
          )}
          {data.currency === 'AUD' && !fx && <p className="small muted">AUD conversion is unavailable. Values are shown in USD.</p>}
          <DataNotices
            notices={notices}
            staleBalances={staleBalances}
            loading={loading}
            saving={saving || dirty}
            onTrackToken={(chain) => setModal({ kind: 'token', chain })}
            onRetry={(chain) => {
              setChainFilter(chain);
              setRefresh((v) => v + 1);
            }}
          />
          {page === 'overview' && (
            <>
              <section className="summary-grid">
                <div className="portfolio-card">
                  <div className="card-kicker">
                    {unavailable || unknown ? 'KNOWN LIQUID VALUE' : 'LIQUID PORTFOLIO'}
                    <span className="currency-pill">{currency}</span>
                  </div>
                  <div className="portfolio-value">{money(total)}</div>
                  <p className="portfolio-caption">
                    {loading
                      ? 'Reading your public balances…'
                      : staleBalances
                        ? 'Some balance reads failed. Retained balances are marked stale.'
                        : unavailable
                          ? 'Partial coverage · shown balances are from successful reads; some tokens may be missing.'
                          : unknown
                            ? `${unknown} unpriced assets excluded from this estimate.`
                            : 'Market estimates · excludes staked HEX'}
                  </p>
                  <div className="portfolio-card-footer">
                    <span>
                      <Icon name="wallet" size={15} />
                      {selectedWallets.length} watch wallets
                    </span>
                    <span>
                      <Icon name="layers" size={15} />
                      {aggregate.tokens.length} assets
                    </span>
                    <button aria-label="View all assets" onClick={() => navTo('assets')}>
                      <Icon name="up" size={19} />
                    </button>
                  </div>
                </div>
                <div className="summary-card">
                  <div className="summary-icon purple">
                    <Icon name="calendar" size={21} />
                  </div>
                  <div className="card-kicker">HEX STAKED PRINCIPAL</div>
                  <strong>
                    {!stakeCoverage && !allStakes.length ? '—' : quantity(stakingPrincipal, 0)} <small>HEX</small>
                  </strong>
                  <div className="summary-bottom">
                    <span>
                      {allStakes.length} positions{!stakeCoverage ? ' · partial' : ''}
                    </span>
                    <button className="text-link" onClick={() => navTo('stakes')}>
                      View stakes <Icon name="arrow" size={14} />
                    </button>
                  </div>
                </div>
                <div className="summary-card">
                  <div className="summary-icon gold">
                    <Icon name="shield" size={21} />
                  </div>
                  <div className="card-kicker">YOUR CRYPTO, ALWAYS YOURS</div>
                  <strong className="ownership-title">Zero permissions.</strong>
                  <p>
                    No signing. No seed phrases.
                    <br />
                    Just a clearer view.
                  </p>
                  <span className="safety-label">
                    <Icon name="check" size={13} />
                    Ownership stays with you
                  </span>
                </div>
              </section>
              <div className="dashboard-grid">
                <section className="panel history-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Portfolio perspective</h2>
                      <p>
                        {demo
                          ? 'Illustrative portfolio trend'
                          : observations.length > 0
                            ? lastObservation?.partial
                              ? 'Partial liquid values · fresh, priced assets only'
                              : 'Saved liquid portfolio readings'
                            : 'Your history starts here'}
                      </p>
                    </div>
                    <div className="segmented">
                      {[1, 7, 30].map((r) => (
                        <button key={r} className={range === r ? 'selected' : ''} onClick={() => setRange(r)}>
                          {r === 1 ? '1D' : r === 7 ? '1W' : '1M'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {demo ? (
                    <>
                      <div className="chart-amount">
                        {money(aggregate.totalUsd)} <span className="positive">Sample view</span>
                      </div>
                      <Sparkline
                        values={
                          range === 1
                            ? [93, 94, 96, 95, 98, 99, 101, 100, 104, 106, 105, 109, 112]
                            : range === 7
                              ? [72, 75, 74, 79, 81, 78, 84, 88, 86, 94, 93, 99, 104, 101, 112]
                              : [45, 49, 47, 56, 55, 63, 60, 70, 72, 67, 75, 82, 78, 86, 84, 95, 92, 101, 98, 112]
                        }
                        large
                        label="Illustrative demo trend. This is not historical market data."
                      />
                      <div className="chart-labels">
                        <span>{range === 1 ? '00:00' : range === 7 ? '7 days ago' : '30 days ago'}</span>
                        <span>ILLUSTRATIVE DEMO</span>
                        <span>Today</span>
                      </div>
                    </>
                  ) : observations.length > 0 ? (
                    <PortfolioReadings
                      observations={observations}
                      readings={readings}
                      money={money}
                      coverageChanged={coverageChanged}
                      historyError={historyError}
                      historySaving={historySaving}
                    />
                  ) : (
                    <div className="history-empty">
                      <span className="history-symbol">
                        <Icon name="activity" size={37} />
                      </span>
                      <h3>{loading ? 'Reading your portfolio…' : 'Waiting for a usable reading.'}</h3>
                      <p>
                        Fresh balances with a market price are needed. Check the network notices above.
                        <br />
                        Kinko never invents your past performance.
                      </p>
                      <span>Real readings are saved encrypted on this browser.</span>
                    </div>
                  )}
                </section>
                <section className="panel allocation-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Across your networks</h2>
                      <p>Known liquid value · {currency}</p>
                    </div>
                    <Icon name="layers" size={19} />
                  </div>
                  {totalsByChain.length ? (
                    <>
                      <div className="allocation-bar">
                        {totalsByChain.map((n) => (
                          <div
                            key={n.chain}
                            style={{ width: `${(n.value / aggregate.totalUsd) * 100}%`, background: n.color }}
                            title={`${n.name}: ${money(n.value)}`}
                          />
                        ))}
                      </div>
                      <div className="allocation-list">
                        {totalsByChain.map((n) => (
                          <div key={n.chain}>
                            <span>
                              <i style={{ background: n.color }} />
                              {n.name}
                            </span>
                            <div>
                              <b>{money(n.value)}</b>
                              <small>{number((n.value / aggregate.totalUsd) * 100, 1)}%</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <Empty icon="layers" title="Your networks, in one place">
                      Add a wallet to see its allocation.
                    </Empty>
                  )}
                </section>
              </div>
              <div className="dashboard-grid lower-grid">
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Your top assets</h2>
                      <p>A snapshot of your liquid holdings</p>
                    </div>
                    <button className="text-link" onClick={() => navTo('assets')}>
                      View all <Icon name="arrow" size={15} />
                    </button>
                  </div>
                  <AssetTable
                    tokens={assetListTokens(tokens, { tracked: data.tokens, showUnpriced: data.showUnpricedTokens }).slice(0, 5)}
                    filteredEmpty={tokens.length > 0}
                    money={money}
                    price={price}
                    quantity={quantity}
                    onDetail={(t) => setModal({ kind: 'asset', token: t })}
                  />
                </section>
                <section className="panel maturity-panel">
                  <div className="panel-header">
                    <div>
                      <h2>On the horizon</h2>
                      <p>Upcoming HEX maturities</p>
                    </div>
                    <Icon name="calendar" size={19} />
                  </div>
                  {upcoming.length ? (
                    upcoming.map((s) => (
                      <button
                        className="maturity-row"
                        key={`${s.chain}:${s.wallet}:${s.id}`}
                        onClick={() => {
                          navTo('stakes');
                        }}
                      >
                        <span className={`calendar-tile ${s.status === 'Matured' ? 'matured' : ''}`}>
                          <b>{new Date(s.endTime).getUTCDate()}</b>
                          <small>{new Date(s.endTime).toLocaleString('en-AU', { month: 'short', timeZone: 'UTC' })}</small>
                        </span>
                        <span className="maturity-content">
                          <strong>{quantity(s.principal, 0)} HEX</strong>
                          <span>
                            {NETWORKS[s.chain].name} · #{s.id}
                          </span>
                        </span>
                        <span className={`status-tag ${s.status === 'Matured' ? 'matured' : ''}`}>
                          {s.status === 'Matured' ? 'Matured' : `${s.remaining}d`}
                        </span>
                      </button>
                    ))
                  ) : (
                    <Empty icon="calendar" title="Room for the long view">
                      Your open HEX stakes will appear here.
                    </Empty>
                  )}
                  <button className="maturity-footer text-link" onClick={() => navTo('stakes')}>
                    Explore your stake ladder <Icon name="arrow" size={15} />
                  </button>
                </section>
              </div>
            </>
          )}
          {page === 'assets' && (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>
                    Assets <span className="count-badge">{listedTokens.length}</span>
                  </h2>
                  <p>Network + contract identifies a token. Tickers alone do not.</p>
                </div>
                <div className="table-tools">
                  <div className="search-input">
                    <Icon name="search" size={17} />
                    <input
                      aria-label="Search assets"
                      placeholder="Search assets…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select aria-label="Sort assets" value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="value">Highest value</option>
                    <option value="name">Name A–Z</option>
                  </select>
                  <button className="button small-button" onClick={() => setModal({ kind: 'token' })} disabled={saving || dirty}>
                    <Icon name="plus" size={15} />
                    Track token
                  </button>
                </div>
              </div>
              <details className="panel-footnote asset-filters">
                <summary><span>Asset display options</span><Icon name="chevron" size={14} /></summary>
                <div className="asset-filter-options">
                <label><input type="checkbox" aria-label="Show unpriced tokens" checked={data.showUnpricedTokens === true} disabled={saving || dirty}
                  onChange={(e) => persist({ ...data, showUnpricedTokens: e.target.checked })} /> Show unpriced tokens ({unpricedCount})</label>
                <p>Unpriced tokens are hidden from this list by default and remain available to review. They are excluded from known fiat totals. Explicitly tracked contracts stay visible.</p>
                <label><input type="checkbox" aria-label="Hide dust balances" checked={hideDust} onChange={(e) => setHideDust(e.target.checked)} /> Hide balances below USD 0.01</label>
                <p>Dust filtering only changes this list. Portfolio totals still include these balances.</p>
                </div>
              </details>
              <AssetTable
                tokens={listedTokens}
                money={money}
                price={price}
                quantity={quantity}
                onDetail={(t) => setModal({ kind: 'asset', token: t })}
                filteredEmpty={tokens.length > 0}
              />
              {filteredTokens.length > 0 && (
                <details className="panel-footnote filtered-tokens">
                  <summary>{filteredTokens.length} filtered {filteredTokens.length === 1 ? 'token' : 'tokens'} · Review</summary>
                  <p>Hidden from assets, totals and price notices. Names are untrusted text. Tracking a contract overrides the automatic filter; verify its address first.</p>
                  {filteredTokens.map((t) => (
                    <div className="filtered-token" key={tokenKey(t.chain, t.address)}>
                      <div><b>{t.symbol || 'Token'} · {NETWORKS[t.chain].name}</b><p>{t.reason}</p><span className="mono break">{t.address}</span></div>
                      <button className="button small-button" disabled={saving || dirty} onClick={() => t.reason === 'Hidden by you'
                        ? setTokenHidden(t, false) : setModal({ kind: 'token', chain: t.chain, address: t.address })}>
                        {t.reason === 'Hidden by you' ? 'Restore' : 'Review contract'}
                      </button>
                    </div>
                  ))}
                </details>
              )}
              <p className="panel-footnote">
                Prices are estimates from public sources. Unpriced assets show “—” and are excluded from totals. Provider-flagged tokens, website-only names and promotional links are filtered across all networks. Unpriced tokens are not automatically spam. Indexing and spam detection can miss assets.
              </p>
            </section>
          )}
          {page === 'wallets' && (
            <>
              <div className="wallet-list-toolbar">
                <span>{data.wallets.length} saved watch wallets</span>
                <div className="search-input">
                  <Icon name="search" size={17} />
                  <input
                    aria-label="Search wallets"
                    placeholder="Search wallet name or address…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="wallet-grid">
                {selectedWallets
                  .filter((w) => `${w.name} ${w.address}`.toLowerCase().includes(search.toLowerCase()))
                  .map((w, i) => {
                    const wr = splitTokens(rawRows.filter((t) => t.wallet === w.address.toLowerCase()), data.tokens, data.hiddenTokens).visible;
                    const val = aggregateHoldings(wr).totalUsd;
                    const ok = wr.some((r) => r.priceUsd != null);
                    return (
                      <section key={w.address} className="panel wallet-card">
                        <div className="wallet-card-top">
                          <span className={`wallet-avatar avatar-${i % 3}`}>
                            <Icon name="wallet" size={22} />
                          </span>
                          <div className="wallet-identity">
                            <strong>{w.name || 'Watch wallet'}</strong>
                            <span title={w.address}>
                              {shortAddress(w.address)} <Copy text={w.address} />
                            </span>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={`Edit ${w.name || 'wallet'}`}
                            onClick={() => setModal({ kind: 'wallet', wallet: w })}
                            disabled={saving || dirty}
                          >
                            <Icon name="edit" size={16} />
                          </button>
                        </div>
                        <div className="wallet-value">
                          {money(ok ? val : null)} <small>{currency} · liquid estimate</small>
                        </div>
                        <div className="wallet-networks">
                          {w.networks.map((c) => (
                            <NetworkBadge key={c} chain={c} />
                          ))}
                        </div>
                        <div className="wallet-card-bottom">
                          <button
                            className="text-link"
                            onClick={() => {
                              setWalletFilter(w.address.toLowerCase());
                              navTo('assets');
                            }}
                          >
                            View holdings <Icon name="arrow" size={14} />
                          </button>
                          <button
                            className="icon-button danger-text"
                            aria-label={`Remove ${w.name || 'wallet'}`}
                            onClick={() => setModal({ kind: 'delete-wallet', wallet: w })}
                            disabled={saving || dirty}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      </section>
                    );
                  })}
                <button className="add-wallet-card" onClick={addWallet} disabled={saving || dirty}>
                  <span>
                    <Icon name="plus" size={25} />
                  </span>
                  <b>Add another perspective</b>
                  <small>Monitor a public wallet address</small>
                </button>
              </div>
              {!data.wallets.length && (
                <div className="notice">
                  <Icon name="info" />
                  <p>
                    Already using the old Kinko? Import your wallet JSON backup in Settings. Old short Portfolio IDs are separate from
                    encrypted Access Keys.
                  </p>
                </div>
              )}
            </>
          )}
          {page === 'stakes' && (
            <>
              <div className="stake-summary">
                <div>
                  <span>Open HEX principal</span>
                  <b>
                    {!stakeCoverage && !allStakes.length ? '—' : quantity(stakingPrincipal, 0)} <small>HEX</small>
                  </b>
                </div>
                <div>
                  <span>Stake shares</span>
                  <b>
                    {!stakeCoverage && !allStakes.length ? '—' : quantity(tShares, 4)} <small>T-Shares · raw sum</small>
                  </b>
                </div>
                <div>
                  <span>Open positions</span>
                  <b>{allStakes.length}</b>
                </div>
                <div>
                  <span>Reached maturity</span>
                  <b>{allStakes.filter((s) => s.status === 'Matured').length}</b>
                </div>
              </div>
              <div className="stake-note">
                <Icon name="info" size={18} />
                <p>
                  HEX on Ethereum and PulseChain are separate assets. Combined principal and T-Shares are raw unit sums, not equal economic
                  exposure; use the network filter for a comparable view. Principal and shares come from the contract; rewards and end-stake
                  penalties are not estimated. Ended stakes require a historical index and are not included.
                </p>
              </div>
              {Object.entries(stakeResults)
                .filter(
                  ([k]) =>
                    selectedWallets.some((w) => k.startsWith(w.address.toLowerCase() + ':')) &&
                    (chainFilter === 'all' || k.endsWith(':' + chainFilter))
                )
                .filter(([, r]) => r.error)
                .map(([k, r]) => (
                  <p className="error small" key={k}>
                    {NETWORKS[k.split(':')[1]].name} · {r.error}
                    {r.stale ? ' Cached stakes may be stale.' : ''}
                  </p>
                ))}
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Your stake ladder</h2>
                    <p>Maturity dates in UTC · earliest first</p>
                  </div>
                  <select aria-label="Filter stake status" value={stakeStatus} onChange={(e) => setStakeStatus(e.target.value)}>
                    <option value="all">All open positions</option>
                    <option value="active">Active & pending</option>
                    <option value="Matured">Matured</option>
                    <option value="Accounted">Good accounting</option>
                  </select>
                </div>
                {stakes.length ? (
                  <div className="stake-list">
                    {stakes.map((s) => (
                      <button
                        className="stake-row"
                        key={`${s.chain}:${s.wallet}:${s.id}`}
                        onClick={() => setModal({ kind: 'stake', stake: s })}
                      >
                        <div className="stake-main">
                          <TokenIcon symbol="HEX" chain={s.chain} />
                          <span>
                            <strong>
                              {quantity(s.principal, 0)} <small>HEX</small>
                            </strong>
                            <small>
                              {data.wallets.find((w) => w.address.toLowerCase() === s.wallet)?.name || shortAddress(s.wallet)} · #{s.id}
                            </small>
                          </span>
                        </div>
                        <div className="stake-duration">
                          <strong>{date(s.endTime)}</strong>
                          <small>
                            {s.stakedDays} days · {NETWORKS[s.chain].name}
                          </small>
                        </div>
                        <div className="stake-progress">
                          <div>
                            <span>{number(s.progress, 0)}% complete</span>
                            <b>{s.remaining ? `${s.remaining}d left` : 'Matured'}</b>
                          </div>
                          <div className="progress-track">
                            <i style={{ width: `${s.progress}%` }} />
                          </div>
                        </div>
                        <span className={`status-tag ${s.status === 'Matured' ? 'matured' : ''}`}>{s.stale ? 'Stale' : s.status}</span>
                        <Icon name="chevron" size={16} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty icon="calendar" title={data.wallets.length ? 'No positions to show yet' : 'Start your stake perspective'}>
                    {data.wallets.length
                      ? 'Positions appear after a successful contract read. Refresh if providers are temporarily unavailable.'
                      : 'Add a wallet on Ethereum or PulseChain to monitor its HEX stakes.'}
                  </Empty>
                )}
              </section>
              <div className="notice amber">
                <Icon name="shield" />
                <p>
                  <b>Read-only means read-only.</b> Kinko cannot start or end a stake, claim rewards, or sign a transaction. Maturity is a
                  protocol milestone; check the original contract and your trusted frontend before taking action.
                </p>
              </div>
            </>
          )}
          {page === 'activity' && (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Recent activity</h2>
                  <p>Up to 25 indexed transactions per wallet and network. Not a complete token-transfer or internal-transaction ledger.</p>
                </div>
                <Icon name="activity" size={20} />
              </div>
              {demo ? (
                <Empty icon="activity" title="Your on-chain story goes here">
                  The demo does not invent transactions. Add a real public address for indexed activity.
                </Empty>
              ) : (
                <>
                  {Object.values(activities)
                    .filter(
                      (a) =>
                        a.wallet &&
                        selectedWallets.some((w) => w.address.toLowerCase() === a.wallet.toLowerCase()) &&
                        (chainFilter === 'all' || chainFilter === a.chain) &&
                        a.error
                    )
                    .map((a) => (
                      <p className="error small" key={`${a.chain}:${a.wallet}`}>
                        {NETWORKS[a.chain].name}: {a.error}
                      </p>
                    ))}
                  {Object.values(activities)
                    .flatMap((a) => a.items || [])
                    .filter(matches)
                    .sort((a, b) => new Date(b.time) - new Date(a.time))
                    .map((t) => (
                      <a
                        className="activity-row"
                        key={`${t.chain}:${t.wallet}:${t.hash}`}
                        href={`${NETWORKS[t.chain].explorer}/tx/${t.hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="activity-icon">
                          <Icon name="up" size={20} />
                        </span>
                        <span>
                          <strong>{t.method}</strong>
                          <small>
                            {shortAddress(t.hash)} · {NETWORKS[t.chain].name}
                          </small>
                        </span>
                        <span>
                          <b>
                            {quantity(t.value, 6)} {NETWORKS[t.chain].symbol}
                          </b>
                          <small>
                            {date(t.time)} · {t.status || 'Pending'}
                          </small>
                        </span>
                        <Icon name="up" size={16} />
                      </a>
                    ))}
                  {!Object.values(activities).some((a) => a.items?.some(matches)) && (
                    <Empty icon="activity" title="No indexed activity to display">
                      Results load from public explorers. Open a wallet’s explorer for broader history.
                    </Empty>
                  )}
                </>
              )}
            </section>
          )}
          {page === 'settings' && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <div className="panel-header">
                  <div>
                    <h2>Your workspace</h2>
                    <p>Preferences encrypted with your watchlist.</p>
                  </div>
                  <Icon name="settings" size={20} />
                </div>
                <div className="setting-row">
                  <span>
                    <b>Display currency</b>
                    <small>
                      {fx ? `AUD reference: ${fx.date} · Frankfurter / ECB` : 'AUD requires an available reference exchange rate.'}
                    </small>
                  </span>
                  <select
                    aria-label="Display currency"
                    value={data.currency}
                    onChange={(e) => persist({ ...data, currency: e.target.value })}
                    disabled={saving || dirty}
                  >
                    <option value="USD">USD</option>
                    <option value="AUD">AUD</option>
                  </select>
                </div>
                <div className="setting-row">
                  <span>
                    <b>Appearance</b>
                    <small>Choose your preferred perspective.</small>
                  </span>
                  <select
                    aria-label="Appearance"
                    value={data.theme}
                    onChange={(e) => persist({ ...data, theme: e.target.value })}
                    disabled={saving || dirty}
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
                <div className="setting-row">
                  <span>
                    <b>Watchlist status</b>
                    <small>
                      {demo
                        ? 'Illustrative demo'
                        : mode === 'cloud'
                          ? `Encrypted cloud watchlist · revision ${revision}`
                          : 'Local encrypted backup · cloud sync inactive'}
                    </small>
                  </span>
                  <span className="status-tag">{dirty ? 'Pending save' : mode === 'cloud' ? 'Synced' : demo ? 'Demo' : 'Local'}</span>
                </div>
                <div className="setting-row">
                  <span>
                    <b>Lock this workspace</b>
                    <small>Your saved Access Key opens it again.</small>
                  </span>
                  <button className="button small-button" onClick={signOut}>
                    <Icon name="logout" size={15} />
                    Sign out
                  </button>
                </div>
                <div className="setting-row">
                  <span>
                    <b>Recent activity</b>
                    <small>Inspect indexed transactions on your networks.</small>
                  </span>
                  <button className="button small-button" onClick={() => navTo('activity')}>
                    View activity
                  </button>
                </div>
                <div className="setting-row">
                  <span>
                    <b>Restore cloud copy</b>
                    <small>Load changes saved from your other devices.</small>
                  </span>
                  <button className="button small-button" onClick={reload} disabled={demo || saving}>
                    Reload saved
                  </button>
                </div>
              </section>
              <section className="panel settings-panel">
                <div className="panel-header">
                  <div>
                    <h2>Backup & recovery</h2>
                    <p>A little preparation keeps your perspective safe.</p>
                  </div>
                  <Icon name="key" size={20} />
                </div>
                <p className="settings-copy">
                  Your Access Key restores your watchlist on another device. Kinko does not keep a copy of your key. Losing it means losing
                  access to this watchlist, never your actual coins.
                </p>
                <button className="button primary" onClick={exportBackup} disabled={demo}>
                  <Icon name="download" size={17} />
                  Export encrypted backup
                </button>
                <label className="file-button settings-import">
                  <Icon name="upload" size={17} />
                  Import an old wallet JSON backup
                  <input
                    type="file"
                    accept="application/json,.json"
                    disabled={saving || dirty}
                    onChange={async (e) => {
                      try {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 150000) throw new Error('Backup is too large.');
                        const d = JSON.parse(await f.text());
                        const list = Array.isArray(d) ? d : d.wallets;
                        if (!Array.isArray(list))
                          throw new Error('This is not a wallet-address backup. Encrypted backups restore from the welcome screen.');
                        if (!window.confirm(`Import ${list.length} wallet records into your encrypted watchlist?`)) return;
                        const next = validateWatchlist({ ...data, wallets: [...data.wallets, ...list] });
                        if (await persist(next)) toast('Wallets imported and saved.');
                      } catch (e) {
                        toast(e.message);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <p className="small muted">
                  Backups remain encrypted. Store your Access Key separately. Old Portfolio IDs do not unlock this system.
                </p>
              </section>
              {(data.tokens || []).length > 0 && (
                <section className="panel settings-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Tracked token contracts</h2>
                      <p>Custom contracts are read across wallets on their selected network.</p>
                    </div>
                    <Icon name="layers" size={20} />
                  </div>
                  {(data.tokens || []).map((t) => (
                    <div className="setting-row" key={`${t.chain}:${t.address}`}>
                      <span>
                        <b>{NETWORKS[t.chain].name}</b>
                        <small className="mono" title={t.address}>
                          {shortAddress(t.address)}
                        </small>
                      </span>
                      <Copy text={t.address} label="Copy token contract" />
                      <button
                        className="icon-button danger-text"
                        aria-label={`Remove tracked contract ${shortAddress(t.address)}`}
                        disabled={saving || dirty}
                        onClick={() =>
                          persist({ ...data, tokens: data.tokens.filter((x) => !(x.chain === t.chain && x.address === t.address)) })
                        }
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  ))}
                </section>
              )}
              <section className="panel security-panel">
                <div className="panel-header">
                  <div>
                    <h2>Not your keys, not your coins.</h2>
                    <p>Never share your seed phrase.</p>
                  </div>
                  <Icon name="shield" size={26} />
                </div>
                <div className="security-columns">
                  <div>
                    <b>What Kinko can see</b>
                    <p>
                      Public addresses are sent to our read-only data endpoint and public blockchain providers to retrieve balances. Your
                      encrypted vault stores the saved relationship between addresses, names, and preferences.
                    </p>
                  </div>
                  <div>
                    <b>What stays with you</b>
                    <p>
                      Your cryptocurrency, signing keys, seed phrase, and Kinko Access Key. Encryption happens in your browser. Our server
                      holds ciphertext and a separate authentication verifier.
                    </p>
                  </div>
                  <div>
                    <b>Know the limits</b>
                    <p>
                      Encryption does not protect an unlocked or compromised device. Public data providers can observe requested addresses.
                      This application has not received an independent security audit.
                    </p>
                  </div>
                </div>
                <div className="security-footer">
                  <span>
                    <Icon name="lock" size={16} />
                    AES-256-GCM · browser-generated 256-bit Access Keys
                  </span>
                  <button className="text-link danger-text" disabled={demo || saving} onClick={() => setModal({ kind: 'delete-account' })}>
                    Delete encrypted watchlist
                  </button>
                </div>
              </section>
            </div>
          )}
          <footer className="workspace-footer">
            <span>
              <Icon name="shield" size={14} />
              Your keys. Your coins. Your control. <b>Kinko just keeps you informed.</b>
            </span>
            <span>
              {currency}
              {currency === 'AUD' && fx ? ` · FX ${fx.date}` : ''} · Estimates, not guarantees
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {[...nav.slice(0, 4), ['settings', 'settings', 'Settings']].map(([id, icon, label]) => (
          <button className={page === id ? 'active' : ''} key={id} onClick={() => navTo(id)}>
            <Icon name={icon} size={21} />
            <span>{id === 'wallets' ? 'Wallets' : id === 'stakes' ? 'HEX' : label}</span>
          </button>
        ))}
      </nav>
      {modal?.kind === 'wallet' && (
        <WalletForm
          wallet={modal.wallet}
          busy={saving}
          error={syncError}
          onClose={() => setModal(null)}
          onSave={async (w) => {
            if (!modal.wallet && data.wallets.some((x) => x.address.toLowerCase() === w.address.toLowerCase())) {
              toast('That address is already in your watchlist. Edit its networks instead.');
              return;
            }
            const wallets = modal.wallet ? data.wallets.map((x) => (x.address === modal.wallet.address ? w : x)) : [...data.wallets, w];
            if (await persist({ ...data, wallets })) {
              setModal(null);
              toast('Watch wallet saved.');
            }
          }}
        />
      )}
      {modal?.kind === 'delete-wallet' && (
        <Modal title="Remove this watch wallet?" onClose={() => setModal(null)}>
          <p>
            Remove <b>{modal.wallet.name || shortAddress(modal.wallet.address)}</b> from your saved watchlist? Your cryptocurrency is
            unaffected.
          </p>
          <button
            className="button danger full"
            disabled={saving}
            onClick={async () => {
              const removed = modal.wallet.address.toLowerCase();
              if (await persist({ ...data, wallets: data.wallets.filter((w) => w.address.toLowerCase() !== removed) })) {
                if (walletFilter === removed) setWalletFilter('all');
                setModal(null);
                toast('Watch wallet removed.');
              }
            }}
          >
            Remove watch wallet
          </button>
        </Modal>
      )}
      {modal?.kind === 'asset' && (
        <Modal title={`${modal.token.symbol} · asset details`} subtitle={NETWORKS[modal.token.chain].name} onClose={() => setModal(null)}>
          <dl className="detail-list">
            <div>
              <dt>Quantity</dt>
              <dd className="mono">{privacy ? '••••' : modal.token.amountExact}</dd>
            </div>
            <div>
              <dt>Estimated price</dt>
              <dd>{price(modal.token.priceUsd)}</dd>
            </div>
            <div>
              <dt>Liquid value</dt>
              <dd>{money(modal.token.valueUsd)}</dd>
            </div>
            <div>
              <dt>Price source</dt>
              <dd>{modal.token.priceSource || 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Contract</dt>
              <dd className="mono break">
                {modal.token.address || 'Native asset'}
                {modal.token.address && <Copy text={modal.token.address} />}
              </dd>
            </div>
            <div>
              <dt>Data state</dt>
              <dd>{modal.token.stale ? 'Stale cached balance' : demo ? 'Illustrative demo' : 'Latest retrieved balance'}</dd>
            </div>
          </dl>
          <h3 className="detail-subtitle">By wallet</h3>
          {rows
            .filter((r) => r.chain === modal.token.chain && r.address === modal.token.address)
            .map((r) => (
              <div className="detail-wallet" key={r.wallet}>
                <span>{data.wallets.find((w) => w.address.toLowerCase() === r.wallet)?.name || shortAddress(r.wallet)}</span>
                <b>{quantity(r.amountExact, 6)}</b>
              </div>
            ))}
          {modal.token.address && (
            <button className="button subtle full" disabled={saving || dirty} onClick={() => setTokenHidden(modal.token, true)}>Hide token</button>
          )}
          {modal.token.address && (
            <a
              className="button subtle full"
              href={`${NETWORKS[modal.token.chain].explorer}/token/${modal.token.address}`}
              target="_blank"
              rel="noreferrer"
            >
              Verify contract on explorer
              <Icon name="up" size={16} />
            </a>
          )}
        </Modal>
      )}
      {modal?.kind === 'stake' && (
        <Modal
          title={`HEX stake #${modal.stake.id}`}
          subtitle={`${NETWORKS[modal.stake.chain].name} · ${modal.stake.status}${modal.stake.stale ? ' · stale data' : ''}`}
          onClose={() => setModal(null)}
        >
          <dl className="detail-list">
            {[
              ['Staked principal', `${quantity(modal.stake.principal, 8)} HEX`],
              ['T-Shares', quantity(modal.stake.tShares, 12)],
              ['Locked day', modal.stake.lockedDay],
              ['Start (UTC)', date(modal.stake.startTime)],
              ['Scheduled maturity (UTC)', date(modal.stake.endTime)],
              ['Duration', `${modal.stake.stakedDays} days`],
              ['Days remaining', modal.stake.remaining],
              ['Good accounting day', modal.stake.unlockedDay || 'Not accounted'],
              ['Wallet', shortAddress(modal.stake.wallet)]
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="small muted">
            Principal and shares exclude unclaimed payouts. Good accounting does not mean a stake has ended. Ended positions disappear from
            stakeLists.
          </p>
          <a
            className="button subtle full"
            href={`${NETWORKS[modal.stake.chain].explorer}/address/${modal.stake.wallet}`}
            target="_blank"
            rel="noreferrer"
          >
            View public address <Icon name="up" size={16} />
          </a>
        </Modal>
      )}
      {modal?.kind === 'token' && (
        <TokenForm
          initialChain={modal.chain}
          initialAddress={modal.address}
          busy={saving}
          onClose={() => setModal(null)}
          onSave={async (t) => {
            const tokens = data.tokens || [];
            if (tokens.some((x) => x.chain === t.chain && x.address === t.address)) {
              toast('That contract is already tracked.');
              return;
            }
            if (tokens.length >= 30) {
              toast('Maximum 30 custom contracts per watchlist.');
              return;
            }
            if (await persist({ ...data, tokens: [...tokens, t] })) {
              setModal(null);
              toast('Contract added. Its balance will be read on the selected network.');
            }
          }}
        />
      )}
      {modal?.kind === 'delete-account' && (
        <DeleteAccount
          onClose={() => setModal(null)}
          busy={saving}
          onDelete={async () => {
            setSaving(true);
            try {
              await vaultRequest(session, 'DELETE', { revision });
              await forgetDeviceAccess();
              portfolioHistory.clear(session);
              localStorage.removeItem(`kinko:vault:${session.id}`);
              setDirty(false);
              setModal(null);
              setSession(null);
              setData(blankWatchlist());
              setResults({});
              setStakeResults({});
              setHistory([]);
              setActivities({});
              setWalletFilter('all');
              setChainFilter('all');
              clearCachedPublicData();
              toast('Encrypted cloud watchlist deleted. Your cryptocurrency is untouched.');
            } catch (e) {
              setSyncError(e.message);
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}
function AssetTable({ tokens, money, price, quantity, onDetail, filteredEmpty = false }) {
  return tokens.length ? (
    <div className="asset-table">
      <div className="asset-table-head">
        <span>ASSET</span>
        <span>PRICE</span>
        <span>BALANCE</span>
        <span>VALUE</span>
        <span />
      </div>
      {tokens.map((t) => (
        <button className="asset-row" key={`${t.chain}:${t.address || 'native'}`} onClick={() => onDetail(t)}>
          <span className="asset-name">
            <TokenIcon symbol={t.symbol} chain={t.chain} />
            <span>
              <strong>{t.symbol}</strong>
              <small>
                {NETWORKS[t.chain].name}
                {t.stale ? ' · Stale' : ''}
              </small>
            </span>
          </span>
          <span className="asset-price">{price(t.priceUsd)}</span>
          <span className="asset-quantity" title={quantity(t.amountExact, 4).includes('•') ? undefined : t.amountExact}>
            {quantity(t.amountExact, 4)}
          </span>
          <span className="asset-value">
            <strong>{money(t.valueUsd)}</strong>
            {t.priceUsd == null && <small>Price unavailable</small>}
          </span>
          <Icon name="chevron" size={15} />
        </button>
      ))}
    </div>
  ) : (
    <Empty icon="layers" title={filteredEmpty ? 'No assets match these display filters' : 'Your assets will appear here'}>
      {filteredEmpty ? 'Use the Show unpriced tokens and dust controls on Assets to review more holdings.' : 'Add a public wallet address, then let Kinko read the numbers.'}
    </Empty>
  );
}
function TokenForm({ onClose, onSave, busy, initialChain = 'pulse', initialAddress = '' }) {
  const [chain, setChain] = useState(initialChain),
    [address, setAddress] = useState(initialAddress),
    [error, setError] = useState('');
  return (
    <Modal title="Track a token contract" subtitle="Useful when explorer discovery misses a token." onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!isAddress(address)) {
            setError('Enter a valid token contract address.');
            return;
          }
          onSave({ chain, address: address.trim().toLowerCase() });
        }}
      >
        <label className="field-label" htmlFor="token-chain">
          Network
        </label>
        <select className="input" id="token-chain" value={chain} onChange={(e) => setChain(e.target.value)}>
          {Object.entries(NETWORKS).map(([c, n]) => (
            <option key={c} value={c}>
              {n.name}
            </option>
          ))}
        </select>
        <label className="field-label" htmlFor="token-contract">
          Public token contract
        </label>
        <input
          className="input mono"
          id="token-contract"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
          placeholder="0x…"
        />
        <p className="small muted">
          Tracking explicitly shows this contract even if its name triggers the spam filter. Verify the network and full contract address. Contract balances are read for wallets monitoring this network. No balance or price will be invented if the provider fails.
        </p>
        {error && <p className="error">{error}</p>}
        <button className="button primary full" disabled={busy}>
          Track contract <Icon name="plus" size={16} />
        </button>
      </form>
    </Modal>
  );
}
function DeleteAccount({ onClose, onDelete, busy }) {
  const [text, setText] = useState('');
  return (
    <Modal title="Delete your encrypted watchlist?" onClose={onClose}>
      <p>
        This permanently deletes the saved Kinko watchlist from the server and this browser. Other devices and exported backups may still
        hold copies. Your cryptocurrency stays untouched.
      </p>
      <label className="field-label" htmlFor="delete-confirm">
        Type DELETE to confirm
      </label>
      <input id="delete-confirm" className="input" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="button danger full" disabled={text !== 'DELETE' || busy} onClick={onDelete}>
        {busy ? 'Deleting…' : 'Permanently delete watchlist'}
      </button>
    </Modal>
  );
}
class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="fatal">
        <Mark />
        <h1>Let’s get your view back.</h1>
        <p>Something interrupted Kinko. Your cryptocurrency is unaffected. Reload the page and restore with your saved Access Key.</p>
        <button className="button primary" onClick={() => location.reload()}>
          Reload Kinko
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
if (!import.meta.env.SSR)
  createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
