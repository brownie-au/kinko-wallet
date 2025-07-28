import PropTypes from 'prop-types';
// project-imports
import MainCard from 'components/MainCard';

// ==============================|| BITCOIN WALLET CARD ||============================== //

export default function BitCoinWalletCard({ title, amount, description, iconClass, bgClass }) {
  return (
    <MainCard className={`bitcoin-wallet ${bgClass}`}>
      <h5 className="text-white mb-2">{title}</h5>
      <h2 className="text-white mb-2 f-w-300">${amount}</h2>
      <span className="text-white d-block">{description}</span>
      <i className={`${iconClass} f-70 text-white`} />
    </MainCard>
  );
}

BitCoinWalletCard.propTypes = {
  title: PropTypes.string,
  amount: PropTypes.string,
  description: PropTypes.string,
  iconClass: PropTypes.string,
  bgClass: PropTypes.string
};
