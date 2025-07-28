import PropTypes from 'prop-types';
// react-bootstrap
import FormCheck from 'react-bootstrap/FormCheck';

// ==============================|| REACT TABLE - INDETERMINATE CHECKBOX ||============================== //

export default function IndeterminateCheckbox({ indeterminate, checked, onChange }) {
  return (
    <FormCheck.Input
      className="input-primary"
      type="checkbox"
      ref={(el) => el && (el.indeterminate = indeterminate ?? false)}
      checked={checked}
      onChange={onChange}
    />
  );
}

IndeterminateCheckbox.propTypes = { indeterminate: PropTypes.bool, checked: PropTypes.bool, onChange: PropTypes.func };
