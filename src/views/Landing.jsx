import { useState } from 'react';
import { Link } from 'react-router-dom';
import useTheme from '../hooks/useTheme.js';
import PortfolioIdModal from '../components/PortfolioIdModal.jsx';
import Logo from 'assets/images/logo-white.svg';
import 'assets/scss/landing.scss';

export default function LandingPage() {
  const [showUsePid, setShowUsePid] = useState(false);
  const theme = useTheme();
  const outlineVariant = theme === 'light' ? 'btn-outline-dark' : 'btn-outline-light';

  return (
    <div className="landing-page">
      <header className="lp-hero" id="home">
        <div className="container text-center">
          <img className="brand-badge" src={Logo} alt="Kinko Wallet" />

          <h1 className="lp-title">Your DeFi Command Center</h1>
          <p className="lp-tagline">Secure insights, no keys required.</p>
          <br />

          {/* Centered CTA row */}
          <div className="lp-cta d-flex justify-content-center gap-3 flex-wrap">
            <Link to="/dashboard/default" className="btn btn-primary btn-lg">
              Get Started
            </Link>

            <button
              type="button"
              className={`btn ${outlineVariant} btn-lg`}
              onClick={() => setShowUsePid(true)}
            >
              Use Portfolio ID
            </button>
          </div>
        </div>

        <br />
        <div className="lp-copy text-center">
          © {new Date().getFullYear()} Kinko Wallet — <span className="nowrap">Always stay in control.</span>
        </div>
        <div className="lp-hero-divider" />
      </header>

      <PortfolioIdModal show={showUsePid} onHide={() => setShowUsePid(false)} />
    </div>
  );
}
