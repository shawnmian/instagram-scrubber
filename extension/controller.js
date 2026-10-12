(function (root) {
  'use strict';
  const api = root.InstagramScrubber || (root.InstagramScrubber = {});
  const { formatTime, isValidDuration, clampSeek, keyboardTarget } = api;
  const VOLUME_ATTRIBUTE = 'data-instagram-scrubber-volume';
  const NATIVE_AUDIO_ICON = 'svg[aria-label="Audio is muted"], svg[aria-label="Audio is playing"]';

  class VideoController {
    constructor(video, options = {}) {
      this.video = video;
      this.document = video.ownerDocument;
      this.options = options;
      this.drag = null;
      this.volumeDrag = null;
      this.pointerOverVideo = false;
      this.keyboardFocused = false;
      this.lastPositiveVolume = Number.isFinite(video.volume) && video.volume > 0 ? video.volume : 0.5;
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
      this.shadow = shadow;
      const style = this.document.createElement('style');
      style.textContent = `
        :host { all: initial; }
        :host([hidden]) { display:none !important; }
        .bar { box-sizing:border-box; position:relative; display:flex; align-items:center; gap:8px; width:100%; height:38px; padding:0 10px; border-radius:8px; color:#fff; background:rgba(20,18,22,.88); font:12px/1.2 system-ui,-apple-system,sans-serif; box-shadow:0 1px 8px rgba(0,0,0,.35); pointer-events:none; opacity:0; transition:opacity 100ms ease; }
        .bar.is-visible { opacity:1; pointer-events:auto; }
        .bar:hover, .bar:focus-within { background:rgba(12,10,14,.96); }
        input { flex:1; min-width:0; height:24px; margin:0; accent-color:#ff4f91; cursor:pointer; }
        input:focus-visible { outline:2px solid #fff; outline-offset:2px; border-radius:3px; }
        input::-webkit-slider-thumb { width:16px; height:16px; }
        input::-moz-range-thumb { width:16px; height:16px; }
        input:disabled { cursor:default; opacity:.58; }
        .time-label { flex:none; min-width:70px; text-align:right; font:12px ui-monospace,SFMono-Regular,Menlo,monospace; white-space:nowrap; }
        .volume-group { position:relative; display:flex; flex:none; align-items:center; height:100%; }
        .mute-button { display:grid; place-items:center; width:28px; height:28px; padding:0; border:0; border-radius:5px; color:inherit; background:transparent; cursor:pointer; }
        .mute-button:hover, .mute-button:focus-visible { background:rgba(255,255,255,.16); outline:2px solid #fff; outline-offset:1px; }
        .mute-button svg { width:18px; height:18px; fill:currentColor; }
        .volume-popup { position:absolute; z-index:2; left:50%; bottom:calc(100% - 3px); display:flex; align-items:center; justify-content:center; width:34px; height:var(--volume-height, 72px); transform:translateX(-50%); padding:6px 0; border-radius:7px 7px 0 0; background:rgba(20,18,22,.94); opacity:0; visibility:hidden; pointer-events:none; }
        .volume-group:hover .volume-popup, .volume-group:focus-within .volume-popup { opacity:1; visibility:visible; pointer-events:auto; }
        .volume-input { flex:none; width:20px; height:100%; margin:0; writing-mode:vertical-lr; direction:rtl; accent-color:#ff4f91; cursor:pointer; }
      `;
      this.bar = this.document.createElement('div');
      this.bar.className = 'bar';
      this.input = this.document.createElement('input');
      this.input.type = 'range'; this.input.min = '0'; this.input.max = '0'; this.input.step = '0.1';
      this.input.setAttribute('aria-label', 'Seek video'); this.input.setAttribute('aria-valuetext', 'Loading video'); this.input.disabled = true;
      this.output = this.document.createElement('span'); this.output.className = 'time-label'; this.output.textContent = 'Loading video…';
      this.volumeGroup = this.document.createElement('div'); this.volumeGroup.className = 'volume-group';
      this.muteButton = this.document.createElement('button'); this.muteButton.type = 'button'; this.muteButton.className = 'mute-button';
      this.muteButton.setAttribute('aria-label', 'Mute video'); this.muteButton.setAttribute('aria-pressed', 'false');
      this.muteIcon = this.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.muteIcon.setAttribute('viewBox', '0 0 24 24'); this.muteIcon.setAttribute('aria-hidden', 'true');
      this.muteButton.append(this.muteIcon);
      this.volumePopup = this.document.createElement('div'); this.volumePopup.className = 'volume-popup';
      this.volumeInput = this.document.createElement('input'); this.volumeInput.type = 'range'; this.volumeInput.className = 'volume-input';
      this.volumeInput.min = '0'; this.volumeInput.max = '1'; this.volumeInput.step = '0.01'; this.volumeInput.setAttribute('aria-label', 'Video volume');
      this.volumeInput.setAttribute('aria-orientation', 'vertical');
      this.volumePopup.append(this.volumeInput); this.volumeGroup.append(this.volumePopup, this.muteButton);
      this.bar.append(this.input, this.output, this.volumeGroup); shadow.append(style, this.bar);
      (options.root || this.document.body || this.document.documentElement).append(this.host);
      this.bind();
      this.syncVolume();
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
      this.on(this.video, 'volumechange', () => this.syncVolume());
      this.on(this.shadow, 'focusin', () => {
        this.keyboardFocused = Boolean(this.options.isKeyboardModality?.());
        this.updateReveal();
      });
      this.on(this.shadow, 'focusout', () => this.document.defaultView.setTimeout(() => {
        this.keyboardFocused = Boolean(this.options.isKeyboardModality?.() && this.shadow.activeElement);
        this.updateReveal();
      }, 0));
      this.on(this.bar, 'pointerdown', () => { this.keyboardFocused = false; this.updateReveal(); });
      this.on(this.bar, 'pointerenter', () => this.updateReveal());
      this.on(this.muteButton, 'pointerdown', () => { this.keyboardFocused = false; this.updateReveal(); });
      this.on(this.muteButton, 'click', (event) => { this.stopEvent(event); event.preventDefault(); this.toggleMuted(); });
      this.on(this.volumeInput, 'input', (event) => { this.stopEvent(event); this.setVolume(Number(this.volumeInput.value)); });
      this.on(this.volumeInput, 'change', (event) => this.stopEvent(event));
      this.on(this.volumeInput, 'keydown', (event) => this.volumeKeydown(event));
      this.on(this.volumeInput, 'pointerdown', (event) => this.beginVolumeDrag(event));
      this.on(this.volumeInput, 'pointerup', (event) => { if (this.volumePointerMatches(event)) this.finishVolumeDrag(); });
      this.on(this.volumeInput, 'pointercancel', (event) => { if (this.volumePointerMatches(event)) this.finishVolumeDrag(); });
      for (const target of [this.volumeInput, this.muteButton, this.volumeGroup]) {
        for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'mousedown', 'touchstart']) this.on(target, type, (event) => this.stopEvent(event));
      }
      this.on(this.input, 'input', (event) => { this.stopEvent(event); this.seek(Number(this.input.value)); });
      this.on(this.input, 'change', (event) => { this.stopEvent(event); this.seek(Number(this.input.value)); });
      this.on(this.input, 'keydown', (event) => {
        this.keyboardFocused = true;
        this.updateReveal();
        const target = keyboardTarget(event.key, Number(this.video.currentTime) || 0, this.video.duration, event.shiftKey);
        if (target === null) return;
        this.stopEvent(event); event.preventDefault(); this.seek(target);
      });
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'mousedown', 'touchstart']) {
        this.on(this.input, type, (event) => this.stopEvent(event));
      }
      this.on(this.input, 'pointerdown', (event) => this.beginDrag(event));
      this.on(this.input, 'pointerup', (event) => { if (this.pointerMatches(event)) this.finishDrag(true); });
      this.on(this.input, 'pointercancel', (event) => { if (this.pointerMatches(event)) this.finishDrag(false); });
      this.on(this.document, 'pointerup', (event) => { if (this.drag && this.pointerMatches(event)) this.finishDrag(true); if (this.volumeDrag && this.volumePointerMatches(event)) this.finishVolumeDrag(); }, true);
      this.on(this.document, 'pointercancel', (event) => { if (this.drag && this.pointerMatches(event)) this.finishDrag(false); if (this.volumeDrag && this.volumePointerMatches(event)) this.finishVolumeDrag(); }, true);
      this.on(this.document.defaultView, 'blur', () => { this.finishDrag(false); this.finishVolumeDrag(); this.setPointerHover(false); });
      this.on(this.document, 'visibilitychange', () => { if (this.document.hidden) { this.finishDrag(false); this.finishVolumeDrag(); this.setPointerHover(false); } });
    }

    stopEvent(event) { event.stopPropagation(); }

    syncVolume() {
      const volume = Number.isFinite(this.video.volume) ? Math.max(0, Math.min(1, this.video.volume)) : 0;
      if (volume > 0) this.lastPositiveVolume = volume;
      this.volumeInput.value = String(volume);
      this.volumeInput.setAttribute('aria-valuetext', `${Math.round(volume * 100)} percent`);
      const muted = Boolean(this.video.muted || volume === 0);
      this.muteButton.setAttribute('aria-pressed', String(muted));
      this.muteButton.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
      this.muteIcon.innerHTML = muted
        ? '<path d="M3 9v6h4l5 4V5L7 9H3zm13.59 3 2.12 2.12-1.41 1.41L15.17 13.4l-2.12 2.12-1.41-1.41L13.76 12l-2.12-2.12 1.41-1.41 2.12 2.12 2.12-2.12 1.41 1.41L16.59 12z"/>'
        : '<path d="M3 9v6h4l5 4V5L7 9H3zm12.5 3a3.5 3.5 0 0 0-2.5-3.35v6.7a3.5 3.5 0 0 0 2.5-3.35zm-2.5-8v2.06a6 6 0 0 1 0 11.88V20a8 8 0 0 0 0-16z"/>';
    }

    setVolume(value) {
      if (this.destroyed) return;
      const volume = Math.max(0, Math.min(1, Number(value) || 0));
      this.applyVolume(volume);
      if (volume > 0) this.lastPositiveVolume = volume;
      this.applyMuted(volume === 0);
      this.syncVolume();
    }

    toggleMuted() {
      if (this.video.muted || this.video.volume === 0) {
        if (this.video.volume === 0) this.applyVolume(this.lastPositiveVolume || 0.5);
        this.applyMuted(false);
      } else this.applyMuted(true);
      this.syncVolume();
    }

    // Publishes the volume for page-volume.js so Instagram's player cannot restore its own.
    applyVolume(volume) {
      this.document.documentElement.setAttribute(VOLUME_ATTRIBUTE, String(volume));
      try { this.video.volume = volume; } catch (_) { /* Media may reject volume changes in restricted contexts. */ }
    }

    // Instagram re-applies its own mute state on playback, so change it through its button.
    applyMuted(muted) {
      const native = this.nativeAudioButton();
      if (native && this.nativeAudioMuted(native) !== muted) native.click();
      try { this.video.muted = muted; } catch (_) { /* Media may reject volume changes in restricted contexts. */ }
    }

    nativeAudioButton() {
      let scope = this.video.parentElement;
      for (let depth = 0; scope && depth < 8; depth++, scope = scope.parentElement) {
        if (scope.querySelectorAll('video').length > 1) return null;
        const icon = scope.querySelector(NATIVE_AUDIO_ICON);
        if (icon) return icon.closest('[role="button"], button');
      }
      return null;
    }

    nativeAudioMuted(button) {
      return button.querySelector(NATIVE_AUDIO_ICON)?.getAttribute('aria-label') === 'Audio is muted';
    }

    hideNativeAudio(hide) {
      const button = hide ? this.nativeAudioButton() : null;
      if (this.hiddenNative && this.hiddenNative.element !== button) {
        const { element, value, priority } = this.hiddenNative;
        if (value) element.style.setProperty('visibility', value, priority); else element.style.removeProperty('visibility');
        this.hiddenNative = null;
      }
      if (button && !this.hiddenNative) {
        this.hiddenNative = { element: button, value: button.style.getPropertyValue('visibility'), priority: button.style.getPropertyPriority('visibility') };
        button.style.setProperty('visibility', 'hidden', 'important');
      }
    }

    volumeKeydown(event) {
      const step = 0.05;
      const current = Number(this.volumeInput.value) || 0;
      let value;
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') value = current + step;
      else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') value = current - step;
      else if (event.key === 'Home') value = 0;
      else if (event.key === 'End') value = 1;
      else return;
      this.keyboardFocused = true;
      this.updateReveal();
      this.stopEvent(event); event.preventDefault(); this.setVolume(Math.round(value * 100) / 100);
    }

    beginVolumeDrag(event) {
      if (this.destroyed || !event.isPrimary || (event.button !== undefined && event.button !== 0)) return;
      this.keyboardFocused = false;
      this.updateReveal();
      this.volumeDrag = { pointerId: event.pointerId };
      this.updateReveal();
    }

    volumePointerMatches(event) { return !this.volumeDrag || event.pointerId === undefined || event.pointerId === this.volumeDrag.pointerId; }

    finishVolumeDrag() {
      if (!this.volumeDrag) return;
      this.volumeDrag = null;
      this.updateReveal();
    }

    containsPoint(x, y) {
      const bounds = this.layout;
      return Boolean(!this.host.hidden && bounds && x >= bounds.left && x <= bounds.left + bounds.width && y >= bounds.top && y <= bounds.top + bounds.height);
    }

    setPointerHover(value) { this.pointerOverVideo = Boolean(value); this.updateReveal(); }

    updateReveal() {
      if (!this.bar || this.host.hidden) { this.bar?.classList.remove('is-visible'); this.hideNativeAudio(false); return; }
      const focused = Boolean(this.keyboardFocused && this.shadow.activeElement);
      const visible = Boolean(this.pointerOverVideo || focused || this.drag || this.volumeDrag);
      this.bar.classList.toggle('is-visible', visible);
      this.hideNativeAudio(visible);
    }

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
      this.keyboardFocused = false;
      this.updateReveal();
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
          this.document.hidden || drag.source !== this.sourceIdentity() || !this.isVideoVisible()) { this.updateReveal(); return; }
      try {
        const promise = this.video.play();
        if (promise && typeof promise.catch === 'function') promise.catch(() => {});
      } catch (_) { /* Autoplay policy or media teardown can reject synchronously. */ }
      this.updateReveal();
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
      if (duration !== Infinity && valid && this.layout && this.host.hidden) this.updateLayout(this.layout);
    }

    updateLayout(bounds) {
      this.layout = bounds;
      if (!bounds || this.video.duration === Infinity || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width < 120 || bounds.height < 90 || !this.video.isConnected) {
        this.host.hidden = true;
        if (this.drag) this.drag.visible = false;
        this.pointerOverVideo = false;
        this.updateReveal();
        return;
      }
      const width = Math.max(104, Math.min(560, bounds.width - 16));
      const height = 38;
      this.host.style.left = `${Math.round(bounds.left + (bounds.width - width) / 2)}px`;
      this.host.style.top = `${Math.round(bounds.top + bounds.height - height - 10)}px`;
      this.host.style.width = `${Math.round(width)}px`;
      this.host.style.height = `${height}px`;
      const popupHeight = Math.max(30, Math.min(96, bounds.height - height - 20));
      this.volumePopup.style.setProperty('--volume-height', `${popupHeight}px`);
      this.host.hidden = false;
      this.updateReveal();
      if (this.drag) this.drag.visible = this.isVideoVisible();
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.cancelDrag();
      this.finishVolumeDrag();
      for (const remove of this.listeners.splice(0)) remove();
      this.hideNativeAudio(false);
      this.host.remove();
    }
  }

  api.VideoController = VideoController;
  if (typeof module !== 'undefined' && module.exports) module.exports = { VideoController };
})(typeof globalThis !== 'undefined' ? globalThis : this);
