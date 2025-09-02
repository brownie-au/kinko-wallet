// src/components/DisclaimerModal.jsx
import PropTypes from 'prop-types';
import { Modal, Button } from 'react-bootstrap';

export default function DisclaimerModal({ show, onHide }) {
  const titleId = 'kw-disclaimer-title';
  const modalId = 'kw-disclaimer-modal';

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      aria-labelledby={titleId}
      id={modalId}
    >
      <Modal.Header closeButton>
        <Modal.Title id={titleId} className="text-body">Kinko Wallet Disclaimer</Modal.Title>
      </Modal.Header>
      <Modal.Body className="text-body">
        <p>
          Kinko Wallet is a portfolio viewer dashboard designed to make it easier for users to
          watch their own wallets, view balances, and stakes across supported EVM chains.
        </p>

        <p><strong>Please read carefully before using:</strong></p>

        <h6 className="mb-1 text-body fw-semibold">Not Financial Advice</h6>
        <p className="mb-3">
          Kinko Wallet does not provide financial, investment, legal, or tax advice. All information
          shown (including prices, balances, portfolio values, and staking data) is for informational
          purposes only. You are solely responsible for your investment decisions.
        </p>

        <h6 className="mb-1 text-body fw-semibold">No Custody</h6>
        <p className="mb-3">
          Kinko Wallet is a non-custodial, watch-only tool. We never request or store your private
          keys, seed phrases, or passwords. You remain in full control of your wallets and funds at
          all times.
        </p>

        <h6 className="mb-1 text-body fw-semibold">Third-Party Integrations</h6>
        <p className="mb-3">
          Kinko Wallet may display data from external APIs, block explorers, and DAPPs. We cannot
          guarantee the accuracy, reliability, or availability of third-party services. Use of any
          third-party application or service is entirely at your own risk.
        </p>

        <h6 className="mb-1 text-body fw-semibold">Risk of Loss</h6>
        <p className="mb-3">
          Cryptocurrency and blockchain assets are highly volatile and risky. You may lose some or
          all of your funds by interacting with decentralised protocols. Kinko Wallet accepts no
          responsibility for losses incurred.
        </p>

        <h6 className="mb-1 text-body fw-semibold">No Guarantees</h6>
        <p className="mb-0">
          We make no guarantees regarding uptime, data accuracy, token valuations, or integration
          stability. Features may change or be discontinued without notice.
        </p>

        <hr />
        <p className="mb-0">
          By using Kinko Wallet, you acknowledge and agree that you use it at your own risk, and that
          you will not hold Kinko Wallet or its contributors liable for any losses, damages, or other
          consequences arising from its use.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

DisclaimerModal.propTypes = {
  show: PropTypes.bool,
  onHide: PropTypes.func,
};
