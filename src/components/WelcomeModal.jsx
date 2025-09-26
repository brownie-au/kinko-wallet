// src/components/WelcomeModal.jsx
import { Modal, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

export default function WelcomeModal({ show, onHide }) {
    const navigate = useNavigate();

    const handleLearnMore = () => {
        try { onHide && onHide(); } catch {}
        navigate('/learn-more');
    };

    return (
        <Modal
            show={show}
            onHide={onHide}
            centered
            backdrop="static"
            keyboard={false}
        >
            <Modal.Header closeButton>
                <Modal.Title>Welcome to Kinko Wallet</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <p>Add your first wallet to get started.</p>
                <p>We support EVM chains: Ethereum, PulseChain, BSC, Polygon, Base.</p>
                <p>
                    Paste a public wallet address (and optional name), then click <b>Add Wallet</b>.
                </p>
                <p>No keys needed — this is a watch/viewing wallet only.</p>
            </Modal.Body>
            <Modal.Footer>
                <Button
                    variant="link"
                    onClick={handleLearnMore}
                >
                    Learn more
                </Button>
                <Button variant="primary" onClick={onHide}>
                    Get started
                </Button>
            </Modal.Footer>
        </Modal>
    );
}

