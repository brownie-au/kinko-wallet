// src/layout/Dashboard/Drawer/DrawerContent/NavMulti.jsx
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import ListGroup from 'react-bootstrap/ListGroup';
import Badge from 'react-bootstrap/Badge';
import clsx from 'clsx';

import menuItems from 'menu-items';
import useConfig from 'hooks/useConfig';
import { MenuOrientation, ThemeDirection } from 'config';

const LS_KEY = 'kw:sidebarOpen:v1';
const readOpenMap = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
const writeOpenMap = (m) => { try { localStorage.setItem(LS_KEY, JSON.stringify(m || {})); } catch { } };

const collectUrls = (node) => {
    if (!node) return [];
    if (node.type === 'item') return node.url ? [node.url] : [];
    if (Array.isArray(node.children)) return node.children.flatMap(collectUrls);
    return [];
};

const Item = ({ item }) => (
    <li className="pc-item">
        {item.disabled ? (
            <span className="pc-link disabled">
                {item.icon && <span className="pc-micon">{item.icon}</span>}
                <span className="pc-mtext">{item.title}</span>
                <Badge className="pc-badge">Soon</Badge>
            </span>
        ) : (
            <NavLink to={item.url} className={({ isActive }) => clsx('pc-link', isActive && 'active')}>
                {item.icon && <span className="pc-micon">{item.icon}</span>}
                <span className="pc-mtext">{item.title}</span>
            </NavLink>
        )}
    </li>
);

const CollapseNode = ({ node, openMap, setOpen, themeDirection }) => {
    const isOpen = !!openMap[node.id];
    return (
        <li className={clsx('pc-item kw-hasmenu', isOpen && 'kw-open')}>
            {/* NOTE: kw-link/kw-hasmenu avoids theme accordion selectors */}
            <button
                type="button"
                className="kw-link text-start w-100 border-0 bg-transparent"
                onClick={(e) => {
                    e.stopPropagation();
                    e.nativeEvent?.stopImmediatePropagation?.();
                    setOpen(node.id, !isOpen);
                }}
            >
                {node.icon && <span className="pc-micon">{node.icon}</span>}
                <span className="pc-mtext">{node.title}</span>
                <span className={clsx('pc-arrow', isOpen && 'kw-rot')}>
                    <i className="ti ti-chevron-right" />
                </span>
                {node.badge && <Badge className="pc-badge">{node.badge}</Badge>}
            </button>

            <ul className={clsx('pc-submenu', themeDirection === ThemeDirection.RTL && 'edge', isOpen ? 'kw-show' : 'kw-hide')}>
                {Array.isArray(node.children) &&
                    node.children.map((child) =>
                        child.type === 'item' ? (
                            <Item key={child.id} item={child} />
                        ) : child.type === 'collapse' ? (
                            <CollapseNode
                                key={child.id}
                                node={child}
                                openMap={openMap}
                                setOpen={setOpen}
                                themeDirection={themeDirection}
                            />
                        ) : null
                    )}
            </ul>
        </li>
    );
};

export default function NavMulti() {
    const { pathname } = useLocation();
    const { menuOrientation, themeDirection } = useConfig();
    const groups = useMemo(() => menuItems.items || [], []);

    const [openMap, setOpenMap] = useState(() => readOpenMap());
    const setOpen = (id, next) => {
        setOpenMap((prev) => {
            const updated = { ...prev, [id]: next };
            writeOpenMap(updated);
            return updated;
        });
    };

    // Auto-open sections that contain current route (doesn't close others)
    useEffect(() => {
        const draft = { ...openMap };
        let changed = false;
        const scan = (n) => {
            if (!n) return;
            if (n.type === 'collapse') {
                const urls = collectUrls(n);
                if (urls.some((u) => u && pathname.startsWith(u)) && !draft[n.id]) {
                    draft[n.id] = true; changed = true;
                }
            }
            if (Array.isArray(n.children)) n.children.forEach(scan);
        };
        groups.forEach(scan);
        if (changed) { setOpenMap(draft); writeOpenMap(draft); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    return (
        <ul className={`pc-navbar d-block ${menuOrientation === MenuOrientation.TAB ? 'pc-tab-link nav flex-column' : ''}`}>
            {groups.map((group) =>
                group.type !== 'group' ? (
                    <h6 key={group.id} color="error" className="align-items-center">Fix - Navigation Group</h6>
                ) : (
                    <ListGroup as="li" key={group.id} className="pc-item border-0 bg-transparent">
                        {group.title && (
                            <div className="pc-navbar-title px-3 pt-2 pb-1 text-uppercase opacity-75 small">{group.title}</div>
                        )}
                        {(group.children || []).map((node) =>
                            node.type === 'item' ? (
                                <ListGroup key={node.id} className="pc-item border-0 bg-transparent">
                                    <Item item={node} />
                                </ListGroup>
                            ) : node.type === 'collapse' ? (
                                <ListGroup key={node.id} className={clsx('pc-item kw-hasmenu border-0 bg-transparent', openMap[node.id] && 'kw-open')}>
                                    <CollapseNode
                                        node={node}
                                        openMap={openMap}
                                        setOpen={setOpen}
                                        themeDirection={themeDirection}
                                    />
                                </ListGroup>
                            ) : null
                        )}
                    </ListGroup>
                )
            )}
        </ul>
    );
}
