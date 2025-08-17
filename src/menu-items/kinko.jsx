// src/menu-items/kinko.jsx

// Helper to load wallets from localStorage
function getWallets() {
  try {
    const data = localStorage.getItem('wallets');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

const kinkoMenu = {
  id: 'kinko-wallet',
  title: 'Kinko Wallet',
  type: 'group',
  children: [
    // ----- Single Dashboard link (no dropdown) -----
    {
      id: 'dashboard',
      title: 'Dashboard',
      type: 'item',
      url: '/dashboard/default',
      icon: 'IconLayoutDashboard', // use whatever your icon set expects; can be removed if you prefer no icon
      className: ''
    },

    // ----- Wallet Portfolio collapsible menu -----
    {
      id: 'wallet-portfolio',
      title: 'Wallet Portfolio',
      type: 'collapse',
      icon: 'IconWallet',
      className: '',
      children: [
        {
          id: 'view-all',
          title: 'View All',
          type: 'item',
          url: '/portfolio/',
          icon: 'IconEye',
          className: ''
        },
        // Insert wallets from LocalStorage
        ...getWallets().map((wallet, idx) => ({
          id: `wallet-${idx}`,
          title: `${wallet.name || 'Unnamed'} - 0x...${(wallet.address || '').slice(-4)}`,
          type: 'item',
          url: `/wallets/${wallet.address}`,
          target: false,
          className: ''
        })),
        {
          id: 'wallet-manage',
          title: 'Manage Wallets',
          type: 'item',
          url: '/wallets/manage',
          target: false,
          className: ''
        }
      ]
    }
  ]
};

export default kinkoMenu;
