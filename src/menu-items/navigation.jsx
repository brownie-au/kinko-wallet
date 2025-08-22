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
        ...wallets.map((w, idx) => ({
          id: `wallet-${(w.address || '').slice(-6)}-${idx}`,
          title: `0x...${(w.address || '').slice(-4)} – ${w.name || 'Unnamed'}`,
          type: 'item',
          url: `/wallet/${w.address}`
        }))
        // NOTE: "Manage Wallets" moved out of here to be a top-level item at bottom
      ]
    },

    // Staking & Mining section
    {
      id: 'staking-mining',
      title: 'Staking & Mining',
      type: 'collapse',
      icon: <i className="ph ph-chart-line-up" />, // pick any ph icon you like
      children: [
        {
          id: 'hex-staking',
          title: 'HEX Staking',
          type: 'item',
          url: '/staking/hex'
        },
        {
          id: 'phex-staking',
          title: 'pHEX Staking',
          type: 'item',
          url: '/staking/phex',
          disabled: true
        },
        {
          id: 'eth-staking',
          title: 'ETH Staking',
          type: 'item',
          url: '/staking/eth',
          disabled: true
        }
      ]
    },

    // Moved to bottom as a top-level item
    {
      id: 'manage-wallets',
      title: 'Manage Wallets',
      type: 'item',
      url: '/wallets/manage',
      icon: <i className="ph ph-gear-six" />
    }
  ]
};

export default navigation;
