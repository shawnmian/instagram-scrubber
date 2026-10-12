const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
require('../extension/media.js');
require('../extension/controller.js');
const { initialize, visibleBounds } = require('../extension/content.js');

function setup(html = '<video></video>') {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { pretendToBeVisual: true, url: 'https://www.instagram.com/' });
  Object.defineProperty(dom.window, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(dom.window, 'innerHeight', { value: 800, configurable: true });
  for (const video of dom.window.document.querySelectorAll('video')) configure(video);
  return dom;
}
function configure(video) {
  Object.defineProperties(video, {
    duration: { configurable: true, writable: true, value: 20 },
    currentTime: { configurable: true, writable: true, value: 2 },
    paused: { configurable: true, writable: true, value: true },
    seekable: { configurable: true, value: { length: 0 } },
  });
  video.play = () => Promise.resolve(); video.pause = () => {};
  video.getBoundingClientRect = () => ({ left: 100, top: 100, right: 500, bottom: 400, width: 400, height: 300 });
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 45));

test('initial and late videos get one controller, and initialization is idempotent', async () => {
  const dom = setup('<video id="first"></video>');
  const manager = initialize(dom.window.document);
  assert.equal(initialize(dom.window.document), manager);
  assert.equal(manager.controllers.size, 1);
  const late = dom.window.document.createElement('video'); configure(late); dom.window.document.body.append(late);
  await tick();
  assert.equal(manager.controllers.size, 2);
  assert.equal([...manager.controllers.values()].filter(Boolean).length, 2);
  manager.destroy(); dom.window.close();
});
test('removing a subtree destroys controllers and reinsertion creates one fresh controller', async () => {
  const dom = setup('<div id="wrap"><video></video><div><video></video></div></div>');
  const manager = initialize(dom.window.document);
  const old = manager.controllers.get(dom.window.document.querySelector('video'));
  await tick();
  const wrap = dom.window.document.querySelector('#wrap'); wrap.remove(); await tick();
  assert.equal(manager.controllers.size, 0);
  assert.equal(old.host.isConnected, false);
  dom.window.document.body.append(wrap); await tick();
  assert.equal(manager.controllers.size, 2);
  manager.destroy(); dom.window.close();
});
test('extension root mutations do not trigger discovery scans', async () => {
  const dom = setup('<video></video>');
  const manager = initialize(dom.window.document);
  const before = manager.metrics.scans;
  const added = dom.window.document.createElement('div'); manager.root.append(added);
  await tick();
  assert.equal(manager.metrics.scans, before);
  manager.destroy(); dom.window.close();
});
test('clipped and hidden videos hide the timeline', async () => {
  const dom = setup('<div id="clip" style="overflow:hidden"><video></video></div><video id="hidden" style="display:none"></video>');
  const clip = dom.window.document.querySelector('#clip');
  clip.getBoundingClientRect = () => ({ left: 10, top: 10, right: 70, bottom: 70, width: 60, height: 60 });
  const videos = dom.window.document.querySelectorAll('video'); configure(videos[0]); configure(videos[1]);
  const manager = initialize(dom.window.document); await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(manager.controllers.get(videos[0]).host.hidden, true);
  assert.equal(manager.controllers.get(videos[1]).host.hidden, true);
  assert.equal(visibleBounds(videos[1], dom.window.document), null);
  manager.destroy(); dom.window.close();
});
test('pagehide tears down the manager and pageshow restores it', async () => {
  const dom = setup('<video></video>');
  const first = initialize(dom.window.document);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  assert.equal(first.controllers.size, 0);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  const next = dom.window.document.__instagramScrubberPageState__.manager;
  assert.ok(next);
  assert.notEqual(next, first);
  assert.equal(next.controllers.size, 1);
  next.destroy(); dom.window.close();
});

