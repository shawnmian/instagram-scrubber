const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
require('../extension/media.js');
const { VideoController } = require('../extension/controller.js');

function makeVideo({ paused = false, playReject = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="outside"></div><video></video></body></html>', { pretendToBeVisual: true });
  const video = dom.window.document.querySelector('video');
  Object.defineProperties(video, {
    duration: { configurable: true, writable: true, value: 38 },
    currentTime: { configurable: true, writable: true, value: 12 },
    paused: { configurable: true, writable: true, value: paused },
    seekable: { configurable: true, value: { length: 0 } },
  });
  video.playCalls = 0;
  video.pauseCalls = 0;
  video.play = function () { this.playCalls++; this.paused = false; return playReject ? Promise.reject(new Error('blocked')) : Promise.resolve(); };
  video.pause = function () { this.pauseCalls++; this.paused = true; };
  return { dom, video };
}
function pointer(win, type, props = {}) {
  const event = new win.Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({ pointerId: 1, isPrimary: true, button: 0, ...props })) Object.defineProperty(event, key, { value });
  return event;
}

test('keyboard seeking is scoped to the timeline and supports Shift steps', () => {
  const { dom, video } = makeVideo();
  const controller = new VideoController(video);
  const input = controller.input;
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(video.currentTime, 17);
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
  assert.equal(video.currentTime, 18);
  const comment = dom.window.document.createElement('input');
  dom.window.document.body.append(comment);
  comment.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(video.currentTime, 18);
  controller.destroy(); dom.window.close();
});
test('drag pauses and restores playing state after release outside control', async () => {
  const { dom, video } = makeVideo();
  const controller = new VideoController(video);
  controller.updateLayout({ left: 0, top: 0, width: 300, height: 200 });
  controller.input.value = '24';
  controller.input.dispatchEvent(pointer(dom.window, 'pointerdown'));
  controller.input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(video.currentTime, 24);
  assert.equal(video.paused, true);
  dom.window.document.dispatchEvent(pointer(dom.window, 'pointerup'));
  await Promise.resolve();
  assert.equal(video.playCalls, 1);
  assert.equal(video.paused, false);
  controller.destroy(); dom.window.close();
});
test('paused drag remains paused and cancellation clears drag without resuming', async () => {
  const { dom, video } = makeVideo({ paused: true });
  const controller = new VideoController(video);
  controller.input.dispatchEvent(pointer(dom.window, 'pointerdown'));
  dom.window.document.dispatchEvent(pointer(dom.window, 'pointercancel'));
  await Promise.resolve();
  assert.equal(video.playCalls, 0);
  assert.equal(controller.drag, null);
  controller.destroy(); dom.window.close();
});
test('source reset or destroy during drag prevents resume', async () => {
  const { dom, video } = makeVideo();
  const controller = new VideoController(video);
  controller.updateLayout({ left: 0, top: 0, width: 300, height: 200 });
  controller.input.dispatchEvent(pointer(dom.window, 'pointerdown'));
  assert.equal(controller.host.hidden, false);
  assert.ok(controller.drag);
  video.src = 'https://example.invalid/next.mp4';
  video.dispatchEvent(new dom.window.Event('loadstart'));
  assert.equal(controller.drag, null);
  dom.window.document.dispatchEvent(pointer(dom.window, 'pointerup'));
  await Promise.resolve();
  assert.equal(video.playCalls, 0);
  controller.input.dispatchEvent(pointer(dom.window, 'pointerdown'));
  controller.destroy();
  dom.window.document.dispatchEvent(pointer(dom.window, 'pointerup'));
  await Promise.resolve();
  assert.equal(video.playCalls, 0);
  dom.window.close();
});
test('rejected play promise is handled and layout hides on small bounds', async () => {
  const { dom, video } = makeVideo({ playReject: true });
  const controller = new VideoController(video);
  controller.updateLayout({ left: 0, top: 0, width: 80, height: 80 });
  assert.equal(controller.host.hidden, true);
  controller.updateLayout({ left: 0, top: 0, width: 300, height: 200 });
  controller.input.dispatchEvent(pointer(dom.window, 'pointerdown'));
  dom.window.document.dispatchEvent(pointer(dom.window, 'pointerup'));
  await new Promise((resolve) => setImmediate(resolve));
  controller.destroy(); dom.window.close();
});

