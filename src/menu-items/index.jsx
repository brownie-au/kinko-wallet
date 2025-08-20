// src/menu-items/index.jsx

// bring in the default Datta 'navigation' (if you still use it)
import navigation from './navigation';

// bring in your Kinko Wallet menu (Dashboard, Wallet Portfolio, etc.)
import kinkoMenu from './kinko';

const menuItems = {
  items: [
    // keep both, order controls how they appear in the sidebar
    // (you can remove 'navigation' later if unused)
    kinkoMenu,
    navigation
  ]
};

export default menuItems;
