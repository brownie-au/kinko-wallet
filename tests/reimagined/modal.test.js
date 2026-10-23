import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// Exercise React's real event handlers; jsdom supplies DOM events, not native dialog layout.
const dom = new JSDOM('<!doctype html><html><body><button id="opener">Access my Kinko</button><div id="root"></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const { createRoot } = await import('react-dom/client');
let Modal, AccessPage, DataNotices, PortfolioReadings;
before(async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    ({ Modal, AccessPage, DataNotices, PortfolioReadings } = await server.ssrLoadModule('/src/reimagined/ui.jsx'));
  } finally {
    await server.close();
  }
});
after(() => dom.window.close());

test('network notices distinguish coverage limits from stale balances and route actions correctly', () => {
  const root = createRoot(document.querySelector('#root'));
  const actions = [];
  const props = {
    notices: [
      {
        chain: 'bsc',
        code: 'manual',
        kind: 'limitation',
        message: 'Automatic discovery is not configured.',
        wallets: ['a', 'b'],
        action: 'track-token'
      },
      { chain: 'eth', code: 'blocked', kind: 'warning', message: 'Explorer blocked the read.', wallets: ['a'], action: 'retry' },
      { chain: 'base', code: 'price-missing', kind: 'limitation', message: 'No usable market price.', wallets: ['a'] },
      { chain: 'polygon', code: 'discovery-configuration', kind: 'warning', message: 'Provider not configured.', wallets: ['a'] }
    ],
    onTrackToken: (chain) => actions.push(['track', chain]),
    onRetry: (chain) => actions.push(['retry', chain])
  };
  try {
    act(() => root.render(React.createElement(DataNotices, props)));
    const text = document.querySelector('details').textContent;
    assert.match(text, /BNB Smart Chain · 2 wallets · Coverage limit/);
    assert.match(text, /Ethereum · 1 wallet · Read issue/);
    assert.match(text, /Base · 1 wallet · Price unavailable/);
    assert.match(text, /Polygon · 1 wallet · Provider setup needed/);
    assert.ok(!document.querySelector('summary').textContent.includes('stale'));
    assert.equal(document.querySelector('details').open, false, 'coverage notices start collapsed');
    const buttons = [...document.querySelectorAll('details button')];
    act(() => buttons.forEach((b) => b.click()));
    assert.deepEqual(actions, [
      ['track', 'bsc'],
      ['retry', 'eth']
    ]);
    act(() => root.render(React.createElement(DataNotices, { ...props, loading: true, saving: true, staleBalances: true })));
    assert.match(document.querySelector('summary').textContent, /stale or unavailable/);
    assert.equal(document.querySelector('details').open, true, 'failed balance reads remain prominent');
    assert.ok([...document.querySelectorAll('details button')].every((b) => b.disabled));
  } finally {
    act(() => root.unmount());
  }
});

function mount(props = {}) {
  let closed = 0;
  document.querySelector('#opener').focus();
  const root = createRoot(document.querySelector('#root'));
  act(() =>
    root.render(
      React.createElement(
        Modal,
        { title: 'Welcome back.', onClose: () => closed++, ...props },
        React.createElement('textarea', { 'aria-label': 'Kinko Access Key' })
      )
    )
  );
  const dialog = document.querySelector('dialog');
  dialog.getBoundingClientRect = () => ({ left: 100, top: 100, right: 500, bottom: 500 });
  const dispatch = (type, target = dialog, x = 10, y = 10) =>
    act(() =>
      target.dispatchEvent(
        new dom.window.MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 0
        })
      )
    );
  return { dialog, dispatch, closed: () => closed, cleanup: () => act(() => root.unmount()) };
}

test('a lone extension-style click does not dismiss a dialog', () => {
  const view = mount();
  try {
    view.dialog.click();
    view.dispatch('click');
    assert.equal(view.closed(), 0);
    assert.equal(view.dialog.open, true);
  } finally {
    view.cleanup();
  }
});

test('ordinary dialogs still close after a deliberate outside press and click', () => {
  const view = mount();
  try {
    view.dispatch('pointerdown');
    view.dispatch('click');
    assert.equal(view.closed(), 1);
    view.dispatch('click');
    assert.equal(view.closed(), 1, 'the gesture is consumed');
  } finally {
    view.cleanup();
  }
});

