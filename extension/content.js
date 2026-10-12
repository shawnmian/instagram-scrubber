(function (root) {
  'use strict';
  const api = root.InstagramScrubber || (root.InstagramScrubber = {});
  const STATE_KEY = '__instagramScrubberPageState__';

  function rectangle(element) {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  }

  function visibleBounds(video, document) {
    if (!video.isConnected || document.hidden) return null;
    const win = document.defaultView;
    if (document.fullscreenElement) return null;
    const videoStyle = win.getComputedStyle(video);
    if (videoStyle.display === 'none' || videoStyle.visibility === 'hidden' || videoStyle.contentVisibility === 'hidden') return null;
    let rect = rectangle(video);
    if (rect.width < 1 || rect.height < 1) return null;
    let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
    let right = Math.min(win.innerWidth, rect.right), bottom = Math.min(win.innerHeight, rect.bottom);
    let element = video.parentElement;
    while (element && element !== document.documentElement) {
      const style = win.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.contentVisibility === 'hidden') return null;
      const clipsX = /(hidden|clip|auto|scroll)/.test(style.overflowX || style.overflow);
      const clipsY = /(hidden|clip|auto|scroll)/.test(style.overflowY || style.overflow);
      if (clipsX || clipsY) {
        const clip = rectangle(element);
        if (clipsX) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
        if (clipsY) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
      }
      element = element.parentElement;
    }
    if (right <= left || bottom <= top) return null;
    const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
    for (const dialog of document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')) {
      if (dialog.contains(video) || video.contains(dialog)) continue;
      const box = rectangle(dialog);
      if (centerX >= box.left && centerX <= box.right && centerY >= box.top && centerY <= box.bottom) return null;
    }
    return { left, top, width: right - left, height: bottom - top };
  }

  class VideoManager {
    constructor(document) {
      this.document = document;
      this.window = document.defaultView;
      this.controllers = new Map();
      this.visible = new WeakMap();
      this.metrics = { scans: 0 };
      this.frame = 0;
      this.destroyed = false;
      this.root = document.createElement('div');
      this.root.setAttribute('data-instagram-scrubber-root', '');
      this.root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:visible;';
      (document.body || document.documentElement).append(this.root);
      this.mutationObserver = new this.window.MutationObserver((records) => this.onMutations(records));
      this.mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
      this.intersectionObserver = typeof this.window.IntersectionObserver === 'function'
        ? new this.window.IntersectionObserver((entries) => {
          for (const entry of entries) { this.visible.set(entry.target, entry.isIntersecting && entry.intersectionRatio > 0); this.layoutOne(entry.target); }
        }) : null;
      this.resizeObserver = typeof this.window.ResizeObserver === 'function'
        ? new this.window.ResizeObserver((entries) => { for (const entry of entries) this.layoutOne(entry.target); }) : null;
      this.onScroll = () => this.scheduleLayout();
      this.onResize = () => this.scheduleLayout();
      this.window.addEventListener('scroll', this.onScroll, true);
      this.window.addEventListener('resize', this.onResize);
      this.scan(document);
      this.scheduleLayout();
    }

    scan(scope) {
      if (this.destroyed) return;
      this.metrics.scans++;
      const videos = [];
      if (scope.nodeType === 1 && scope.localName === 'video') videos.push(scope);
      if (scope.querySelectorAll) videos.push(...scope.querySelectorAll('video'));
      for (const video of videos) {
        if (this.controllers.has(video) || this.root.contains(video)) continue;
        const controller = new api.VideoController(video, { root: this.root, isVisible: (candidate) => this.isVisible(candidate) });
        this.controllers.set(video, controller);
        if (this.intersectionObserver) this.intersectionObserver.observe(video);
        if (this.resizeObserver) this.resizeObserver.observe(video);
      }
      this.prune();
      this.scheduleLayout();
    }

    isVisible(video) {
      if (this.visible.get(video) === false) return false;
      return Boolean(visibleBounds(video, this.document));
    }

    layoutOne(video) {
      const controller = this.controllers.get(video);
      if (!controller) return;
      const bounds = this.isVisible(video) ? visibleBounds(video, this.document) : null;
      controller.updateLayout(bounds);
    }

    scheduleLayout() {
      if (this.destroyed || this.frame) return;
      this.frame = this.window.requestAnimationFrame(() => {
        this.frame = 0;
        for (const video of this.controllers.keys()) this.layoutOne(video);
      });
    }

    prune() {
      for (const [video, controller] of this.controllers) {
        if (!video.isConnected) {
          controller.destroy(); this.controllers.delete(video);
          if (this.intersectionObserver) this.intersectionObserver.unobserve(video);
          if (this.resizeObserver) this.resizeObserver.unobserve(video);
          this.visible.delete?.(video);
        }
      }
    }

    onMutations(records) {
      if (this.destroyed) return;
      let layout = false;
      for (const record of records) {
        if (this.root.contains(record.target)) continue;
        if (record.type === 'attributes') {
          const media = record.target.localName === 'video' ? record.target : record.target.closest?.('video');
          if (media && this.controllers.has(media)) {
            const controller = this.controllers.get(media); controller.checkSource(); controller.refresh();
          }
          layout = true; continue;
        }
        for (const node of record.addedNodes) {
          if (node.nodeType === 1 && !this.root.contains(node)) this.scan(node);
        }
        if (record.removedNodes.length) { this.prune(); layout = true; }
      }
      if (layout) this.scheduleLayout();
    }

    destroy(preserveLifecycle = false) {
      if (this.destroyed) return;
      this.destroyed = true;
      this.mutationObserver.disconnect();
      if (this.intersectionObserver) this.intersectionObserver.disconnect();
      if (this.resizeObserver) this.resizeObserver.disconnect();
      this.window.removeEventListener('scroll', this.onScroll, true);
      this.window.removeEventListener('resize', this.onResize);
      if (this.frame) this.window.cancelAnimationFrame(this.frame);
      this.frame = 0;
      for (const controller of this.controllers.values()) controller.destroy();
      this.controllers.clear();
      this.root.remove();
      const state = this.document[STATE_KEY];
      if (state?.manager === this) {
        state.manager = null;
        if (!preserveLifecycle) {
          this.window.removeEventListener('pagehide', state.onPageHide);
          this.window.removeEventListener('pageshow', state.onPageShow);
          delete this.document[STATE_KEY];
        }
      }
    }
  }

  function initialize(document) {
    let state = document[STATE_KEY];
    if (state?.manager && !state.manager.destroyed) return state.manager;
    if (!state) {
      state = { manager: null, onPageHide: null, onPageShow: null };
      state.onPageHide = () => { if (state.manager) state.manager.destroy(true); };
      state.onPageShow = (event) => { if (event.persisted && !state.manager) initialize(document); };
      document[STATE_KEY] = state;
      document.defaultView.addEventListener('pagehide', state.onPageHide);
      document.defaultView.addEventListener('pageshow', state.onPageShow);
    }
    state.manager = new VideoManager(document);
    return state.manager;
  }

  api.VideoManager = VideoManager;
  api.initialize = initialize;
  api.visibleBounds = visibleBounds;
  if (typeof module !== 'undefined' && module.exports) module.exports = { VideoManager, initialize, visibleBounds };
  if (root.document && /(^|\.)instagram\.com$/i.test(root.location?.hostname || '')) initialize(root.document);
})(typeof globalThis !== 'undefined' ? globalThis : this);
