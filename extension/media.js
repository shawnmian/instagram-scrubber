(function (root) {
  'use strict';

  function formatTime(value) {
    const seconds = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
  }

  function isValidDuration(duration) {
    return Number.isFinite(duration) && duration > 0;
  }

  function clampSeek(target, duration, ranges) {
    if (!isValidDuration(duration)) return 0;
    const value = Math.max(0, Math.min(duration, Number.isFinite(Number(target)) ? Number(target) : 0));
    const usable = Array.from(ranges || []).filter((range) => Array.isArray(range) &&
      Number.isFinite(range[0]) && Number.isFinite(range[1]) && range[1] >= range[0])
      .map(([start, end]) => [Math.max(0, start), Math.min(duration, end)])
      .filter(([start, end]) => end >= start);
    if (!usable.length) return value;
    let nearest = value;
    let distance = Infinity;
    for (const [start, end] of usable) {
      if (value >= start && value <= end) return value;
      for (const boundary of [start, end]) {
        const delta = Math.abs(value - boundary);
        if (delta < distance) { nearest = boundary; distance = delta; }
      }
    }
    return nearest;
  }

  function keyboardTarget(key, currentTime, duration, shiftKey) {
    if (!isValidDuration(duration)) return null;
    let target;
    if (key === 'Home') target = 0;
    else if (key === 'End') target = duration;
    else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const delta = shiftKey ? 1 : 5;
      target = currentTime + (key === 'ArrowRight' ? delta : -delta);
    } else return null;
    return Math.max(0, Math.min(duration, target));
  }

  const api = Object.assign(root.InstagramScrubber || {}, { formatTime, isValidDuration, clampSeek, keyboardTarget });
  root.InstagramScrubber = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
