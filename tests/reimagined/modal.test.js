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
let Modal;
before(async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    ({ Modal } = await server.ssrLoadModule('/src/reimagined/ui.jsx'));
  } finally {
    await server.close();
  }
});
after(() => dom.window.close());

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
