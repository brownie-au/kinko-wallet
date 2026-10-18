import { forwardRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';

// Commit navigation immediately so the address bar and rendered route stay in sync.
// Modified clicks retain the browser's normal new-tab/window behaviour.
const AppLink = forwardRef(function AppLink({ to, onClick, target, nav = false, ...props }, ref) {
  const navigate = useNavigate();
  const Component = nav ? NavLink : Link;
  return (
    <Component
      {...props}
      ref={ref}
      to={to}
      target={target}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey ||
          (target && target !== '_self')
        )
          return;
        event.preventDefault();
        navigate(to, {
          flushSync: true,
          replace: props.replace,
          state: props.state,
          relative: props.relative,
          preventScrollReset: props.preventScrollReset
        });
      }}
    />
  );
});
export default AppLink;
