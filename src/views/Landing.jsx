// src/views/Landing.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PortfolioIdModal from '../components/PortfolioIdModal.jsx';
import DisclaimerModal from '../components/DisclaimerModal.jsx';
import Logo from 'assets/images/logo-white.svg';
import 'assets/scss/landing.scss';

export default function LandingPage() {
  const [showUsePid, setShowUsePid] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const navigate = useNavigate();

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

            <button
              type="button"
              className="btn btn-outline-secondary btn-lg"
              onClick={() => setShowUsePid(true)}
            >
              Use Portfolio ID
            </button>
          </div>
        </div>

        <br />
        <div className="lp-copy text-center">
          © {new Date().getFullYear()} Kinko Wallet —{' '}
          <span className="nowrap">Always stay in control.</span>
        </div>
        <div
          className="lp-copy text-center"
          style={{
            marginTop: '0.25rem',
            maxWidth: '600px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          <button
            type="button"
            className="kw-disclaimer-trigger"
            aria-label="Open full disclaimer"
            aria-haspopup="dialog"
            aria-controls="kw-disclaimer-modal"
            onClick={() => setShowDisclaimer(true)}
            // Keep visual style identical to surrounding text
            style={{
              background: 'transparent',
              border: 0,
              color: 'inherit',
              font: 'inherit',
              padding: 0,
              margin: 0,
              textAlign: 'inherit',
              display: 'inline',
            }}
          >
            <strong>Disclaimer:</strong> Prices are sourced from third parties and may not be accurate. We display
            a weighted average, but always verify with other sources before making any trading decisions.
          </button>
        </div>
        <div className="lp-hero-divider" />
      </header>

      <PortfolioIdModal
        show={showUsePid}
        onHide={() => setShowUsePid(false)}
        onSuccess={() => navigate('/wallets/manage')}
      />
      <DisclaimerModal
        show={showDisclaimer}
        onHide={() => setShowDisclaimer(false)}
      />
    </div>
  );
}
