import PropTypes from 'prop-types';
// react-bootstrap
import Image from 'react-bootstrap/Image';
import Stack from 'react-bootstrap/Stack';

// project-imports
import MainCard from 'components/MainCard';

// ==============================|| PAYMENT METHOD CARD ||============================== //

export default function PaymentMethodCard({ name, logo, bgColor, label, date, cardNumber, cvv, image }) {
  return (
    <MainCard
      headerClassName="border-bottom-0"
      title={
        <Stack direction="horizontal" className="align-items-center justify-content-between">
          <p className="text-white mb-0">{name}</p>
          <Image src={logo} className="img-fluid" alt="card title" />
        </Stack>
      }
      className={`visa-top widget-focus ${bgColor}`}
    >
      <div className="visa">
        <h6 className="f-w-600 text-white">
          {label} <span className="f-w-300 m-l-10">{date}</span>
        </h6>
        <h3 className="f-w-300 text-white m-t-25 m-b-0">{cardNumber}</h3>
        <span className="text-white">{cvv}</span>
        <Image src={image} className="img-fluid" alt="card back" />
      </div>
    </MainCard>
  );
}

PaymentMethodCard.propTypes = {
  name: PropTypes.string,
  logo: PropTypes.string,
  bgColor: PropTypes.string,
  label: PropTypes.string,
  date: PropTypes.string,
  cardNumber: PropTypes.string,
  cvv: PropTypes.number,
  image: PropTypes.string
};
