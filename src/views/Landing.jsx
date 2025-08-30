// src/views/Landing.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import PortfolioIdModal from '../components/PortfolioIdModal.jsx';
import Logo from 'assets/images/logo-white.svg';
import 'assets/scss/landing.scss';

export default function LandingPage() {
  const [showUsePid, setShowUsePid] = useState(false);

  return (
    <div className="landing-page">
      <header className="lp-hero" id="home">
        <div className="container text-center">
          <img className="brand-badge" src={Logo} alt="Kinko Wallet" />

          <h1 className="lp-title">Your DeFi Command Center</h1>
          <p className="lp-tagline">Secure insights, no keys required.</p>
          <br />

          {/* Centered CTA row (hard-centered, ignores lp-cta left bias) */}
          <div
            className="lp-cta d-flex justify-content-center gap-3 flex-wrap"
            style={{ marginLeft: 'auto', marginRight: 'auto', width: 'fit-content' }}
          >
            <Link to="/dashboard/default" className="btn btn-primary btn-lg">
              Get Started
            </Link>

            <button type="button" className="btn btn-outline-secondary btn-lg" onClick={() => setShowUsePid(true)}>
              Use Portfolio ID
            </button>
          </div>
        </div>

        <br />
        <div className="lp-copy text-center">
          © {new Date().getFullYear()} Kinko Wallet — <span className="nowrap">Always stay in control.</span>
        </div>
        <div
          className="lp-copy text-center"
          style={{
            marginTop: '0.25rem',
            maxWidth: '600px',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}
        >
          <strong>Disclaimer:</strong> Prices are sourced from third parties and may not be accurate. We display a weighted average, but
          always verify with other sources before making any trading decisions.
        </div>
        <div className="lp-hero-divider" />
      </header>

      <PortfolioIdModal show={showUsePid} onHide={() => setShowUsePid(false)} />
    </div>
  );
}
