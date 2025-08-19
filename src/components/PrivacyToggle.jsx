import { Button, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { usePrivacy } from '../contexts/PrivacyContext.jsx';

export default function PrivacyToggle({ size = 'sm', variant = 'outline-secondary' }) {
    const { privacyOn, togglePrivacy } = usePrivacy();
    const title = privacyOn ? 'Show balances' : 'Hide balances';
    const icon = privacyOn ? '🙈' : '👁️';

    return (
        <OverlayTrigger placement="bottom" overlay={<Tooltip>{title}</Tooltip>}>
            <Button
                size={size}
                variant={variant}
                onClick={togglePrivacy}
                aria-label={title}
                aria-pressed={privacyOn}
            >
                <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
            </Button>
        </OverlayTrigger>
    );
}
