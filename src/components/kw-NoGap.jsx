import { useEffect } from 'react';

/**
 * kw-NoGap
 * Injects a <style> tag at the very end of <head> so it always wins.
 * Kills any top padding/margin reserved for a fixed header or ticker.
 */
export default function KwNoGap() {
  useEffect(() => {
    const css = `
/* ==== Kinko Wallet: final boss gap killer (injected) ==== */

html, body { margin:0 !important; padding:0 !important; }

:root {
  --pc-header-height: 0px !important;
  --header-height: 0px !important;
}

/* Hit all common shells with max specificity */
body #root,
body #root > div,
body .pc-container,
body .pc-content,
body .pc-body,
body .pcoded-content,
body .page-wrapper,
body .content-wrapper,
body .layout-main,
body .main-content,
body main,
body .container,
body .container-fluid,
body .container-sm,
body .container-md,
body .container-lg,
body .container-xl,
body .container-xxl {
  padding-top: 0 !important;
  margin-top: 0 !important;
}

/* When a fixed header/nav used to exist */
body .pc-header + .pc-container,
body .navbar + .pc-container,
body .pc-header + .pc-content,
body .navbar + .pc-content,
body .pc-header + .pcoded-content,
body .navbar + .pcoded-content {
  padding-top: 0 !important;
  margin-top: 0 !important;
}

/* First-child collapse */
body .pc-container > *:first-child,
body .pc-content > *:first-child,
body .pcoded-content > *:first-child,
body main > *:first-child,
body .content-wrapper > *:first-child {
  margin-top: 0 !important;
  padding-top: 0 !important;
}

/* Common first elements */
body .pc-container .row:first-child,
body .pc-container .card:first-child,
body .pc-content .row:first-child,
body .pcoded-content .row:first-child {
  margin-top: 0 !important;
  padding-top: 0 !important;
}

/* Auto page headers/breadcrumbs */
body .page-header,
body .page-header-title,
body .breadcrumb,
body .breadcrumb-wrapper,
body .pc-breadcrumb {
  margin-top: 0 !important;
  padding-top: 0 !important;
}

/* SimpleBar */
body .simplebar-content,
body .simplebar-content-wrapper,
body .simplebar-wrapper,
body .simplebar-mask {
  margin-top: 0 !important;
  padding-top: 0 !important;
}

/* Our ticker (if present) */
body .kwTicker,
body .kw-ticker {
  margin-bottom: 0 !important;
  border-bottom: 0 !important;
}
body .kwTicker + .pc-container,
body .kwTicker + .pc-content,
body .kw-ticker + .pc-container,
body .kw-ticker + .pc-content {
  margin-top: 0 !important;
  padding-top: 0 !important;
}
    `.trim();

    // Inject at the very end of <head>
    let style = document.getElementById('kw-no-gap-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'kw-no-gap-style';
      style.type = 'text/css';
      style.appendChild(document.createTextNode(css));
      document.head.appendChild(style);
    } else {
      style.textContent = css;
      document.head.appendChild(style); // move it to the end
    }

    // MutationObserver keeps our style last if something reorders head
    const obs = new MutationObserver(() => {
      if (document.head.lastElementChild !== style) {
        document.head.appendChild(style);
      }
    });
    obs.observe(document.head, { childList: true });

    return () => obs.disconnect();
  }, []);

  return null;
}
