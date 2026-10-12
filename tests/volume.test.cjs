const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
require('../extension/media.js');
const { VideoController } = require('../extension/controller.js');

function setup({ volume = 0.5, muted = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><video></video></body></html>', { pretendToBeVisual: true });
  const video = dom.window.document.querySelector('video');
  Object.defineProperties(video, {
    duration: { configurable: true, writable: true, value: 38 },
    currentTime: { configurable: true, writable: true, value: 12 },
    paused: { configurable: true, writable: true, value: true },
    ended: { configurable: true, writable: true, value: false },
    volume: { configurable: true, writable: true, value: volume },
    muted: { configurable: true, writable: true, value: muted },
    seekable: { configurable: true, value: { length: 0 } },
  });
  video.playCalls = 0; video.pauseCalls = 0;
  video.play = () => { video.playCalls++; video.paused = false; return Promise.resolve(); };
  video.pause = () => { video.pauseCalls++; video.paused = true; };
  const controller = new VideoController(video);
  controller.updateLayout({ left: 100, top: 100, width: 400, height: 300 });
  return { dom, video, controller };
}
function key(win, target, value) {
  const event = new win.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

test('controller preserves native initial volume and mute state on attach', () => {
  const { dom, video, controller } = setup({ volume: 0.27, muted: true });
  assert.equal(video.volume, 0.27);
  assert.equal(video.muted, true);
  assert.equal(controller.volumeInput.value, '0.27');
  assert.equal(controller.muteButton.getAttribute('aria-pressed'), 'true');
  assert.equal(controller.muteButton.getAttribute('aria-label'), 'Unmute video');
  controller.destroy(); dom.window.close();
});

test('volume slider changes volume, mute click toggles, and unmute from zero restores last positive volume', () => {
  const { dom, video, controller } = setup({ volume: 0.4 });
  const time = video.currentTime;
  controller.volumeInput.value = '0.8';
  controller.volumeInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(video.volume, 0.8);
  assert.equal(video.muted, false);
  controller.muteButton.click();
  assert.equal(video.muted, true);
  assert.equal(video.volume, 0.8);
  assert.equal(controller.volumeInput.value, '0.8');
  controller.muteButton.click();
  assert.equal(video.muted, false);
  controller.volumeInput.value = '0';
  controller.volumeInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(video.volume, 0);
  assert.equal(video.muted, true);
  controller.muteButton.click();
  assert.equal(video.volume, 0.8);
  assert.equal(video.muted, false);
  assert.equal(video.currentTime, time);
  assert.equal(video.playCalls, 0);
  assert.equal(video.pauseCalls, 0);
  controller.destroy(); dom.window.close();
});

test('external volumechange updates percentage and muted icon state', () => {
  const { dom, video, controller } = setup({ volume: 0.5, muted: false });
  video.volume = 0.33; video.muted = true;
  video.dispatchEvent(new dom.window.Event('volumechange'));
  assert.equal(controller.volumeInput.value, '0.33');
  assert.equal(controller.volumeInput.getAttribute('aria-valuetext'), '33 percent');
  assert.equal(controller.muteButton.getAttribute('aria-pressed'), 'true');
  video.volume = 0.9; video.muted = false;
  video.dispatchEvent(new dom.window.Event('volumechange'));
  assert.equal(controller.volumeInput.value, '0.9');
  assert.equal(controller.muteButton.getAttribute('aria-pressed'), 'false');
  controller.destroy(); dom.window.close();
});

test('vertical range exposes orientation and handles arrow and boundary keys', () => {
  const { dom, controller } = setup({ volume: 0.98 });
  assert.equal(controller.volumeInput.getAttribute('aria-orientation'), 'vertical');
  assert.match(controller.shadow.querySelector('style').textContent, /writing-mode:\s*vertical-lr/);
  assert.match(controller.shadow.querySelector('style').textContent, /direction:\s*rtl/);
  key(dom.window, controller.volumeInput, 'ArrowUp');
  assert.equal(controller.volumeInput.value, '1');
  controller.volumeInput.value = '0.02';
  key(dom.window, controller.volumeInput, 'ArrowDown');
  assert.equal(controller.volumeInput.value, '0');
  key(dom.window, controller.volumeInput, 'Home');
  assert.equal(controller.volumeInput.value, '0');
  key(dom.window, controller.volumeInput, 'End');
  assert.equal(controller.volumeInput.value, '1');
  assert.equal(controller.volumeInput.getAttribute('aria-valuetext'), '100 percent');
  controller.destroy(); dom.window.close();
});

test('volume keyboard events stay inside the scrubber and destroy removes listeners', () => {
  const { dom, controller } = setup();
  let documentKeydowns = 0;
  dom.window.document.addEventListener('keydown', () => documentKeydowns++);
  const listenerCount = controller.listeners.length;
  assert.ok(listenerCount > 0);
  key(dom.window, controller.volumeInput, 'ArrowUp');
  assert.equal(documentKeydowns, 0);
  controller.destroy();
  assert.equal(controller.listeners.length, 0);
  assert.equal(controller.host.isConnected, false);
  dom.window.close();
});
