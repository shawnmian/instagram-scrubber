const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath();
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
    const controller = () => page.evaluateHandle(() => window.fixtureManager.controllers.get(document.querySelector('#primary')));
    const inputHandle = await page.evaluateHandle(() => window.fixtureManager.controllers.get(document.querySelector('#primary')).input);
    const bounds = await inputHandle.boundingBox();
    if (!bounds) throw new Error('Timeline has no visible browser bounds');
    await page.mouse.click(bounds.x + bounds.width * 0.72, bounds.y + bounds.height / 2);
    await page.waitForTimeout(100);
    const clickedTime = await primary.evaluate((video) => video.currentTime);
    if (clickedTime < 4.5) throw new Error(`Click did not seek the local video: ${clickedTime}`);

    await inputHandle.evaluate((input) => input.focus());
    const beforeKey = await primary.evaluate((video) => video.currentTime);
    await page.keyboard.press('ArrowRight');
    const afterKey = await primary.evaluate((video) => video.currentTime);
    if (afterKey < beforeKey + 4) throw new Error(`Right arrow did not seek five seconds: ${beforeKey} -> ${afterKey}`);

    await primary.evaluate((video) => video.play());
    await page.waitForTimeout(100);
    const dragBox = await inputHandle.boundingBox();
    await page.mouse.move(dragBox.x + dragBox.width * 0.35, dragBox.y + dragBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(dragBox.x + dragBox.width * 0.58, dragBox.y + dragBox.height / 2, { steps: 4 });
    const pausedDuringDrag = await primary.evaluate((video) => video.paused);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const resumedAfterDrag = await primary.evaluate((video) => !video.paused);
    if (!pausedDuringDrag || !resumedAfterDrag) throw new Error(`Drag playback restoration failed (paused=${pausedDuringDrag}, resumed=${resumedAfterDrag})`);

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
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/fixture.png'), fullPage: true });
    await page.locator('#close').click();
    if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
    console.log(JSON.stringify({ browser: await browser.version(), clickSeek: clickedTime, keyboardFrom: beforeKey, keyboardTo: afterKey, dragPaused: pausedDuringDrag, dragResumed: resumedAfterDrag, discoveredAndRemovedVideo: true, reinsertionCreatedFreshController: true, modalOcclusionHidesTimeline: true, screenshot: 'artifacts/fixture.png' }, null, 2));
    await inputHandle.dispose(); await addedVideo.dispose(); await oldController.dispose(); await controller().then((handle) => handle.dispose());
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
