# Instagram Scrubber

Instagram Scrubber is a Firefox extension that adds a compact timeline to videos on Instagram's desktop website. It targets Reels, feed videos, and video post dialogs that use ordinary HTML video elements; these live Instagram surfaces still need manual verification.

## Load it in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on…**.
3. Choose `extension/manifest.json`.
4. Refresh any Instagram tabs that were already open, then open `https://www.instagram.com/` and sign in as usual.

Firefox removes a temporary add-on when it restarts. Load it again after restarting. The ZIP in `dist/` is an unsigned development artifact. Firefox Add-ons Manager does not install that ZIP as a signed release.

## Use the timeline

Each supported visible video gets a control bar near its lower edge. The bar appears while the pointer is over the video and hides when the pointer leaves. Keyboard focus keeps the controls visible.

Use the timeline to seek. A playing video pauses while you drag and resumes when you release if the same video remains visible. A paused video stays paused. Select the speaker icon to mute or unmute. Hover or focus the speaker to open the vertical volume slider; its maximum is at the top. Setting volume to zero mutes the video. If you unmute from zero, the control restores the last positive volume, or 50% if no positive level was set. Volume changes do not seek or change playback.

The speaker replaces Instagram's sound button, which is hidden while the control bar shows. Muting and unmuting go through Instagram's own button, so Instagram keeps the same setting when playback restarts. The volume you choose applies to every video on the page, and Instagram cannot reset it. This relies on Instagram's English labels for its sound icon (`Audio is muted` and `Audio is playing`). If Instagram uses a different language or changes the labels, the speaker still works on the current video, but Instagram may mute it again when playback restarts.

When the seek bar has focus, use **Left** or **Right** to move five seconds. Hold **Shift** to move one second. Use **Home** for the start and **End** for the end. These keys only act while the seek bar is focused.

## Privacy and permissions

The extension declares no data collection. It has no API permissions, storage, background worker, network requests, analytics, or runtime dependencies. Its content script runs only on `https://www.instagram.com/*` and `https://instagram.com/*`. It reads video timing and page layout to draw the timeline and seek the active video.

## Supported scope and limits

This first version targets desktop Firefox and HTML video on Instagram's website. It does not support Stories, live streams, mobile browsers, downloading, frame thumbnails, or native video fullscreen. Instagram may change its page layout, which can affect where the timeline appears. This project has not been verified against a signed-in live Instagram session.

## Development

The source uses plain JavaScript and Manifest V3. Node tests use `node:test`; DOM tests use jsdom. Playwright and Mozilla `web-ext` are development-only tools.

```sh
npm install
npx playwright install chromium
npm test
npm run validate
npm run browser:smoke
npm run lint:firefox
npm run package
```

After `npm install`, run `npx playwright install chromium` to install the browser used by the smoke script. The browser fixture is `tests/fixtures/index.html`. It uses the checked-in `tests/fixtures/assets/demo.webm`, generated locally from FFmpeg's `testsrc` pattern, and includes add, remove, reuse, source-change, clip, and dialog controls. The browser smoke command uses Playwright's cached Chromium. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use a different Chromium binary.

`npm run validate` checks the manifest, Firefox metadata, exact host allowlist, permission scope, local assets, and JavaScript syntax. `npm run package` runs validation and creates `dist/instagram-scrubber-0.1.0.zip` from the contents of `extension/` only.

## Manual Instagram acceptance checklist

After loading the temporary add-on and signing in to Instagram:

- Check a Reels video and a feed video.
- Click and drag the timeline, including releasing outside the bar.
- Confirm a paused video remains paused and a playing video resumes after a normal release.
- Check Left, Right, Shift+Left, Shift+Right, Home, and End while the timeline is focused.
- Confirm the bar hides when the pointer leaves the video and remains available with keyboard focus.
- Check the vertical volume slider, mute toggle, zero-volume restore, and keyboard volume controls.
- Scroll through the feed, open a video post dialog, and use Instagram's in-page navigation.
- Confirm controls disappear for removed videos, hidden videos, unrelated dialogs, and native fullscreen, then reappear where supported.
