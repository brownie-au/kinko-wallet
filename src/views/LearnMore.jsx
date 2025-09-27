// src/views/LearnMore.jsx
import { Link } from "react-router-dom";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";

import "assets/scss/learn-more.scss";

const externalLinkProps = {
  target: "_blank",
  rel: "noopener noreferrer"
};

export default function LearnMore() {
  return (
    <Container fluid className="learn-more-wrapper py-4 py-lg-5">
      <Row className="justify-content-center">
        <Col xl={10} lg={10} md={11}>
          <div className="glass-card">
            <div className="learn-more-header mb-4 text-center">
              <h1 className="learn-more-title">Learn More About Kinko Wallet</h1>
              <p className="learn-more-subtitle">
                Kinko Wallet is your safe, watch-only portfolio dashboard built for clarity, simplicity, and control.
              </p>
            </div>

            <div className="learn-more-card__body">
              {/* SAFETY */}
              <section>
                <h2 className="section-heading">Safety First</h2>
                <p>
                  Kinko Wallet is built with one simple rule: we will never ask for your private keys or seed phrases.
                  Kinko Wallet is a watch-only, web-based portfolio viewer and launcher.
                  You stay in control at all times — your funds and keys never leave your device.
                </p>
              </section>

              {/* QUICK START */}
              <section>
                <h2 className="section-heading">Quick Start</h2>
                <ul>
                  <li>Open Kinko Wallet and click <strong>Get Started</strong>.</li>
                  <li>
                    Add a Wallet: paste any{" "}
                    <a
                      href="https://www.coinbase.com/en-au/learn/crypto-glossary/what-is-the-ethereum-virtual-machine#What-is-the-Ethereum-Virtual-Machine-EVM"
                      {...externalLinkProps}
                    >
                      EVM public address
                    </a>{" "}
                    and give it a friendly name.
                  </li>
                  <li>
                    Create a Portfolio ID (optional): once you’ve added at least one wallet,
                    create your unique key (for example, “A1B2C3D”) to sync your wallet list across devices.
                  </li>
                  <li>Load an Existing ID: paste your saved Portfolio ID to instantly restore your wallets on any device.</li>
                </ul>
              </section>

              {/* CORE FEATURES */}
              <section>
                <h2 className="section-heading">Core Features</h2>
                <ul>
                  <li>
                    <strong>Dashboard</strong> – view your Total Portfolio Value, Top Tokens, Transaction History,
                    and market indicators like the global market cap and the Fear &amp; Greed Index.
                  </li>
                  <li>
                    <strong>Multi-Wallet Support</strong> – track multiple addresses, rename them, and hide/unhide as needed.
                  </li>
                  <li>
                    <strong>Portfolio ID</strong> – your portable key for reloading your public wallet addresses on any device.
                  </li>
                  <li>
                    <strong>Staking Panels</strong> – dedicated pages for{" "}
                    <a href="https://hex.com" {...externalLinkProps}>HEX</a> and{" "}
                    <a href="https://hex.com" {...externalLinkProps}>eHEX</a> staking data.
                  </li>
                  <li>
                    <strong>Caching &amp; Refresh</strong> – loads instantly from local cache, with automatic background refresh every 10 minutes.
                  </li>
                </ul>
              </section>

              {/* ROADMAP */}
              <section>
                <h2 className="section-heading">Roadmap &amp; Future Development</h2>
                <p className="section-intro">These features are in active planning and not yet live:</p>
                <ul>
                  <li>
                    <strong>Staking Panels</strong> – dedicated pages for{" "}
                    {/* EXCLUDED: open in same tab */}
                    <Link to="/staking/eth">ETH</Link> and{" "}
                    <Link to="/staking/pls">PLS</Link>{" "}
                    staking data, allowing users to track their staked assets and rewards in one place.
                  </li>
                  <li>
                    <strong>NFT Viewer</strong> – a unified page to display your NFTs across chains, with estimated values when available.
                  </li>
                  <li>
                    <strong>DApp Dashboard</strong> – a central hub to access curated DApps (DEXs like{" "}
                    <a href="https://swap.cow.fi/" {...externalLinkProps}>CoW Swap</a>,{" "}
                    <a href="https://libertyswap.finance/" {...externalLinkProps}>Liberty Swap</a>,{" "}
                    <a href="https://app.piteas.io/" {...externalLinkProps}>Piteas</a>),
                    mark favourites, and add new ones.
                  </li>
                </ul>
              </section>

              {/* FAQ */}
              <section>
                <h2 className="section-heading">FAQs</h2>
                <div className="faq-item">
                  <p className="faq-question"><strong>Is Kinko a wallet like MetaMask?</strong></p>
                  <p className="faq-answer">
                    No. Kinko is a watch-only viewer and launcher. It never holds your funds or private keys.
                    For transaction signing, use a wallet such as{" "}
                    <a href="https://internetmoney.io/" {...externalLinkProps}>Internet Money</a> or your preferred hardware wallet.
                  </p>
                </div>
                <div className="faq-item">
                  <p className="faq-question"><strong>What does a Portfolio ID store?</strong></p>
                  <p className="faq-answer">Only your public addresses and preferences. Never your keys or funds.</p>
                </div>
                <div className="faq-item">
                  <p className="faq-question"><strong>Which chains are supported?</strong></p>
                  <p className="faq-answer">
                    Ethereum (<a href="https://ethereum.org/" {...externalLinkProps}>ethereum.org</a>),
                    PulseChain (<a href="https://pulsechain.com/" {...externalLinkProps}>pulsechain.com</a>),
                    BSC (<a href="https://www.bnbchain.org/en" {...externalLinkProps}>BNB Smart Chain</a>),
                    Polygon (<a href="https://polygon.technology/" {...externalLinkProps}>polygon.technology</a>),
                    and Base (<a href="https://base.org/" {...externalLinkProps}>base.org</a>).
                  </p>
                </div>
                <div className="faq-item">
                  <p className="faq-question"><strong>Does Kinko charge fees?</strong></p>
                  <p className="faq-answer">Viewing your portfolio is free for up to a few wallets. Paid plans for larger portfolios are planned for the future.</p>
                </div>
                <div className="faq-item">
                  <p className="faq-question"><strong>Why don’t some tokens show prices?</strong></p>
                  <p className="faq-answer">Prices come from third-party sources. Some tokens and NFTs may not have available pricing yet.</p>
                </div>
              </section>

              {/* SUMMARY */}
              <section>
                <h2 className="section-heading">Summary</h2>
                <ul className="summary-list">
                  <li>Kinko Wallet is your safe, simple, watch-only DeFi dashboard.</li>
                  <li>No keys required.</li>
                  <li>All your wallets in one place.</li>
                  <li>Future-ready roadmap with NFTs and DApps coming soon.</li>
                </ul>
              </section>
            </div>
          </div>
        </Col>
      </Row>
    </Container>
  );
}
