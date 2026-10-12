(function (root) {
  'use strict';
  const api = root.InstagramScrubber || (root.InstagramScrubber = {});
  const { formatTime, isValidDuration, clampSeek, keyboardTarget } = api;

  class VideoController {
    constructor(video, options = {}) {
      this.video = video;
      this.document = video.ownerDocument;
      this.options = options;
      this.drag = null;
      this.destroyed = false;
      this.layout = null;
      this.source = this.sourceIdentity();
      this.error = false;
      this.listeners = [];
      this.host = this.document.createElement('div');
      this.host.setAttribute('data-instagram-scrubber-host', '');
      this.host.style.cssText = 'position:fixed;z-index:2147483000;pointer-events:none;';
      this.host.hidden = true;
      const shadow = this.host.attachShadow({ mode: 'open' });
      const style = this.document.createElement('style');
      style.textContent = `
        :host { all: initial; }
        :host([hidden]) { display:none !important; }
        .bar { box-sizing:border-box; display:flex; align-items:center; gap:8px; width:100%; height:38px; padding:0 10px; border-radius:8px; color:#fff; background:rgba(20,18,22,.88); font:12px/1.2 system-ui,-apple-system,sans-serif; box-shadow:0 1px 8px rgba(0,0,0,.35); pointer-events:auto; }
        .bar:hover, .bar:focus-within { background:rgba(12,10,14,.96); }
        input { flex:1; min-width:0; height:24px; margin:0; accent-color:#ff4f91; cursor:pointer; }
        input:focus-visible { outline:2px solid #fff; outline-offset:2px; border-radius:3px; }
        input::-webkit-slider-thumb { width:16px; height:16px; }
        input::-moz-range-thumb { width:16px; height:16px; }
        input:disabled { cursor:default; opacity:.58; }
        output { flex:none; min-width:70px; text-align:right; font:12px ui-monospace,SFMono-Regular,Menlo,monospace; white-space:nowrap; }
      `;
      this.bar = this.document.createElement('div');
      this.bar.className = 'bar';
      this.input = this.document.createElement('input');
      this.input.type = 'range'; this.input.min = '0'; this.input.max = '0'; this.input.step = '0.1';
      this.input.setAttribute('aria-label', 'Seek video'); this.input.setAttribute('aria-valuetext', 'Loading video'); this.input.disabled = true;
      this.output = this.document.createElement('span'); this.output.textContent = 'Loading video…';
      this.bar.append(this.input, this.output); shadow.append(style, this.bar);
      (options.root || this.document.body || this.document.documentElement).append(this.host);
      this.bind();
      this.refresh();
    }

    sourceIdentity() {
      const sources = Array.from(this.video.querySelectorAll('source')).map((source) => source.src || source.getAttribute('src') || '').join('|');
      return [this.video.currentSrc || '', this.video.src || this.video.getAttribute('src') || '', sources].join('::');
    }

    on(target, type, callback, options) {
      target.addEventListener(type, callback, options);
      this.listeners.push(() => target.removeEventListener(type, callback, options));
    }

    bind() {
      const refresh = () => this.refresh();
      for (const type of ['loadedmetadata', 'durationchange', 'timeupdate', 'progress', 'playing', 'pause', 'emptied', 'loadstart', 'error', 'canplay']) {
        this.on(this.video, type, () => {
          this.checkSource();
          if (type === 'emptied' || type === 'loadstart') { this.error = false; this.cancelDrag(); }
          if (type === 'error') { this.error = true; this.cancelDrag(); }
          refresh();
        });
      }
      this.on(this.input, 'input', (event) => { this.stopEvent(event); this.seek(Number(this.input.value)); });
      this.on(this.input, 'change', (event) => { this.stopEvent(event); this.seek(Number(this.input.value)); });
      this.on(this.input, 'keydown', (event) => {
        const target = keyboardTarget(event.key, Number(this.video.currentTime) || 0, this.video.duration, event.shiftKey);
        if (target === null) return;
        this.stopEvent(event); event.preventDefault(); this.seek(target);
      });
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'mousedown', 'touchstart']) {
        this.on(this.input, type, (event) => this.stopEvent(event));
      }
      this.on(this.input, 'pointerdown', (event) => this.beginDrag(event));
      this.on(this.input, 'pointerup', () => this.finishDrag(true));
      this.on(this.input, 'pointercancel', () => this.finishDrag(false));
      this.on(this.document, 'pointerup', (event) => { if (!this.drag || !this.pointerMatches(event)) return; this.finishDrag(true); });
      this.on(this.document, 'pointercancel', (event) => { if (this.drag && this.pointerMatches(event)) this.finishDrag(false); });
      this.on(this.document.defaultView, 'blur', () => this.finishDrag(false));
      this.on(this.document, 'visibilitychange', () => { if (this.document.hidden) this.finishDrag(false); });
    }

    stopEvent(event) { event.stopPropagation(); }

    checkSource() {
      const next = this.sourceIdentity();
      if (next !== this.source) {
        this.source = next;
        this.error = false;
        this.cancelDrag();
        this.input.value = '0';
      }
    }

    seek(target) {
      if (this.destroyed || !isValidDuration(this.video.duration) || this.error) return;
      let ranges = [];
      try { for (let i = 0; i < this.video.seekable.length; i++) ranges.push([this.video.seekable.start(i), this.video.seekable.end(i)]); } catch (_) { ranges = []; }
      const time = clampSeek(target, this.video.duration, ranges);
      try { this.video.currentTime = time; } catch (_) { /* Media may reject a seek while changing source. */ }
      this.refresh();
    }

    beginDrag(event) {
      if (this.destroyed || !event.isPrimary || (event.button !== undefined && event.button !== 0) || this.input.disabled) return;
      this.checkSource();
      this.drag = {
        pointerId: event.pointerId,
        source: this.source,
        wasPlaying: !this.video.paused && !this.video.ended,
        visible: !this.host.hidden && this.isVideoVisible(),
      };
      if (event.pointerId !== undefined) { try { this.input.setPointerCapture(event.pointerId); } catch (_) { /* Capture may be unavailable in older browsers. */ } }
      if (this.drag.wasPlaying) {
        try { this.video.pause(); } catch (_) { /* Ignore media teardown races. */ }
      }
    }

    pointerMatches(event) { return !this.drag || event.pointerId === undefined || event.pointerId === this.drag.pointerId; }

    finishDrag(resume) {
      const drag = this.drag;
      if (!drag) return;
      this.drag = null;
      if (drag.pointerId !== undefined) { try { if (this.input.hasPointerCapture?.(drag.pointerId)) this.input.releasePointerCapture(drag.pointerId); } catch (_) { /* Pointer may already be released. */ } }
      if (!resume || !drag.wasPlaying || this.destroyed || !drag.visible || !this.video.isConnected ||
          this.document.hidden || drag.source !== this.sourceIdentity() || !this.isVideoVisible()) return;
      try {
        const promise = this.video.play();
        if (promise && typeof promise.catch === 'function') promise.catch(() => {});
      } catch (_) { /* Autoplay policy or media teardown can reject synchronously. */ }
    }

    cancelDrag() { this.finishDrag(false); }

    isVideoVisible() {
      if (!this.video.isConnected) return false;
      return typeof this.options.isVisible === 'function' ? this.options.isVisible(this.video) : true;
    }

    refresh() {
      if (this.destroyed) return;
      const duration = this.video.duration;
      if (duration === Infinity) this.host.hidden = true;
      const valid = isValidDuration(duration) && !this.error;
      const now = Number.isFinite(this.video.currentTime) ? Math.max(0, this.video.currentTime) : 0;
      this.input.disabled = !valid;
      this.input.max = valid ? String(duration) : '0';
      this.input.value = valid ? String(Math.min(now, duration)) : '0';
      this.input.setAttribute('aria-valuetext', valid ? `${formatTime(now)} of ${formatTime(duration)}` : this.error ? 'Video unavailable' : 'Loading video');
      this.output.textContent = valid ? `${formatTime(now)} / ${formatTime(duration)}` : this.error ? 'Video unavailable' : 'Loading video…';
    }

    updateLayout(bounds) {
      this.layout = bounds;
      if (!bounds || this.video.duration === Infinity || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width < 120 || bounds.height < 90 || !this.video.isConnected) {
        this.host.hidden = true;
        if (this.drag) this.drag.visible = false;
        return;
      }
      const width = Math.max(104, Math.min(560, bounds.width - 16));
      const height = 38;
      this.host.style.left = `${Math.round(bounds.left + (bounds.width - width) / 2)}px`;
      this.host.style.top = `${Math.round(bounds.top + bounds.height - height - 10)}px`;
      this.host.style.width = `${Math.round(width)}px`;
      this.host.style.height = `${height}px`;
      this.host.hidden = false;
      if (this.drag) this.drag.visible = this.isVideoVisible();
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.cancelDrag();
      for (const remove of this.listeners.splice(0)) remove();
      this.host.remove();
    }
  }

  api.VideoController = VideoController;
  if (typeof module !== 'undefined' && module.exports) module.exports = { VideoController };
})(typeof globalThis !== 'undefined' ? globalThis : this);