test('inside clicks, drags from inside, and cancelled gestures do not dismiss', () => {
  const view = mount();
  try {
    view.dispatch('pointerdown', view.dialog, 150, 150);
    view.dispatch('click', view.dialog, 150, 150);
    view.dispatch('pointerdown', view.dialog.querySelector('textarea'), 150, 150);
    view.dispatch('click');
    view.dispatch('pointerdown');
    view.dispatch('pointercancel');
    view.dispatch('click');
    assert.equal(view.closed(), 0);
  } finally {
    view.cleanup();
  }
});

test('the access-dialog option keeps the form open even for outside gestures', () => {
  const view = mount({ dismissOnBackdrop: false });
  try {
    view.dispatch('pointerdown');
    view.dispatch('click');
    view.dialog.click();
    assert.equal(view.closed(), 0);
    view.dispatch('click', view.dialog.querySelector('textarea'), 150, 150);
    assert.equal(view.closed(), 0);
  } finally {
    view.cleanup();
  }
});

test('explicit close and Escape cancellation still work for the access dialog', () => {
  const view = mount({ dismissOnBackdrop: false });
  try {
    const close = view.dialog.querySelector('button');
    assert.equal(close.type, 'button');
    view.dispatch('click', close, 450, 120);
    assert.equal(view.closed(), 1);
    const cancel = new dom.window.Event('cancel', { cancelable: true });
    act(() => view.dialog.dispatchEvent(cancel));
    assert.equal(cancel.defaultPrevented, true);
    assert.equal(view.closed(), 2);
  } finally {
    view.cleanup();
  }
  assert.equal(document.activeElement.id, 'opener');
});

test('returning-user access stays in document flow and leaves external security UI reachable', () => {
  const opener = document.querySelector('#opener');
  opener.focus();
  const root = createRoot(document.querySelector('#root'));
  const securityPrompt = document.createElement('button');
  securityPrompt.textContent = 'Extension security prompt';
  let acknowledged = false;
  securityPrompt.onclick = () => {
    acknowledged = true;
  };
  document.body.append(securityPrompt);
  let back = 0;
  act(() =>
    root.render(
      React.createElement(
        AccessPage,
        {
          title: 'Welcome back.',
          subtitle: 'Your Access Key brings your watchlist back.',
          onClose: () => back++
        },
        React.createElement('textarea', { 'aria-label': 'Kinko Access Key' })
      )
    )
  );
  try {
    assert.equal(document.querySelector('dialog'), null);
    assert.equal(document.querySelector('[aria-modal="true"], [inert]'), null);
    assert.equal(document.activeElement, document.querySelector('h1'));
    assert.equal(document.querySelector('main').getAttribute('aria-labelledby'), 'access-title');
    securityPrompt.focus();
    securityPrompt.click();
    assert.equal(document.activeElement, securityPrompt);
    assert.equal(acknowledged, true);
    assert.equal(back, 0, 'external interactions must not leave sign-in');
    assert.ok(document.querySelector('textarea'));
    act(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Back to Kinko')).click());
    assert.equal(back, 1);
  } finally {
    act(() => root.unmount());
    securityPrompt.remove();
  }
  assert.equal(document.activeElement, opener);
});

test('dense history uses real time spacing, visible gaps, and keyboard/tap inspection without connecting coverage', () => {
  const root = createRoot(document.querySelector('#root'));
  const first = { scope: 'all:all', time: Date.now() - 3 * 3600000, value: 100, coverage: 'a', partial: false };
  const observations = Array.from({ length: 31 }, (_, i) => ({ ...first, time: first.time + i * 120000, value: 100 + i }));
  observations.push(...Array.from({ length: 31 }, (_, i) => ({ ...first, time: first.time + 2 * 3600000 + i * 120000, value: 80 + i, coverage: 'b', partial: true })));
  try {
    const props = { observations, money: (v) => `USD ${v.toFixed(2)}`, coverageChanged: true };
    act(() => root.render(React.createElement(PortfolioReadings, { ...props, loading: true })));
    const segments = [...document.querySelectorAll('[data-history-segment]')];
    assert.equal(segments.length, 2);
    assert.ok(document.querySelector('[data-history-gap]'));
    assert.match(document.querySelector('.portfolio-axis-y').textContent, /USD/);
    assert.match(document.querySelector('.portfolio-plot').textContent, /No readings recorded/);
    assert.equal(segments[1].getAttribute('stroke-dasharray'), null);
    const xs = segments[0].getAttribute('points').split(' ').map((p) => Number(p.split(',')[0]));
    assert.ok(xs[1] - xs[0] < 10, 'two minutes occupies the correct fraction of a three-hour range');
    assert.match(document.querySelector('.history-status').textContent, /Updating/);
    const slider = document.querySelector('[role="slider"]');
    act(() => slider.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'Home' })));
    assert.equal(slider.getAttribute('aria-valuenow'), '0');
    assert.match(document.querySelector('.history-inspection').textContent, /USD 100.00.*Complete coverage/);
    act(() => slider.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' })));
    assert.equal(slider.getAttribute('aria-valuenow'), '1');
    slider.getBoundingClientRect = () => ({ left: 0, width: 700 });
    act(() => slider.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, clientX: 692 })));
    assert.equal(slider.getAttribute('aria-valuenow'), String(observations.length - 1));
    assert.match(document.querySelector('.history-inspection').textContent, /USD 110.00.*Partial coverage/);
    assert.equal(document.querySelector('.history-saved-readings').open, false);
    act(() => document.querySelector('.history-saved-readings summary').click());
    assert.equal(document.querySelector('.history-saved-readings').open, true);
    act(() => root.render(React.createElement(PortfolioReadings, { ...props, unavailable: true, money: () => '••••' })));
    assert.equal(document.querySelectorAll('[data-history-segment]').length, 2);
    assert.match(document.querySelector('.history-footer').textContent, /Saved history retained/);
    assert.ok(!document.querySelector('.portfolio-axis-y').textContent.includes('USD'));
    assert.ok(!slider.getAttribute('aria-valuetext').includes('USD'));
  } finally { act(() => root.unmount()); }
});

