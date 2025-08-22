/* src/styles/kw-sidebar-override.css */
.kw-hasmenu > .pc-submenu.kw-hide { display: none; }
.kw-hasmenu > .pc-submenu.kw-show { display: block; }

/* Make our toggle look like .pc-link without using that class (to avoid theme JS) */
.kw-link {
  display: block;
  width: 100%;
  padding: var(--bs-list-group-item-padding-y, 8px) var(--bs-list-group-item-padding-x, 16px);
  color: inherit;
  text-decoration: none;
  background: transparent;
}

/* Rotate caret when open */
.kw-open .pc-arrow { transform: rotate(90deg); transition: transform .2s ease; }
