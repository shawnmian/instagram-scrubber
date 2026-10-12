# Instagram Scrubber

Instagram Scrubber is a Firefox extension that adds a compact timeline to videos on Instagram's desktop website. It supports Reels, feed videos, and video post dialogs that use ordinary HTML video elements.

## Load it in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on…**.
3. Choose `extension/manifest.json`.
4. Open `https://www.instagram.com/` and sign in as usual.

Firefox removes a temporary add-on when it restarts. Load it again after restarting. The ZIP in `dist/` is an unsigned development artifact. Firefox Add-ons Manager does not install that ZIP as a signed release.

## Use the timeline

Each supported visible video gets a seek bar near its lower edge. Click or drag to seek. A playing video pauses while you drag and resumes when you release if the same video remains visible. A paused video stays paused.

When the seek bar has focus, use **Left** or **Right** to move five seconds. Hold **Shift** to move one second. Use **Home** for the start and **End** for the end. These keys only act while the seek bar is focused.

## Privacy and permissions

The extension declares no data collection. It has no API permissions, storage, background worker, network requests, analytics, or runtime dependencies. Its content script runs only on `https://www.instagram.com/*` and `https://instagram.com/*`. It reads video timing and page layout to draw the timeline and seek the active video.

## Supported scope and limits

This first version targets desktop Firefox and HTML video on Instagram's website. It does not support Stories, live streams, mobile browsers, downloading, frame thumbnails, or native video fullscreen. Instagram may change its page layout, which can affect where the timeline appears. This project has not been verified against a signed-in live Instagram session.

## Development

The source uses plain JavaScript and Manifest V3. Node tests use `node:test`; DOM tests use jsdom. Playwright and Mozilla `web-ext` are development-only tools.

```sh
npm install
npm test
npm run validate
npm run browser:smoke
npm run lint:firefox
npm run package
```

The browser fixture is `tests/fixtures/index.html`. It uses the checked-in `tests/fixtures/assets/demo.webm`, generated locally from FFmpeg's `testsrc` pattern, and includes add, remove, reuse, source-change, clip, and dialog controls. The browser smoke command uses Playwright's cached Chromium. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use a different Chromium binary.

`npm run validate` checks the manifest, Firefox metadata, exact host allowlist, permission scope, local assets, and JavaScript syntax. `npm run package` runs validation and creates `dist/instagram-scrubber-0.1.0.zip` from the contents of `extension/` only.

## Manual Instagram acceptance checklist

After loading the temporary add-on and signing in to Instagram:

- Check a Reels video and a feed video.
- Click and drag the timeline, including releasing outside the bar.
- Confirm a paused video remains paused and a playing video resumes after a normal release.
- Check Left, Right, Shift+Left, Shift+Right, Home, and End while the timeline is focused.
- Scroll through the feed, open a video post dialog, and use Instagram's in-page navigation.
- Confirm controls disappear for removed videos, hidden videos, unrelated dialogs, and native fullscreen, then reappear where supported.
