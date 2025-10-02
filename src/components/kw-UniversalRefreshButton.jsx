import { useEffect, useMemo, useRef, useState } from 'react';

import { useRefresh } from '@/contexts/RefreshContext.jsx';
import '../styles/kw-universal-refresh.css';

export default function KwUniversalRefreshButton() {
  const { refreshAll, isRefreshing, progress } = useRefresh();
  const [pulseActive, setPulseActive] = useState(false);
  const pulseTimerRef = useRef(null);

  const totalSteps = Number(progress?.total || 0);
  const doneSteps = Number(progress?.done || 0);

  const progressRatio = useMemo(() => {
    if (!totalSteps) return 0;
    const ratio = doneSteps / totalSteps;
    if (!Number.isFinite(ratio)) return 0;
    return Math.max(0, Math.min(1, ratio));
  }, [doneSteps, totalSteps]);

  const progressDegrees = useMemo(
    () => Number((progressRatio * 360).toFixed(2)),
    [progressRatio]
  );

  useEffect(
    () => () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    },
    []
  );

  const clampedDone = totalSteps > 0 ? Math.min(doneSteps, totalSteps) : doneSteps;
  const progressLabel = `${clampedDone}/${totalSteps || 0}`;

  const ariaLabel = isRefreshing
    ? `Refreshing… ${progressLabel}`
    : 'Universal Refresh (updates all data)';
  const titleText = isRefreshing ? 'Refreshing…' : 'Universal Refresh (updates all data)';

  const handleClick = async () => {
    if (isRefreshing) return;
    setPulseActive(true);
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => setPulseActive(false), 480);

    try {
      await refreshAll();
    } catch (error) {
      console.warn('[kw] Universal refresh error', error);
    }
  };

  const style = {
    '--kw-refresh-progress': `${progressDegrees}`,
    '--kw-refresh-ring-opacity': isRefreshing && totalSteps ? '1' : '0'
  };

  const classNames = ['kw-universal-refresh'];
  if (isRefreshing) classNames.push('is-refreshing');

  return (
    <button
      type="button"
      className={classNames.join(' ')}
      onClick={handleClick}
      disabled={isRefreshing}
      aria-label={ariaLabel}
      aria-busy={isRefreshing ? 'true' : 'false'}
      title={titleText}
      style={style}
    >
      {/* subtle pulse on tap/click */}
      <span
        className={`kw-universal-refresh__pulse${pulseActive ? ' is-active' : ''}`}
        aria-hidden="true"
      />
      {/* line-art icon (Tabler CSS icon you already use) */}
      <span className="kw-universal-refresh__icon" aria-hidden="true">
        <i className="ti ti-refresh" />
      </span>
    </button>
  );
}

