// src/menu-items/navigation.jsx

import { loadWallets } from '../utils/walletStorage'; // adjust if needed

const wallets = loadWallets() || [];

const navigation = {
  id: 'navigation',
  title: 'Secure Insights, No Keys Required',
  type: 'group',
  children: [
    // Plain link, NO children
    {
      id: 'dashboard',
      title: 'Dashboard',
      type: 'item',
      url: '/dashboard/default',
      icon: <i className="ph ph-gauge" />
    },

    // Collapsible portfolio section
    {
      id: 'wallet-portfolio',
      title: 'Wallet Portfolio',
      type: 'collapse',
      icon: <i className="ph ph-wallet" />,
      children: [
        {
          id: 'wallet-view-all',
          title: 'View All',
          type: 'item',
          url: '/portfolio'
        },
        ...wallets.map((w) => ({
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