test('sparse history stays visible with separated readings and opt-in information', () => {
  const root = createRoot(document.querySelector('#root'));
  const first = { scope: 'all:all', time: Date.now() - 30 * 3600000, value: 7061.29, coverage: 'a', partial: true };
  const observations = Array.from({ length: 20 }, (_, i) => ({ ...first, time: first.time + i * 120000 }));
  observations.push({ ...first, time: Date.now(), value: 8061.01, coverage: 'b' });
  try {
    act(() => root.render(React.createElement(PortfolioReadings, { observations, money: String, coverageChanged: true })));
    assert.ok(document.querySelector('.history-chart'));
    assert.equal(document.querySelectorAll('[data-history-segment]').length, 2);
    assert.match(document.querySelector('.chart-amount').textContent, /8061.01/);
    assert.equal(document.querySelectorAll('tbody tr').length, 21);
    assert.equal(document.querySelector('.history-saved-readings').open, false);
    assert.match(document.querySelector('.history-interval').textContent, /unavailable/);
    act(() => document.querySelector('.history-info > summary').click());
    assert.equal(document.querySelector('.history-info').open, true);
    assert.match(document.querySelector('.history-info-popover').textContent, /No age-based deletion/);
  } finally { act(() => root.unmount()); }
});

test('the first actual portfolio reading shows its value, timestamp and table row immediately', () => {
  const root = createRoot(document.querySelector('#root'));
  const first = { scope: 'all:all', time: Date.now(), value: 7090.72, coverage: 'first', partial: true };
  try {
    act(() => root.render(React.createElement(PortfolioReadings, { observations: [first], money: (v) => `USD ${v.toFixed(2)}` })));
    assert.match(document.querySelector('.chart-amount').textContent, /USD 7090.72/);
    assert.equal(document.querySelectorAll('tbody tr').length, 1);
    assert.match(document.querySelector('tbody').textContent, /7090.72.*Partial/);
    assert.ok(document.querySelector('.history-chart'));
    assert.equal(document.querySelectorAll('.history-chart circle').length, 1, 'a second point is not fabricated');
    act(() =>
      root.render(
        React.createElement(PortfolioReadings, {
          observations: [first, { ...first, time: first.time + 61000, value: 7100 }],
          money: (v) => `USD ${v.toFixed(2)}`
        })
      )
    );
    assert.equal(document.querySelectorAll('tbody tr').length, 2);
    assert.ok(document.querySelector('.history-chart'));
    act(() =>
      root.render(
        React.createElement(PortfolioReadings, {
          observations: [first],
          money: () => '••••',
          historyError: 'Browser storage is unavailable.'
        })
      )
    );
    assert.ok(!document.querySelector('#root').textContent.includes('7090.72'));
    assert.match(document.querySelector('.history-info-popover').textContent, /storage is unavailable/);
  } finally {
    act(() => root.unmount());
  }
});