test('release on the slider finishes the drag and resumes once', async () => {
  const { dom, video } = makeVideo();
  const controller = new VideoController(video);
  controller.updateLayout({ left: 0, top: 0, width: 300, height: 200 });
  controller.input.dispatchEvent(pointer(dom.window, 'pointerdown'));
  controller.input.dispatchEvent(pointer(dom.window, 'pointerup'));
  await Promise.resolve();
  assert.equal(video.playCalls, 1);
  assert.equal(controller.drag, null);
  controller.destroy(); dom.window.close();
});
test('infinite duration hides the overlay', () => {
  const { dom, video } = makeVideo();
  const controller = new VideoController(video);
  controller.updateLayout({ left: 0, top: 0, width: 300, height: 200 });
  video.duration = Infinity;
  controller.refresh();
  assert.equal(controller.host.hidden, true);
  controller.destroy(); dom.window.close();
});

test('destroy is idempotent, removes the host, and clears drag state', () => {
  const { dom, video } = makeVideo();
  const controller = new VideoController(video);
  controller.input.dispatchEvent(pointer(dom.window, 'pointerdown'));
  const host = controller.host;
  controller.destroy(); controller.destroy();
  assert.equal(host.isConnected, false);
  assert.equal(controller.drag, null);
  dom.window.close();
});

test('secondary pointer release and cancel do not finish the primary drag', async () => {
  const { dom, video } = makeVideo();
  const controller = new VideoController(video);
  controller.updateLayout({ left: 0, top: 0, width: 300, height: 200 });
  controller.input.dispatchEvent(pointer(dom.window, 'pointerdown', { pointerId: 1 }));
  controller.input.dispatchEvent(pointer(dom.window, 'pointerup', { pointerId: 2 }));
  controller.input.dispatchEvent(pointer(dom.window, 'pointercancel', { pointerId: 2 }));
  assert.ok(controller.drag);
  assert.equal(video.playCalls, 0);
  controller.input.dispatchEvent(pointer(dom.window, 'pointercancel', { pointerId: 1 }));
  await Promise.resolve();
  assert.equal(controller.drag, null);
  assert.equal(video.playCalls, 0);
  controller.destroy(); dom.window.close();
});
test('paused video stays paused after a normal pointer release', async () => {
  const { dom, video } = makeVideo({ paused: true });
  const controller = new VideoController(video);
  controller.updateLayout({ left: 0, top: 0, width: 300, height: 200 });
  controller.input.dispatchEvent(pointer(dom.window, 'pointerdown'));
  controller.input.dispatchEvent(pointer(dom.window, 'pointerup'));
  await Promise.resolve();
  assert.equal(video.playCalls, 0);
  assert.equal(video.paused, true);
  controller.destroy(); dom.window.close();
});
test('blur and pointer cancellation never resume a playing drag', async () => {
  const { dom, video } = makeVideo();
  const controller = new VideoController(video);
  controller.updateLayout({ left: 0, top: 0, width: 300, height: 200 });
  controller.input.dispatchEvent(pointer(dom.window, 'pointerdown'));
  dom.window.document.dispatchEvent(pointer(dom.window, 'pointercancel'));
  assert.equal(controller.drag, null);
  assert.equal(video.playCalls, 0);
  video.paused = false;
  controller.input.dispatchEvent(pointer(dom.window, 'pointerdown'));
  dom.window.dispatchEvent(new dom.window.Event('blur'));
  await Promise.resolve();
  assert.equal(controller.drag, null);
  assert.equal(video.playCalls, 0);
  controller.destroy(); dom.window.close();
});
test('finite duration restores a previously hidden controller without a layout event', () => {
  const { dom, video } = makeVideo();
  const controller = new VideoController(video);
  controller.updateLayout({ left: 0, top: 0, width: 300, height: 200 });
  video.duration = Infinity;
  video.dispatchEvent(new dom.window.Event('durationchange'));
  assert.equal(controller.host.hidden, true);
  video.duration = 38;
  video.dispatchEvent(new dom.window.Event('durationchange'));
  assert.equal(controller.host.hidden, false);
  controller.destroy(); dom.window.close();
});
