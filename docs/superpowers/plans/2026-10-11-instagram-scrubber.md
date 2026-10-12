# Instagram Scrubber implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. The user requested design followed by implementation with a smaller model. GPT-6 Luna implements; the parent reviews. Work in this new independent repository. Do not dispatch further agents or add approval gates for already authorized local work.

**Goal:** Build and package a Firefox extension that adds an accessible scrub timeline to Instagram videos.

**Architecture:** Ordered plain JavaScript content scripts share a private namespace. A lifecycle manager attaches shadow-DOM controllers to native videos, while pure media helpers constrain seeking and format time.

**Tech stack:** Firefox Manifest V3, vanilla JavaScript/CSS, Node test runner, optional DOM/browser dev dependencies, zip packaging.

**Spec:** `docs/superpowers/specs/2026-10-11-instagram-scrubber-design.md`

## Global constraints

- Project is `/Users/shawnmian/Projects/instagram-scrubber`; work on `feat/initial-extension`.
- Extension name `Instagram Scrubber`, version `0.1.0`, ID `instagram-scrubber@local.invalid`, Firefox minimum `140.0`.
- Instagram HTTPS hosts only; no API permissions, storage, network calls, analytics, runtime dependencies, or remote code.
- Preserve playback intent, cancel safely on source replacement/removal, and scope keyboard handlers to the timeline.
- Follow the spec's fixed overlay, clipping, cleanup, accessibility, and unsigned-delivery requirements.
- Parent handles final independent review. Do not spend work repeatedly reading skills or spawning reviewers; implement all three tasks as one handoff with progress recorded in `docs/implementation-log.md`.

## Review focus

1. A source changes while a pointer is held: never resume the replacement video. Task 2 regression test.
2. Native seekable ranges have gaps or are empty: choose a valid nearest boundary without disabling all early seeks. Task 1 tests.
3. Instagram inserts/removes/reuses nodes: no stale overlay, duplicates, or leaked event listeners. Task 3 lifecycle tests.
4. Pointer release occurs outside the slider or the window loses focus: finish/cancel predictably. Task 2 tests.
5. A video sits in a clipped scrolling container or behind a dialog: overlays must not cover unrelated content. Task 3 browser fixture and layout tests.

## Task 1: Loadable extension and media math

**Files:** `package.json`, `.gitignore`, `extension/manifest.json`, `extension/icons/icon.svg`, `extension/media.js`, `tests/media.test.cjs`, `scripts/validate.mjs`.

**Interfaces:** Publish a namespace such as `globalThis.InstagramScrubber` with `formatTime(seconds)`, `isValidDuration(duration)`, `clampSeek(target, duration, ranges)` (ranges represented as numeric pairs), and `keyboardTarget(key, currentTime, duration, shiftKey)` returning a number or null. Also expose helpers to Node tests using a guarded CommonJS export, without requiring a build pipeline.

- [ ] Write tests first, with these exact representative assertions plus boundary variants:

```js
assert.equal(formatTime(65), '1:05');
assert.equal(formatTime(3661), '1:01:01');
assert.equal(isValidDuration(Infinity), false);
assert.equal(isValidDuration(NaN), false);
assert.equal(clampSeek(-4, 30, []), 0);
assert.equal(clampSeek(44, 30, []), 30);
assert.equal(clampSeek(14, 30, [[0, 10], [20, 30]]), 10);
assert.equal(clampSeek(18, 30, [[0, 10], [20, 30]]), 20);
assert.equal(keyboardTarget('ArrowRight', 12, 38, false), 17);
assert.equal(keyboardTarget('ArrowRight', 12, 38, true), 13);
assert.equal(keyboardTarget('a', 12, 38, false), null);
```

- [ ] Run `node --test tests/media.test.cjs`; expect a missing helper/module failure before implementation.
- [ ] Implement helpers with finite-number guards, clamping, proper hours, and nearest interval selection. Create the specified manifest and original icon. Configure `npm test` using Node's runner. Ignore `node_modules/`, `dist/`, browser outputs, and `.superpowers/`.
- [ ] Implement a source validator checking JSON, manifest version, exact host allowlist, file existence, Firefox metadata, no unexpected permissions, no remote content, and JS syntax (`node --check`). Run it with `npm run validate`.
- [ ] Run tests and validation; expect exit 0. Record evidence and commit the task if git permits.

