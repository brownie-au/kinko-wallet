// react-bootstrap
import Col from 'react-bootstrap/Col';
import Nav from 'react-bootstrap/Nav';
import Row from 'react-bootstrap/Row';
import Stack from 'react-bootstrap/Stack';

// icons
import { FaRegCopy } from 'react-icons/fa';

// project-imports
import useConfig from 'hooks/useConfig';
import branding from 'branding.json';

// ==============================|| MAIN LAYOUT - FOOTER ||============================== //
export default function Footer() {
  const { container } = useConfig();
  const donationAddress = '0x5c05aa766e4e9c392a2818fadd9b8b175bd56d75';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(donationAddress);
      alert('Donation address copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <footer className="pc-footer">
      <div className={`footer-wrapper ${container === false ? 'container-fluid' : 'container'}`}>
        <Row className="justify-content-center justify-content-md-between">
          {/* Footer Text */}
          <Col xs="auto" className="my-1">
            <p className="m-0">
              {branding.brandName} ♥ Built by Brownie{' '}
              <a
                href="https://x.com/RobBrow22393477"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary"
              >
                X
              </a>
            </p>
          </Col>

          {/* Footer Links */}
          <Col xs="auto" className="my-1">
            <Stack direction="horizontal" gap={3} className="justify-content-center">
              {/* Donations: text + address (address is the only link) */}
              <div className="d-flex align-items-center gap-2">
                <span>Donations:</span>
                <a
                  href="https://libertyswap.finance"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-reset text-decoration-none"
                  style={{ fontSize: 'inherit' }}
                >
                  {donationAddress}
                </a>
                <FaRegCopy
                  role="button"
                  onClick={handleCopy}
                  style={{ cursor: 'pointer' }}
                  title="Copy to clipboard"
                />
              </div>

              <Nav.Link
                className="p-0"
                as="a"
                href="https://x.com/RobBrow22393477"
                target="_blank"
                rel="noopener noreferrer"
              >
                Suggestions
              </Nav.Link>
            </Stack>
          </Col>
        </Row>
      </div>
    </footer>
  );
}
