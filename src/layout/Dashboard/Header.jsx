import { useEffect } from 'react';
import AppLink from 'components/AppLink';
import { handlerDrawerOpen, useGetMenuMaster } from 'api/menu';
import useConfig from 'hooks/useConfig';
import { setResolvedTheme } from 'components/setResolvedTheme';

export default function Header() {
  const { mode } = useConfig();
  const { menuMaster } = useGetMenuMaster();
  const open = !!menuMaster?.isDashboardDrawerOpened;
  useEffect(() => {
    setResolvedTheme(mode);
  }, [mode]);
  return (
    <header className="kw-mobile-header">
      <button
        type="button"
        className="btn btn-outline-secondary"
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="kw-mobile-navigation"
        onClick={() => handlerDrawerOpen(true)}
      >
        <span aria-hidden="true">☰</span>
        <span>Menu</span>
      </button>
      <nav aria-label="Quick navigation">
        <AppLink nav to="/portfolio">
          Portfolio
        </AppLink>
        <AppLink nav to="/wallets/manage">
          Wallets
        </AppLink>
      </nav>
    </header>
  );
}
