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
