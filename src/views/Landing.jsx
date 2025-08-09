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
        <div className="container">
          <img className="brand-badge" src={Logo} alt="Kinko Wallet" />

          <h1 className="lp-title">Your DeFi Command Center</h1>
          <p className="lp-tagline">Secure insights, no keys required.</p>
          <br />

          {/* Two main CTA buttons */}
          <div className="lp-cta d-flex gap-2 flex-wrap">
            <Link to="/dashboard/default" className="btn btn-primary btn-lg">
              Get Started
            </Link>

            <button
              type="button"
              className="btn btn-outline-light btn-lg"
              onClick={() => setShowUsePid(true)}
            >
              Use Portfolio ID
            </button>
          </div>
        </div>

        <br />
        <div className="lp-copy">
          © {new Date().getFullYear()} Kinko Wallet — <span className="nowrap">Always stay in control.</span>
        </div>
        <div className="lp-hero-divider" />
      </header>

      {/* Modal for using an existing Portfolio ID */}
      <PortfolioIdModal show={showUsePid} onHide={() => setShowUsePid(false)} />
    </div>
  );
}
