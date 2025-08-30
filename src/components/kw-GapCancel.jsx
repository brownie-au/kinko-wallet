import { useEffect } from 'react';

/**
 * kw-GapCancel
 * Measures the visible gap above .pc-content and cancels it with a negative margin-top.
 * Robust against theme CSS, borders, before/after spacers, margin collapse, etc.
 */
export default function KwGapCancel() {
  useEffect(() => {
    const run = () => {
      const root = document.getElementById('root');
      if (!root) return;

      // Prefer the Datta Able structure; fall back if needed
      let pcContent =
        root.querySelector('#root > .pc-container > .pc-content') ||
        root.querySelector('.pc-container > .pc-content') ||
        root.querySelector('.pc-content') ||
        root.firstElementChild;

      if (!pcContent) return;

      // Reset any previous adjustment before measuring
      pcContent.style.marginTop = '';
      pcContent.style.paddingTop = '';

      // Compute actual visual gap between top of .pc-content and its first child
      const contentRect = pcContent.getBoundingClientRect();

      // Find the first visible, sizable child inside pc-content
      const firstChild = Array.from(pcContent.children).find((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 1 && r.width > 1 && getComputedStyle(el).display !== 'none';
      });

      // If no children, nothing to do
      if (!firstChild) return;

      const firstRect = firstChild.getBoundingClientRect();
      // The gap we *see* above the first block inside the content area
      const gap = Math.round(firstRect.top - contentRect.top);

      if (gap > 0) {
        // Apply a matching negative margin to cancel the gap
        pcContent.style.marginTop = `-${gap}px`;
        // If theme adds internal padding, zero it too
        pcContent.style.paddingTop = '0px';
      }
    };

    // Run now and on next frame (handles late style injections)
    run();
    const id = requestAnimationFrame(run);

    // Re-run on resize and orientation changes
    window.addEventListener('resize', run);
    window.addEventListener('orientationchange', run);

    // Re-run when the page becomes visible (after tab switch)
    const onVis = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVis);

    // Observe DOM changes under #root to re-apply if layout changes
    const root = document.getElementById('root');
    const obs =
      root &&
      new MutationObserver(() => {
        // Debounce with rAF to avoid thrashing
        requestAnimationFrame(run);
      });
    if (obs && root) obs.observe(root, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', run);
      window.removeEventListener('orientationchange', run);
      document.removeEventListener('visibilitychange', onVis);
      if (obs) obs.disconnect();
    };
  }, []);

  return null;
}