## Task 2: Accessible timeline and robust scrub behavior

**Files:** `extension/controller.js`, `tests/controller.test.cjs` (or equivalent browser tests).

**Interfaces:** `new VideoController(video, options)` exposes `host`, `updateLayout(boundsOrNull)`, and `destroy()`. Options can hold an injected visibility check if needed for testability. The constructor creates the shadow DOM control once; manager owns attachment/disposal. Consume Task 1 helpers.

- [ ] Write behavior tests first. For a 38-second video at time 12, pressing Right on the focused slider must produce 17; with Shift, 13. A comment input's Right key must do nothing. Drag from 12 to 24 while playing must pause once, seek, and resume once on release; the same drag on a paused video must not call play. Removal/source reset before release must prevent resume. A rejected play promise must not become an unhandled rejection. Pointer cancel and blur must clear drag state. Destroy must detach media/document listeners.
- [ ] Run the tests before implementation; expect controller behavior failures.
- [ ] Implement shadow DOM styles and range, elapsed label, disabled/loading state, media events, pointer capture/release/cancel handling, local keyboard shortcuts, and playback intent restoration. Use actual native range input behavior where possible. Handle drag release outside the slider using capture and/or document listeners; ensure input and pointerup order commits the final value. Use `textContent` and static element construction. Do not use remote HTML or evaluate code.
- [ ] Implement `updateLayout` to place a compact control strip within supplied bounds and hide on null/small bounds. `destroy` must be idempotent and remove all listeners, pointer state, and DOM. Catch seek exceptions and play rejections. Reset on `emptied`, `loadstart`, and source identity change.
- [ ] Run targeted tests and full `npm test`; expect exit 0. Record evidence and commit.

## Task 3: Dynamic page lifecycle, browser fixture, and delivery

**Files:** `extension/content.js`, `tests/lifecycle.test.cjs` (or equivalent), `tests/fixtures/index.html`, fixture scripts/media, browser smoke script if available, `scripts/package.mjs`, `README.md`, `docs/implementation-log.md`.

**Interfaces:** Manager owns a Map from video to controller and one extension root. Expose a small initialization/cleanup entry in the private namespace if it aids tests; browser automatically initializes once. Consume `VideoController` from Task 2.

- [ ] Write failing lifecycle tests: initial and late videos get one controller; removing a subtree destroys all its controllers; reinsertion gets one fresh controller; changing a video source resets old drag metadata; extension-created DOM mutations do not rescan indefinitely; page lifecycle recovery does not leave an inert extension; clipped/hidden videos hide overlays.
- [ ] Implement incremental discovery with MutationObserver, IntersectionObserver, ResizeObserver, and a scheduled layout update for scrolling/resizing. Re-check connected state and source identity. Use viewport/ancestor clipping and basic occlusion checks so unrelated modal backgrounds do not acquire visible controls. Hide for native video fullscreen. Clean up on pagehide and recover on persisted pageshow, or use an equivalent correct lifecycle.
- [ ] Build a local fixture with a playable deterministic video (generated locally or a checked-in short permissively licensed sample with attribution), playing/paused examples, an overflow clip container, an overlay dialog, and add/remove/reuse buttons. Load the same ordered source scripts in the fixture, without expanding production host permissions.
- [ ] Exercise click, drag, keyboard, dynamic discovery, and source replacement in an actual browser. Use Playwright if available or native Firefox automation in a disposable profile. Dependencies are development only. Never modify the user's normal Firefox profile. Capture one screenshot for parent review. If the environment blocks a browser, record the error and retain a runnable fixture/checklist; do not claim live verification.
- [ ] Implement `npm run package` to validate and zip only the extension directory into `dist/instagram-scrubber-0.1.0.zip`. Verify archive file listing. Include `npm run lint:firefox` with Mozilla `web-ext` if installable and run it; if unavailable, state the distinction from local validation.
- [ ] Write README with temporary loading, keyboard shortcuts, privacy, development commands, unsigned ZIP limitation, supported scope, and a manual Instagram checklist. Record exact tests and remaining live-site checks in the log.
- [ ] Run `npm test`, `npm run validate`, available browser smoke/lint, and `npm run package`. Expect test pass, valid manifest/source, and archive containing `manifest.json` at root. Commit final changes if git permits. Send parent a concise result with files, commands, screenshot path, and limits for independent review.
