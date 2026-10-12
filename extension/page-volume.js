(function (root) {
  'use strict';
  // Runs in the page's own JavaScript world before Instagram loads. Instagram's
  // player writes its stored volume back to the video; once the user picks a
  // volume in the scrubber, page writes use that volume instead. The scrubber
  // runs in the isolated extension world, so its own writes skip this setter.
  const ATTRIBUTE = 'data-instagram-scrubber-volume';
  const proto = root.HTMLMediaElement && root.HTMLMediaElement.prototype;
  if (!proto || root.__instagramScrubberVolumeGuard__) return;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'volume');
  if (!descriptor || typeof descriptor.set !== 'function') return;
  Object.defineProperty(root, '__instagramScrubberVolumeGuard__', { value: true });
  Object.defineProperty(proto, 'volume', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set(value) {
      const chosen = root.document.documentElement.getAttribute(ATTRIBUTE);
      const volume = chosen === null ? NaN : Number(chosen);
      descriptor.set.call(this, Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : value);
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