test('opening and closing an aria-modal dialog updates background timelines', async () => {
  const dom = setup('<style>#modal{display:none} #modal.open{display:block}</style><video id="background"></video><div id="modal" role="dialog" aria-modal="true"></div>');
  const modal = dom.window.document.querySelector('#modal');
  modal.getBoundingClientRect = () => ({ left: 850, top: 700, right: 950, bottom: 780, width: 100, height: 80 });
  const video = dom.window.document.querySelector('video');
  const manager = initialize(dom.window.document);
  await tick();
  const host = manager.controllers.get(video).host;
  assert.equal(host.hidden, false);
  modal.classList.toggle('open');
  await tick();
  assert.equal(host.hidden, true);
  modal.classList.toggle('open');
  await tick();
  assert.equal(host.hidden, false);
  manager.destroy(); dom.window.close();
});
test('ancestor hidden changes hide and restore a rendered timeline', async () => {
  const dom = setup('<div id="ancestor"><video></video></div>');
  const ancestor = dom.window.document.querySelector('#ancestor');
  const video = dom.window.document.querySelector('video');
  const manager = initialize(dom.window.document);
  await tick();
  const host = manager.controllers.get(video).host;
  assert.equal(host.hidden, false);
  ancestor.hidden = true;
  await tick();
  assert.equal(host.hidden, true);
  ancestor.hidden = false;
  await tick();
  assert.equal(host.hidden, false);
  manager.destroy(); dom.window.close();
});
test('visibility and fullscreen changes update an initially hidden page', async () => {
  const dom = setup('<video></video>');
  let hidden = true;
  Object.defineProperty(dom.window.document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(dom.window.document, 'fullscreenElement', { configurable: true, writable: true, value: null });
  const video = dom.window.document.querySelector('video');
  const manager = initialize(dom.window.document);
  await tick();
  const host = manager.controllers.get(video).host;
  assert.equal(host.hidden, true);
  hidden = false;
  dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
  await tick();
  assert.equal(host.hidden, false);
  dom.window.document.fullscreenElement = video;
  dom.window.document.dispatchEvent(new dom.window.Event('fullscreenchange'));
  await tick();
  assert.equal(host.hidden, true);
  dom.window.document.fullscreenElement = null;
  dom.window.document.dispatchEvent(new dom.window.Event('fullscreenchange'));
  await tick();
  assert.equal(host.hidden, false);
  manager.destroy(); dom.window.close();
});

test('zero-sized aria-modal dialog does not hide background timelines', async () => {
  const dom = setup('<video id="background"></video><div id="modal" role="dialog" aria-modal="true"></div>');
  const modal = dom.window.document.querySelector('#modal');
  modal.getBoundingClientRect = () => ({ left: 400, top: 300, right: 400, bottom: 300, width: 0, height: 0 });
  const manager = initialize(dom.window.document);
  await tick();
  assert.equal(manager.controllers.get(dom.window.document.querySelector('video')).host.hidden, false);
  manager.destroy(); dom.window.close();
});

function pointer(win, type, target, x, y, id = 1) {
  const event = new win.Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.assign(event, { clientX: x, clientY: y, pointerId: id, isPrimary: true, button: 0 });
  target.dispatchEvent(event);
  return event;
}

test('hover over a video through an Instagram overlay reveals controls; leaving hides them', async () => {
  const dom = setup('<video></video><div id="overlay"></div>');
  const manager = initialize(dom.window.document);
  await tick();
  const controller = manager.controllers.get(dom.window.document.querySelector('video'));
  const overlay = dom.window.document.querySelector('#overlay');
  assert.equal(controller.host.hidden, false);
  assert.equal(controller.bar.classList.contains('is-visible'), false);
  assert.equal(controller.input.tabIndex, 0);
  pointer(dom.window, 'pointermove', overlay, 300, 250);
  assert.equal(controller.bar.classList.contains('is-visible'), true);
  pointer(dom.window, 'pointermove', overlay, 700, 600);
  assert.equal(controller.bar.classList.contains('is-visible'), false);
  manager.destroy(); dom.window.close();
});

test('keyboard focus reveals controls, mouse focus does not pin them, and later keyboard input reveals them', async () => {
  const dom = setup('<video></video><button id="outside">Outside</button>');
  const manager = initialize(dom.window.document);
  await tick();
  const controller = manager.controllers.get(dom.window.document.querySelector('video'));
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  controller.muteButton.focus();
  await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(controller.bar.classList.contains('is-visible'), true);
  dom.window.document.querySelector('#outside').focus();
  await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(controller.bar.classList.contains('is-visible'), false);

  pointer(dom.window, 'pointerdown', dom.window.document.body, 900, 700);
  pointer(dom.window, 'pointerdown', controller.muteButton, 470, 350);
  controller.muteButton.focus();
  await new Promise((resolve) => setTimeout(resolve, 1));
  pointer(dom.window, 'pointermove', dom.window.document.body, 700, 600);
  assert.equal(controller.bar.classList.contains('is-visible'), false);

  pointer(dom.window, 'pointerdown', dom.window.document.body, 900, 700);
  controller.input.focus();
  await new Promise((resolve) => setTimeout(resolve, 1));
  pointer(dom.window, 'pointermove', dom.window.document.body, 700, 600);
  assert.equal(controller.bar.classList.contains('is-visible'), false);
  const key = new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
  controller.input.dispatchEvent(key);
  assert.equal(controller.bar.classList.contains('is-visible'), true);
  manager.destroy(); dom.window.close();
});

test('seek and volume drags keep controls visible outside the video until the matching pointer ends', async () => {
  const dom = setup('<video></video>');
  const manager = initialize(dom.window.document);
  await tick();
  const controller = manager.controllers.get(dom.window.document.querySelector('video'));
  pointer(dom.window, 'pointermove', dom.window.document.body, 300, 250);
  pointer(dom.window, 'pointerdown', controller.input, 300, 380);
  pointer(dom.window, 'pointermove', dom.window.document.body, 700, 600);
  assert.equal(controller.bar.classList.contains('is-visible'), true);
  pointer(dom.window, 'pointerup', dom.window.document.body, 700, 600, 2);
  assert.ok(controller.drag);
  pointer(dom.window, 'pointerup', dom.window.document.body, 700, 600, 1);
  assert.equal(controller.drag, null);
  assert.equal(controller.bar.classList.contains('is-visible'), false);

  pointer(dom.window, 'pointermove', dom.window.document.body, 300, 250);
  pointer(dom.window, 'pointerdown', controller.volumeInput, 480, 340);
  pointer(dom.window, 'pointermove', dom.window.document.body, 700, 600);
  assert.equal(controller.bar.classList.contains('is-visible'), true);
  pointer(dom.window, 'pointerup', dom.window.document.body, 700, 600, 1);
  assert.equal(controller.volumeDrag, null);
  assert.equal(controller.bar.classList.contains('is-visible'), false);
  manager.destroy(); dom.window.close();
});

test('layout refresh rechecks a stationary pointer against new clipped video bounds', async () => {
  const dom = setup('<video></video>');
  const video = dom.window.document.querySelector('video');
  let bounds = { left: 100, top: 100, right: 500, bottom: 400, width: 400, height: 300 };
  video.getBoundingClientRect = () => bounds;
  const manager = initialize(dom.window.document);
  await tick();
  const controller = manager.controllers.get(video);
  pointer(dom.window, 'pointermove', dom.window.document.body, 300, 250);
  assert.equal(controller.bar.classList.contains('is-visible'), true);
  bounds = { left: 550, top: 500, right: 950, bottom: 800, width: 400, height: 300 };
  dom.window.dispatchEvent(new dom.window.Event('scroll'));
  await tick();
  assert.equal(controller.layout.left, 550);
  assert.equal(controller.bar.classList.contains('is-visible'), false);
  manager.destroy(); dom.window.close();
});

test('window blur ends volume drag and clears stale hover; destroy removes pointer tracking', async () => {
  const dom = setup('<video></video>');
  const manager = initialize(dom.window.document);
  await tick();
  const controller = manager.controllers.get(dom.window.document.querySelector('video'));
  pointer(dom.window, 'pointermove', dom.window.document.body, 300, 250);
  pointer(dom.window, 'pointerdown', controller.volumeInput, 480, 340);
  pointer(dom.window, 'pointermove', dom.window.document.body, 700, 600);
  assert.equal(controller.bar.classList.contains('is-visible'), true);
  dom.window.dispatchEvent(new dom.window.Event('blur'));
  assert.equal(controller.volumeDrag, null);
  assert.equal(controller.bar.classList.contains('is-visible'), false);
  manager.destroy();
  const point = manager.lastPointer;
  pointer(dom.window, 'pointermove', dom.window.document.body, 300, 250);
  assert.equal(manager.lastPointer, point);
  dom.window.close();
});
