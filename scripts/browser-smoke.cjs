const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath();
  const screenshot = path.resolve(__dirname, '../artifacts/fixture.png');
  fs.mkdirSync(path.dirname(screenshot), { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const fixture = pathToFileURL(path.resolve(__dirname, '../tests/fixtures/index.html')).href;
    await page.goto(fixture);
    await page.waitForFunction(() => {
      const video = document.querySelector('#primary');
      const controller = window.fixtureManager?.controllers.get(video);
      return controller && video.readyState >= 1 && !controller.input.disabled;
    });
    const primary = page.locator('#primary');
    await primary.evaluate((video) => {
      window.__playCalls = 0;
      const nativePlay = video.play.bind(video);
      video.play = (...args) => { window.__playCalls++; return nativePlay(...args); };
    });
    const inputHandle = await page.evaluateHandle(() => window.fixtureManager.controllers.get(document.querySelector('#primary')).input);
    const bounds = await inputHandle.boundingBox();
    if (!bounds) throw new Error('Timeline has no visible browser bounds');
    await page.mouse.click(bounds.x + bounds.width * 0.72, bounds.y + bounds.height / 2);
    await page.waitForTimeout(100);
    const clickedTime = await primary.evaluate((video) => video.currentTime);
    if (clickedTime < 4.5) throw new Error(`Click did not seek the local video: ${clickedTime}`);

    await inputHandle.evaluate((input) => input.focus());
    const beforeKey = await primary.evaluate((video) => video.currentTime);
    const duration = await primary.evaluate((video) => video.duration);
    await page.keyboard.press('ArrowRight');
    const afterKey = await primary.evaluate((video) => video.currentTime);
    const expectedKey = Math.min(duration, beforeKey + 5);
    if (Math.abs(afterKey - expectedKey) > 1.2) throw new Error(`Right arrow target was wrong: expected ${expectedKey}, got ${afterKey}`);

    const dragBox = await inputHandle.boundingBox();
    await primary.evaluate((video) => video.pause());
    await page.mouse.move(dragBox.x + dragBox.width * 0.30, dragBox.y + dragBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(dragBox.x + dragBox.width * 0.45, dragBox.y + dragBox.height / 2, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const pausedDragStayedPaused = await primary.evaluate((video) => video.paused);
    if (!pausedDragStayedPaused) throw new Error('A drag on a paused video started playback');

    await primary.evaluate((video) => video.play());
    await page.waitForFunction(() => !document.querySelector('#primary').paused);
    await page.mouse.move(dragBox.x + dragBox.width * 0.35, dragBox.y + dragBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(dragBox.x + dragBox.width * 0.58, dragBox.y + dragBox.height / 2, { steps: 4 });
    const pausedDuringDrag = await primary.evaluate((video) => video.paused);
    await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector('#primary').paused);
    const resumedAfterDrag = await primary.evaluate((video) => !video.paused);
    if (!pausedDuringDrag || !resumedAfterDrag) throw new Error(`Drag playback restoration failed (paused=${pausedDuringDrag}, resumed=${resumedAfterDrag})`);

    await primary.evaluate((video) => video.play());
    await page.waitForFunction(() => !document.querySelector('#primary').paused);
    const callsBeforeSourceChange = await page.evaluate(() => window.__playCalls);
    await page.mouse.move(dragBox.x + dragBox.width * 0.40, dragBox.y + dragBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(dragBox.x + dragBox.width * 0.63, dragBox.y + dragBox.height / 2, { steps: 3 });
    await page.waitForFunction(() => Boolean(window.fixtureManager.controllers.get(document.querySelector('#primary')).drag));
    await primary.evaluate((video) => { video.src = './assets/demo.webm?source=drag'; video.load(); });
    await page.waitForFunction(() => window.fixtureManager.controllers.get(document.querySelector('#primary')).drag === null);
    await page.mouse.up();
    await page.waitForTimeout(120);
    const callsAfterSourceChange = await page.evaluate(() => window.__playCalls);
    if (callsAfterSourceChange !== callsBeforeSourceChange) throw new Error('Source replacement resumed the new video during an active drag');
    await primary.evaluate((video) => { video.src = './assets/demo.webm'; video.load(); });
    await page.waitForFunction(() => { const video = document.querySelector('#primary'); return video.readyState >= 1 && !window.fixtureManager.controllers.get(video).input.disabled; });

    const beforeAdded = await page.evaluate(() => fixtureManager.controllers.size);
    await page.locator('#add').click();
    await page.waitForFunction((count) => fixtureManager.controllers.size === count + 1, beforeAdded);
    const addedVideo = await page.evaluateHandle(() => document.querySelector('#dynamic video'));
    if (!await addedVideo.evaluate((video) => window.fixtureManager.controllers.has(video))) throw new Error('Late video was not discovered');
    await page.locator('#remove').click();
    await page.waitForFunction((count) => fixtureManager.controllers.size === count, beforeAdded);

    const oldController = await page.evaluateHandle(() => fixtureManager.controllers.get(document.querySelector('#primary')));
    await page.locator('#reuse').click();
    await page.waitForFunction((old) => fixtureManager.controllers.get(document.querySelector('#primary')) !== old, oldController);

    await page.locator('#dialog').click();
    await page.waitForFunction(() => fixtureManager.controllers.get(document.querySelector('#primary')).host.hidden);
    await page.locator('#close').click();
    await page.waitForFunction(() => !fixtureManager.controllers.get(document.querySelector('#primary')).host.hidden);
    await page.screenshot({ path: screenshot, fullPage: true });
    if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
    console.log(JSON.stringify({ browser: await browser.version(), clickSeek: clickedTime, keyboardFrom: beforeKey, keyboardTarget: expectedKey, keyboardTo: afterKey, pausedDragStayedPaused, dragPaused: pausedDuringDrag, dragResumed: resumedAfterDrag, sourceReplacementDidNotResume: true, discoveredAndRemovedVideo: true, reinsertionCreatedFreshController: true, modalOcclusionHidesTimeline: true, screenshot: 'artifacts/fixture.png' }, null, 2));
    await inputHandle.dispose(); await addedVideo.dispose(); await oldController.dispose();
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
