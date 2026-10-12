# Instagram Scrubber design

## Intent and scope

The user wants a new Firefox extension that lets them scrub through Instagram videos, with design by the primary model and implementation by a smaller model. The requested design-and-build sequence authorizes the local implementation. The working name is Instagram Scrubber. This is an independent project in `/Users/shawnmian/Projects/instagram-scrubber`.

Assumptions: desktop Firefox; first version covers Reels, feed videos, and video post dialogs on Instagram's website. Success means clicking or dragging a timeline reliably seeks the video, keeps paused videos paused, and continues to work after scrolling or navigating within Instagram. Stories, live streams, mobile browsers, downloading, frame thumbnails, and native video fullscreen are outside this first version. Do not claim live Instagram compatibility until tested on the site.

## Approach and alternatives

Choose a small Manifest V3 content-script extension with a custom timeline over native HTML video elements. Plain JavaScript and CSS, no framework, bundler, remote code, server, analytics, or runtime dependencies. No popup or background worker is needed. Firefox's add-on manager supplies the enable/disable control.

Alternatives considered: (1) enable the video's built-in `controls` attribute, which is small but adds unwanted controls and is vulnerable to Instagram's overlay intercepting clicks; (2) put one controller in a browser popup, which separates the scrubber from the video and complicates choosing a video. The custom overlay gives predictable placement and keyboard behavior without private Instagram APIs.

## Experience

Each visible supported video has a small dark, rounded control strip inset from its lower edge. It contains an accessible horizontal range input and a monospace `0:12 / 0:38` label. White text and a warm pink progress accent remain legible over bright footage. A visible focus outline and a thumb at least 14 px wide support keyboard and pointer use. A roughly 32–40 px control height provides a comfortable target without covering the central video. Width is constrained to the visible video area and a 560 px maximum; hide on videos smaller than 120 by 90 px. No imagery or external fonts are needed.

Controls remain discoverable while the video is on screen, with slightly higher contrast on hover/focus. If duration is unknown, show a disabled timeline with `Loading video…`; hide for infinite/live duration. Show elapsed and total time, including hours when needed. Do not use an aria-live region that announces every time update.

Clicking jumps to the selected time. Dragging pauses a playing video while scrubbing and resumes it on release only if it is still the same visible, connected video on a visible page. A paused video stays paused. Pointer cancellation, window blur, navigation, source reset, or removal cleans up the drag without unexpectedly starting playback. A rejected `play()` promise is handled without an unhandled rejection. Ignore non-primary mouse buttons and secondary touch pointers.

When the timeline is focused: Left/Right seek 5 seconds, Shift+Left/Right seek 1 second, Home seeks the start, and End seeks the end. These shortcuts are local to the control, so typing in comments or using Instagram elsewhere is unaffected. The control has an accessible name and `aria-valuetext` such as `12 seconds of 38 seconds`. Stop pointer/click/keyboard propagation only from the scrubber so an Instagram click-to-pause or navigation listener cannot interpret a scrub gesture.

## Architecture

- `extension/manifest.json`: Manifest V3, version `0.1.0`, name `Instagram Scrubber`, Firefox ID `instagram-scrubber@local.invalid`, Firefox minimum `140.0`, `browser_specific_settings.gecko.data_collection_permissions.required: ["none"]`. Content script matches only `https://www.instagram.com/*` and `https://instagram.com/*`, at `document_idle`, top frame only. No additional API permissions or broad host access.
- `extension/media.js`: pure functions in a private extension global namespace shared by the ordered content scripts. Time formatting, duration checks, seek clamping, and keyboard target calculation. Loadable in Node tests without DOM setup.
- `extension/controller.js`: one video/controller pair. Owns the shadow DOM timeline, native media listeners, pointer/keyboard interactions, playback-state restoration, source reset detection, and deterministic `destroy()` cleanup.
- `extension/content.js`: discovery and lifecycle manager. Scans existing videos, observes added/removed subtrees with MutationObserver, and owns a Map keyed by video element. Uses IntersectionObserver and ResizeObserver to update visibility and layout. Scroll/resize updates are batched into a single requestAnimationFrame. Avoid DOM-wide scans or layout reads on every animation frame.
- `extension/icons/`: an original simple SVG icon, with no Instagram trademark logo.
- `tests/`: Node media logic tests and DOM/browser integration tests plus a reproducible local fixture for visual verification. Development dependencies are allowed but must not ship in the add-on.
- `scripts/`: repeatable source validation and packaging to `dist/instagram-scrubber-0.1.0.zip`.

