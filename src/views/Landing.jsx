// src/views/Landing.jsx
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PortfolioIdModal from '../components/PortfolioIdModal.jsx';
import DisclaimerModal from '../components/DisclaimerModal.jsx';
import WelcomeModal from '../components/WelcomeModal.jsx'; // NEW
import Logo from 'assets/images/logo-white.svg';
import 'assets/scss/landing.scss';
import '../styles/hero-buttons.css';

function readAllWalletsFromLS() {
  try {
    const raw = localStorage.getItem('wallets');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default function LandingPage() {
  const [showUsePid, setShowUsePid] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [walletCount, setWalletCount] = useState(0);

  const navigate = useNavigate();

  // On mount: read wallets and auto-open Disclaimer if none
  useEffect(() => {
    const wallets = readAllWalletsFromLS();
    const count = wallets.length;
    setWalletCount(count);
    setShowDisclaimer(count === 0); // 🔔 auto-pop on new users
  }, []);

  const handleNewUserClick = () => {
    navigate('/wallets/manage');
    if (walletCount === 0) setShowWelcome(true);
  };

  return (
    <div className="landing-page">
      <header className="lp-hero" id="home">
        <div className="container text-center">
          <img className="brand-badge" src={Logo} alt="Kinko Wallet" />

          <h1 className="lp-title">Your DeFi Command Center</h1>
          <p className="lp-tagline">Secure insights, no keys required.</p>
          <br />

          {/* New User pill on its own row (centered) */}
          {walletCount === 0 && (
            <div className="hero-button-top">
              <button
                type="button"
                className="btn hero-pill btn-kinko-green"
                onClick={handleNewUserClick}
              >
                New User — Start Here
              </button>
            </div>
          )}

          {/* Dashboard + Portfolio ID row */}
          <div className="hero-button-group">
            <Link to="/dashboard/default" className="btn btn-primary hero-pill">
              Dashboard
            </Link>
            <button
              type="button"
              className="btn btn-outline-secondary hero-pill"
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

      {/* Modals */}
      <PortfolioIdModal
        show={showUsePid}
        onHide={() => setShowUsePid(false)}
        onSuccess={() => navigate('/wallets/manage')}
      />
      <DisclaimerModal
        show={showDisclaimer}
        onHide={() => setShowDisclaimer(false)}
      />
      <WelcomeModal
        show={showWelcome}
        onHide={() => setShowWelcome(false)}
      />
    </div>
  );
}
