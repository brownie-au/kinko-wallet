import { loadWallets } from '../utils/walletStorage'; // Adjust path if needed

const wallets = loadWallets();

const navigation = {
  id: 'navigation',
  title: 'Secure Insights, No Keys Required',
  type: 'group',
  children: [
    {
      id: 'wallet-portfolio',
      title: 'Wallet Portfolio',
      type: 'collapse',
      icon: <i className="ph ph-wallet" />,
      // DYNAMIC CHILDREN
      children: [
        {
          id: 'wallet-view-all',
          title: 'View All',
          type: 'item',
          url: '/portfolio'
        },
        ...wallets.map(w => ({
          id: `wallet-${w.address.slice(-4)}`,
          title: `0x...${w.address.slice(-4)} – ${w.name || 'Unnamed'}`,
          type: 'item',
          url: `/wallet/${w.address}`
        })),
        {
          id: 'wallet-manage',
          title: 'Manage Wallets',
          type: 'item',
          url: '/wallets/manage'
        }
      ]
    }
  ]
};

export default navigation;
