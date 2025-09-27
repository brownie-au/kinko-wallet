// src/utils/kwProgressHoverOverlay.js
// Auto-wire a hover overlay that shows the row's progress %.
// Works even if the table re-renders/sorts/paginates.

(function () {
    const TABLE_SELECTOR = '.kw-hex-stake-table table, table.kw-hex-stake-table';

    function findProgressColIndex(table) {
        const thead = table.tHead || table.querySelector('thead');
        if (!thead) return -1;
        const ths = Array.from(thead.querySelectorAll('th'));
        return ths.findIndex(th => (th.textContent || '').trim().toLowerCase().startsWith('progress'));
    }

    function extractPct(td) {
        const bar = td.querySelector('.progress-bar, [role="progressbar"]');
        if (!bar) return null;

        // 1) aria-valuenow takes priority
        const aria = bar.getAttribute('aria-valuenow');
        if (aria && !Number.isNaN(parseFloat(aria))) return Math.round(parseFloat(aria));

        // 2) inline width: "62%"
        const w = (bar.style && bar.style.width) || '';
        const m = /([\d.]+)\s*%/.exec(w);
        if (m) return Math.round(parseFloat(m[1]));

        // 3) fallback: try to read visible % text if present
        const text = td.textContent;
        const m2 = /([\d.]+)\s*%/.exec(text || '');
        if (m2) return Math.round(parseFloat(m2[1]));

        return null;
    }

    function tagProgressCells(table) {
        const idx = findProgressColIndex(table);
        if (idx === -1) return;

        const body = table.tBodies && table.tBodies[0];
        if (!body) return;

        Array.from(body.rows).forEach(tr => {
            const td = tr.cells[idx];
            if (!td) return;

            // Mark the cell so CSS can hook it
            td.dataset.col = 'progress';
            td.style.position = td.style.position || 'relative';

            const prog = td.querySelector('.progress');
            if (prog) {
                // Make sure the progress container won't clip the overlay
                prog.style.overflow = 'visible';
                prog.style.position = prog.style.position || 'relative';

                const pct = extractPct(td);
                if (pct !== null) {
                    prog.setAttribute('data-pct', String(pct));
                }
            }
        });
    }

    function init(root = document) {
        const tables = root.querySelectorAll(TABLE_SELECTOR);
        if (!tables.length) return;

        tables.forEach(tagProgressCells);
    }

    // Debounced observer to catch SPA renders/sorts/pagination
    function debounce(fn, ms) {
        let tId;
        return (...args) => {
            clearTimeout(tId);
            tId = setTimeout(() => fn(...args), ms);
        };
    }

    const debouncedInit = debounce(() => init(document), 80);

    // Kick once now and on DOM mutations
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', debouncedInit, { once: true });
    } else {
        debouncedInit();
    }

    const mo = new MutationObserver(debouncedInit);
    mo.observe(document.body, { childList: true, subtree: true });

    // Expose manual trigger for debugging
    window.kwProgressHoverOverlayInit = debouncedInit;
})();
