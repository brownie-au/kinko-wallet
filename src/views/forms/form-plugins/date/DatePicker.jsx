import { useEffect } from 'react';

// project-imports
import ReferenceHeader from 'components/ReferenceHeader';
import DatePickerPreview from 'sections/forms/form-plugins/date/DatePicker';

// =============================|| DATE - DATE PICKER ||============================== //

export default function DatePickerPage() {
  const useClickOutside = (ref, callback) => {
    useEffect(() => {
      const handleClickOutside = (event) => {
        if (ref.current && !ref.current.contains(event.target)) {
          callback();
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [ref, callback]);
  };
  return (
    <>
      <ReferenceHeader
        caption="A vanilla JavaScript remake of bootstrap-datepicker is written from scratch as ECMAScript modules/Sass stylesheets to reproduce similar usability to bootstrap-datepicker."
        link="https://mymth.github.io/vanillajs-datepicker/#/"
      />
      <DatePickerPreview useClickOutside={useClickOutside} />
    </>
  );
}