The overlay host lives outside Instagram-owned video wrappers (under a single extension-owned root) and uses a shadow root to isolate styles. Controls use fixed positioning aligned to the visible video rectangle. The host is noninteractive except for the actual controls; it must not create a full-page click shield. Do not wrap or move Instagram's video elements. Do not depend on hashed classes, React internals, or private APIs.

When calculating bounds, intersect the video rectangle with the viewport and clipping scroll ancestors. Hide controls for disconnected, hidden, tiny, or fully clipped videos, or background videos covered by an unrelated modal. Do not place the control strip outside the video. Display full-screen support only when the extension overlay can actually be in the fullscreen subtree; otherwise hide it and document the limitation. Keep enough inset to avoid a native progress line at the very bottom. There is no guarantee about future Instagram caption positions; document that layout changes may require adjustment.

## State and edge cases

Discovery is idempotent. Removing a video removes its UI and disconnects listeners/observers. Re-adding it creates exactly one new controller. Observe relevant media events (`loadedmetadata`, `durationchange`, `timeupdate`, `emptied`, `loadstart`, `error`) and source changes so reused video nodes do not retain old duration or drag state. Ignore extension-root mutations to prevent observer feedback loops. Teardown on page lifecycle changes, with correct recovery from persisted page restoration if teardown happens on `pagehide`.

Valid duration is finite and positive. Seek to `[0, duration]`, constrained to the nearest seekable interval when nonempty native `seekable` ranges exist. An empty seekable list may occur before buffering, so do not permanently disable seeking solely for that reason. Catch browser media exceptions and update UI to the actual time if a seek fails. Never seek `NaN` or `Infinity`. Clamp negative/overflow input. Source identity changes cancel any pending resume. Media errors disable the timeline until a new valid source loads.

Keep progress synchronized using native media events. Use animation frames for scheduled layout only, not a permanent polling loop. Limit mutations and observers to the work needed for discovered video elements. Guard duplicate content-script initialization. No storage or network requests are required.

## Verification and delivery

Automated tests must cover duration/time boundaries; disjoint seekable ranges; click/drag and release outside the slider; playing versus paused drag state; keyboard scope; media/source reset during drag; duplicate discovery; video addition/removal/reinsertion; rejected play promises; visibility and layout updates; and no listener leaks after destroy. Test interaction in an actual browser fixture if tooling allows, not only fabricated DOM objects. The fixture must have a deterministic playable local video or generated media and controls to add/remove/reuse videos.

Run `npm test`, source/manifest validation, and packaging. Run Mozilla `web-ext lint` if available; clearly distinguish a local validator from Mozilla's linter. Inspect a browser rendering of the fixture. Attempt an isolated Firefox test profile if tools permit; do not modify the person's live browser profile. Report environment blocks and the exact scope actually verified. The source manifest is loadable through Firefox `about:debugging#/runtime/this-firefox` → Load Temporary Add-on. The ZIP is an unsigned development artifact, not a signed installable release.

README includes loading steps, usage, tests, packaging, permissions/privacy, supported surfaces, known limitations, and a manual Instagram acceptance checklist. Deliver the source path, design/plan, validation result, and concise load instructions. Publishing or store submission is not part of this request.

## Documentation consulted on October 11, 2026

- [Mozilla content scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts): content scripts can manipulate native DOM and share their extension global across ordered scripts.
- [Mozilla browser-specific settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings): Firefox ID and no-data-collection declaration.
- [Mozilla temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/): local developer loading and restart behavior.
- [OpenAI subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents): GPT-6 Luna is available as a smaller implementation agent. The parent session remains the designer/reviewer.
