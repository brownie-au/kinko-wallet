import PropTypes from 'prop-types';
import { useRef, useState } from 'react';

// react-bootstrap
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Row from 'react-bootstrap/Row';

// third-party
import Calendar from 'react-calendar';

function formatDate(date) {
  return date.toLocaleDateString('en-GB');
}

const positions = [
  { key: 'bottomLeft', placeholder: 'Bottom left', className: 'bottom-left' },
  { key: 'bottomRight', placeholder: 'Bottom right', className: 'bottom-right' },
  { key: 'topLeft', placeholder: 'Top left', className: 'top-left' },
  { key: 'topRight', placeholder: 'Top right', className: 'top-right' }
];

// Helper hook to attach useClickOutside safely
function usePositionClickOutside(ref, key, setVisible, useClickOutside) {
  useClickOutside(ref, () => setVisible((prev) => ({ ...prev, [key]: false })));
}

// =============================|| DATE - POSITION ||============================== //

export default function Position({ useClickOutside }) {
  const [selectedDates, setSelectedDates] = useState({
    topLeft: null,
    topRight: null,
    bottomLeft: null,
    bottomRight: null
  });

  const [visible, setVisible] = useState({
    topLeft: false,
    topRight: false,
    bottomLeft: false,
    bottomRight: false
  });

  const refs = {
    topLeft: useRef(null),
    topRight: useRef(null),
    bottomLeft: useRef(null),
    bottomRight: useRef(null)
  };

  usePositionClickOutside(refs.topLeft, 'topLeft', setVisible, useClickOutside);
  usePositionClickOutside(refs.topRight, 'topRight', setVisible, useClickOutside);
  usePositionClickOutside(refs.bottomLeft, 'bottomLeft', setVisible, useClickOutside);
  usePositionClickOutside(refs.bottomRight, 'bottomRight', setVisible, useClickOutside);

  const toggleCalendar = (key) => {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDateChange = (key, date) => {
    if (date instanceof Date) {
      setSelectedDates((prev) => ({ ...prev, [key]: date }));
    }
  };

  return (
    <Row className="mb-3">
      <Col lg={3} sm={12} className="col-form-label text-lg-end">
        <Form.Label className="mb-0">Position</Form.Label>
      </Col>
      <Col lg={4} md={9} sm={12}>
        {positions.map(({ key, placeholder, className }, idx) => (
          <InputGroup className={idx !== 0 ? 'mt-3' : ''} key={key}>
            <Form.Control
              type="text"
              className="datepicker-input"
              placeholder={placeholder}
              value={selectedDates[key] ? formatDate(selectedDates[key]) : ''}
              onClick={() => toggleCalendar(key)}
              readOnly
            />
            {visible[key] && (
              <div ref={refs[key]}>
                <Calendar
                  formatShortWeekday={(locale, date) => date.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 2)}
                  value={selectedDates[key]}
                  prev2Label={null}
                  next2Label={null}
                  prevLabel="«"
                  nextLabel="»"
                  className={className}
                  onChange={(date) => handleDateChange(key, date)}
                />
              </div>
            )}
            <InputGroup.Text>
              <i className="ph ph-calendar-blank" />
            </InputGroup.Text>
          </InputGroup>
        ))}
      </Col>
    </Row>
  );
}

Position.propTypes = { useClickOutside: PropTypes.any };
