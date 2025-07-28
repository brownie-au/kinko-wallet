import PropTypes from 'prop-types';
// react-bootstrap
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import ListGroup from 'react-bootstrap/ListGroup';
import Tooltip from 'react-bootstrap/Tooltip';

// project-imports
import useConfig from 'hooks/useConfig';

// =============================|| CUSTOMIZER - CUSTOM THEME ||============================== //

export default function CustomTheme({ themeColors }) {
  const { onChangeThemePreset, customColor } = useConfig();

  return (
    <ListGroup.Item>
      <h6 className="mb-1">Custom Theme</h6>
      <p className="text-muted text-sm">Choose your primary theme color</p>
      <div className="theme-color preset-color">
        {themeColors.map(({ id, label }) => (
          <OverlayTrigger key={id} placement="top" overlay={<Tooltip>{label}</Tooltip>}>
            <a
              href="#!"
              className={customColor === id ? 'active' : ''}
              data-value={id}
              aria-label={label}
              onClick={(e) => {
                e.preventDefault();
                onChangeThemePreset('customColor', id);
              }}
            >
              <i className="ti ti-checks" />
            </a>
          </OverlayTrigger>
        ))}
      </div>
    </ListGroup.Item>
  );
}

CustomTheme.propTypes = { themeColors: PropTypes.array };
