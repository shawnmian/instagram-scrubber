const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
require('../extension/media.js');
const { VideoController } = require('../extension/controller.js');

const MUTED = 'Audio is muted';
const PLAYING = 'Audio is playing';

// Mimics Instagram's player: a sound button backed by its own stored state,
// which it writes back to the video whenever playback starts.
function setup({ html } = {}) {
  const dom = new JSDOM(html || `<!doctype html><html><body>
    <div class="post"><div><video></video></div>
      <div role="button" class="native"><svg aria-label="${MUTED}"></svg></div></div>
  </body></html>`, { pretendToBeVisual: true });
  const document = dom.window.document;
  const video = document.querySelector('video');
  const store = { muted: true, volume: 0.5, nativeClicks: 0 };
  Object.defineProperties(video, {
    duration: { configurable: true, writable: true, value: 38 },
    currentTime: { configurable: true, writable: true, value: 12 },
    paused: { configurable: true, writable: true, value: true },
    ended: { configurable: true, writable: true, value: false },
    volume: { configurable: true, writable: true, value: store.volume },
    muted: { configurable: true, writable: true, value: store.muted },
    seekable: { configurable: true, value: { length: 0 } },
  });
  const native = document.querySelector('.native');
  native.addEventListener('click', () => {
    store.nativeClicks++;
    store.muted = !store.muted;
    video.muted = store.muted;
    native.querySelector('svg').setAttribute('aria-label', store.muted ? MUTED : PLAYING);
  });
  video.play = () => { video.paused = false; video.muted = store.muted; video.volume = store.volume; return Promise.resolve(); };
  video.pause = () => { video.paused = true; };
  const controller = new VideoController(video);
  controller.updateLayout({ left: 100, top: 100, width: 400, height: 300 });
  return { dom, document, video, native, store, controller };
}

test('unmuting through our button updates Instagram state so playback does not re-mute', async () => {
  const { dom, video, native, store, controller } = setup();
  controller.muteButton.click();
  assert.equal(store.nativeClicks, 1);
  assert.equal(store.muted, false);
  assert.equal(native.querySelector('svg').getAttribute('aria-label'), PLAYING);
  assert.equal(video.muted, false);
  await video.play();
  assert.equal(video.muted, false);
  controller.muteButton.click();
  assert.equal(store.muted, true);
  assert.equal(video.muted, true);
  controller.destroy(); dom.window.close();
});

test('raising volume from muted unmutes Instagram, and volume zero mutes it', () => {
  const { dom, video, store, controller } = setup();
  controller.volumeInput.value = '0.8';
  controller.volumeInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(video.volume, 0.8);
  assert.equal(store.muted, false);
  controller.volumeInput.value = '0.6';
  controller.volumeInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(store.nativeClicks, 1, 'native button is clicked only when its state differs');
  controller.volumeInput.value = '0';
  controller.volumeInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(store.muted, true);
  controller.destroy(); dom.window.close();
});

test('chosen volume is published for the page-world volume guard', () => {
  const { dom, document, controller } = setup();
  controller.volumeInput.value = '0.3';
  controller.volumeInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(document.documentElement.getAttribute('data-instagram-scrubber-volume'), '0.3');
  controller.destroy(); dom.window.close();
});

test('Instagram sound button hides only while our controls show, and is restored', () => {
  const { dom, native, controller } = setup();
  assert.notEqual(native.style.visibility, 'hidden');
  controller.setPointerHover(true);
  assert.equal(native.style.visibility, 'hidden');
  controller.setPointerHover(false);
  assert.notEqual(native.style.visibility, 'hidden');
  controller.setPointerHover(true);
  controller.destroy();
  assert.notEqual(native.style.visibility, 'hidden');
  dom.window.close();
});

test('another post\'s sound button is never used', () => {
  const { dom, video, store, controller } = setup({ html: `<!doctype html><html><body><div class="feed">
    <div class="a"><video></video></div>
    <div class="b"><video></video><div role="button" class="native"><svg aria-label="${MUTED}"></svg></div></div>
  </div></body></html>` });
  controller.muteButton.click();
  assert.equal(store.nativeClicks, 0);
  assert.equal(video.muted, false, 'falls back to unmuting the video directly');
  controller.destroy(); dom.window.close();
});

test('page-world guard replaces page volume writes with the chosen volume', () => {
  const dom = new JSDOM('<!doctype html><html><body><video></video></body></html>', { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync(path.join(__dirname, '../extension/page-volume.js'), 'utf8'));
  const video = dom.window.document.querySelector('video');
  video.volume = 0.5;
  assert.equal(video.volume, 0.5, 'writes pass through before a volume is chosen');
  dom.window.document.documentElement.setAttribute('data-instagram-scrubber-volume', '0.2');
  video.volume = 0.5;
  assert.equal(video.volume, 0.2);
  dom.window.eval(fs.readFileSync(path.join(__dirname, '../extension/page-volume.js'), 'utf8'));
  video.volume = 0.9;
  assert.equal(video.volume, 0.2, 'loading twice keeps one guard');
  dom.window.close();
});
