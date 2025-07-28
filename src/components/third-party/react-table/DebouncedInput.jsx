import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';

// react-bootstrap
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';

// ==============================|| REACT TABLE - DEBOUNCED INPUT ||============================== //

export default function DebouncedInput({
  value: initialValue,
  onFilterChange,
  debounce = 500,
  type = 'text',
  inputStyle,
  inputProps = {},
  ...props
}) {
  const [value, setValue] = useState(initialValue);

  const handleInputChange = (event) => {
    setValue(event.target.value);
  };

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      onFilterChange(value);
    }, debounce);

    return () => clearTimeout(timeout);
  }, [value, onFilterChange, debounce]);

  return (
    <InputGroup className={` ${inputStyle || 'w-auto'}`}>
      <Form.Control className="datatable-input" type={type} value={value} onChange={handleInputChange} placeholder="Search..." {...props} />
    </InputGroup>
  );
}

DebouncedInput.propTypes = {
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onFilterChange: PropTypes.func,
  debounce: PropTypes.number,
  type: PropTypes.string,
  inputStyle: PropTypes.string,
  inputProps: PropTypes.object,
  props: PropTypes.any
};
