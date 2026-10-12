# Implementation log

## Task 1: Extension shell and media helpers

- Added the Manifest V3 Firefox add-on manifest, SVG icon, Node package scripts, local validator, and pure time/seek/keyboard helpers.
- Red check: `node --test tests/media.test.cjs` failed because `extension/media.js` did not exist.
- Green check: media helper tests pass for time formatting, finite duration, clamping, disjoint seekable ranges, and shortcut boundaries.

## Task 2: Accessible controller and scrub behavior

- Added one shadow-DOM timeline per video with keyboard support, source reset handling, guarded seek and playback calls, pointer capture, outside release handling, and idempotent cleanup.
- Regression tests cover keyboard scoping, drag while playing and paused, release on and outside the control, pointer cancellation, source reset, rejected playback, infinity duration, layout hiding, and destroy cleanup.
- Controller test suite passes: 12 tests, including secondary pointer releases, paused release, blur/cancel, and finite-duration recovery.

## Task 3: Discovery, fixture, and delivery

- Added incremental video discovery, mutation/resize/intersection tracking, clipping and dialog checks, page lifecycle recovery, a local fixture video, README, browser smoke script, and ZIP packaging.
- Lifecycle test suite passes: 8 tests, including duplicate initialization, add/remove/reinsert, extension-root mutation filtering, hidden/clipped videos, modal open/close, ancestor visibility changes, viewport visibility/fullscreen events, and automatic persisted-page restoration.
- Full automated result at handoff: 24 tests pass; manifest and JavaScript validation pass; package archive contains `manifest.json` at its root.
- Environment limits: npm registry access failed with `ENOTFOUND`, so development tools could not be installed in this environment. Existing jsdom and Playwright packages were used locally from existing project caches. Chromium headless exits with `SIGABRT` (exit 134), and parent testing found the same headless abort for isolated Firefox. The browser smoke script now covers paused and playing drag behavior, source replacement during a drag, same-task removal/reinsertion, and a closed-dialog screenshot. It remains unrun because Chromium aborts before opening a page. Mozilla `web-ext lint` was unavailable because no `web-ext` executable was installed. No signed-in live Instagram test was performed.

## Rulings

- Kept development dependencies declared in `package.json` and verified against existing local caches. Registry DNS failure prevents a lockfile from being generated here; this does not add shipped runtime dependencies.
- The overlay root remains outside native fullscreen trees, so the manager hides controls during native fullscreen. Layout updates listen for relevant page attributes, tab visibility, and fullscreen changes; visible modal dialogs with `aria-modal=true` hide background video controls.
