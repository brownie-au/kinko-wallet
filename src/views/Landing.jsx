// src/views/Landing.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import PortfolioIdModal from '../components/PortfolioIdModal.jsx';
import PortfolioIdChip from '../components/PortfolioIdChip.jsx';
import Logo from 'assets/images/logo-white.svg';
import 'assets/scss/landing.scss';

export default function LandingPage() {
  const [showPid, setShowPid] = useState(false);

  return (
    <div className="landing-page">
      <header className="lp-hero" id="home">
        <div className="container">
          <img className="brand-badge" src={Logo} alt="Kinko Wallet" />

          <h1 className="lp-title">Your DeFi Command Center</h1>
          <p className="lp-tagline">Secure insights, no keys required.</p>
          <br />

          {/* Always show current Portfolio ID if present */}
          <div className="mb-3">
            <PortfolioIdChip />
          </div>

          <div className="lp-cta">
            <Link to="/dashboard/default" className="btn btn-primary btn-lg me-2">
              Get Started
            </Link>

            <button
              type="button"
              className="btn btn-outline-light btn-lg"
              onClick={() => setShowPid(true)}
            >
              Portfolio ID
            </button>
          </div>
        </div>

        <br />
        <div className="lp-copy">
          © {new Date().getFullYear()} Kinko Wallet — <span className="nowrap">Always stay in control.</span>
        </div>
        <div className="lp-hero-divider" />
      </header>

      <PortfolioIdModal show={showPid} onHide={() => setShowPid(false)} />
    </div>
  );
}
