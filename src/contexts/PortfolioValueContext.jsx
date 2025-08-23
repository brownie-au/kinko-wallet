// src/contexts/PortfolioValueContext.jsx
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState
} from 'react';

const LS_KEY = 'kw:portfolioValueSources:v1';

// Treat sub-cent changes as "no change" to avoid float thrash.
const EPSILON = 0.005;
const norm = (n) => (Number.isFinite(n) ? Number(n) : 0);

const PortfolioValueContext = createContext({
    sources: {},
    total: 0,
    setSource: (_k, _v) => { },
    removeSource: (_k) => { }
});

export function PortfolioValueProvider({ children }) {
    const [sources, setSources] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem(LS_KEY)) || {};
        } catch {
            return {};
        }
    });

    // Persist latest
    useEffect(() => {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(sources));
        } catch { }
    }, [sources]);

    // STABLE callbacks (do not depend on `sources`)
    const setSource = useCallback((key, val) => {
        if (!key) return;
        const v = norm(val);

        setSources((prev) => {
            const old = prev[key];
            // Skip if unchanged or within epsilon to prevent loops
            if (old !== undefined && Math.abs(old - v) < EPSILON) return prev;
            if (old === v) return prev;

            const next = { ...prev, [key]: v };
            return next;
        });
    }, []);

    const removeSource = useCallback((key) => {
        if (!key) return;
        setSources((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, []);

    const total = useMemo(
        () => Object.values(sources).reduce((a, b) => a + (Number(b) || 0), 0),
        [sources]
    );

    const value = useMemo(
        () => ({ sources, total, setSource, removeSource }),
        [sources, total, setSource, removeSource]
    );

    return (
        <PortfolioValueContext.Provider value={value}>
            {children}
        </PortfolioValueContext.Provider>
    );
}

// Canonical keys
export const PORTFOLIO_SOURCE = 'portfolio';
export const HEX_STAKING_SOURCE = 'hexStaking';

export function usePortfolioValue() {
    return useContext(PortfolioValueContext);
}
