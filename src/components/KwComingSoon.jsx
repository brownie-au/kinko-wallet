// src/components/KwComingSoon.jsx
import React from 'react';
import '../styles/kw-coming-soon.css';

// Helper: resolve a file placed in /public (BASE_URL-safe)
const resolvePublic = (path) => {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : base + '/';
  return prefix + path.replace(/^\//, '');
};

function Watermark({ variant = 'eth' }) {
  if (variant === 'pls') {
    // Image lives at: public/pls-watermark-grey.png
    const plsGrey = resolvePublic('pls-watermark-grey.png');
    return <img className="kw-cs-wm-img" src={plsGrey} alt="" aria-hidden="true" loading="eager" />;
  }

  // ETH diamond (unchanged)
  return (
    <svg className="kw-cs-wm" viewBox="0 0 256 417" aria-hidden="true">
      <polygon points="127.9,0 0,212.6 127.9,159.6" fill="currentColor" />
      <polygon points="127.9,159.6 0,212.6 127.9,283.1" fill="currentColor" opacity="0.6" />
      <polygon points="127.9,0 255.8,212.6 127.9,159.6" fill="currentColor" opacity="0.85" />
      <polygon points="127.9,159.6 255.8,212.6 127.9,283.1" fill="currentColor" opacity="0.4" />
      <polygon points="127.9,306.2 0,239.3 127.9,417" fill="currentColor" opacity="0.4" />
      <polygon points="127.9,417 255.8,239.3 127.9,306.2" fill="currentColor" opacity="0.2" />
    </svg>
  );
}

export default function KwComingSoon({
  title = 'Dashboard',
  subtitle = 'COMING SOON',
  variant = 'eth' // 'eth' | 'pls'
}) {
  return (
    <section className={`kw-cs kw-cs--${variant}`} aria-labelledby="kw-cs-title">
      <Watermark variant={variant} />
      <div className="kw-cs-inner">
        <h1 id="kw-cs-title" className="kw-cs-title">
          {title}
        </h1>
        <p className="kw-cs-subtitle">{subtitle}</p>
      </div>
    </section>
  );
}
