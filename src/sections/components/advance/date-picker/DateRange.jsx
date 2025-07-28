import PropTypes from 'prop-types';
import { useRef, useState } from 'react';

// react-bootstrap
import Form from 'react-bootstrap/Form';
import Stack from 'react-bootstrap/Stack';

// third-party
import Calendar from 'react-calendar';

// project-imports
import MainCard from 'components/MainCard';

function formatDate(date) {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

// ==============================|| DATE PICKER - DATE RANGE ||============================== //

export default function DateRangePage({ useClickOutside }) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [dateRange, setDateRange] = useState(null);
  const [activeInput, setActiveInput] = useState(null);

  const calendarRef = useRef(null);

  useClickOutside(calendarRef, () => setIsCalendarOpen(false));

  const handleInputClick = (input) => {
    setActiveInput(input);
    setIsCalendarOpen(true);
  };

  const handleDateChange = (selectedDate) => {
    if (Array.isArray(selectedDate)) {
      setDateRange(selectedDate);
      setIsCalendarOpen(false);
      setActiveInput(null);
    }
  };

  const startDate = dateRange ? formatDate(dateRange[0]) : '';
  const endDate = dateRange && dateRange[1] ? formatDate(dateRange[1]) : '';

  return (
    <MainCard title="Date Range" className="position-relative">
      <Stack direction="horizontal">
        <Form.Control
          type="text"
          className=" rounded-start rounded-end-0"
          placeholder="Start date"
          value={startDate}
          onClick={() => handleInputClick('start')}
          readOnly
        />
        <Form.Control
          type="text"
          className="text-end rounded-start-0 rounded-end"
          placeholder="End date"
          value={endDate}
          onClick={() => handleInputClick('end')}
          readOnly
        />
      </Stack>
      {isCalendarOpen && (
        <div ref={calendarRef}>
          <Calendar
            selectRange
            onChange={handleDateChange}
            formatShortWeekday={(locale, date) => date.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 2)}
            value={dateRange}
            prev2Label={null}
            next2Label={null}
            prevLabel="«"
            nextLabel="»"
            className={`react-calendar ${activeInput === 'end' ? 'end-active' : ''}`}
          />
        </div>
      )}
    </MainCard>
  );
}

DateRangePage.propTypes = { useClickOutside: PropTypes.any };
