import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, devices } from 'playwright';

const url = process.env.EXODUS_URL ?? 'http://127.0.0.1:4173';
const output = resolve(process.env.EXODUS_SCREENSHOTS ?? 'test-results');
const key = 'exodus-survival-v1';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
function observe(page) {
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.location().url.endsWith('/favicon.ico')) errors.push(msg.text()); });
}
const expectText = (page, selector, text) => page.waitForFunction(
  ([s, value]) => document.querySelector(s)?.textContent.includes(value), [selector, text]
);
const heading = page => page.locator('#heading').textContent();
const save = async page => {
  if (await page.evaluate(() => !!document.pointerLockElement)) await page.keyboard.press('Escape');
  else await page.getByRole('button', { name: 'Pause game' }).click();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
};
const walk = async (page, key, match) => {
  await page.keyboard.down(key);
  try { await expectText(page, '#coords', match); } finally { await page.keyboard.up(key); }
};
async function aim(page, dx, dy) {
  await page.evaluate(([movementX, movementY]) => document.dispatchEvent(new MouseEvent('mousemove', {
    movementX, movementY, bubbles: true
  })), [dx, dy]);
}
async function begin(page) {
  await page.goto(url);
  await page.getByRole('button', { name: 'Begin survival' }).click();
  await page.locator('#hud').waitFor({ state: 'visible' });
}
async function setSnapshot(page, snapshot) {
  await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify(value)), [key, snapshot]);
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
}
async function choose(page, name) {
  await page.keyboard.press('b');
  await page.getByRole('button', { name: new RegExp('^' + name + ' [0-9] wood$') }).click();
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  observe(page);
  await begin(page);
  await page.waitForFunction(() => document.pointerLockElement?.tagName === 'CANVAS');
  await expectText(page, '#craft-tip', 'PRESS C TO CRAFT');
  await page.keyboard.press('c');
  await page.getByRole('heading', { name: 'Workbench crafting' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Stone axe 3 wood/ }).isEnabled(), false);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.waitForFunction(() => document.pointerLockElement?.tagName === 'CANVAS');
  const initial = await heading(page);
  await aim(page, -100, 0);
  await page.waitForFunction(original => document.querySelector('#heading').textContent !== original, initial);
  await aim(page, 100, 0);
  await walk(page, 'w', '/ -6 N');
  await page.keyboard.down('Shift');
  await walk(page, 'w', '/ -5 N');
  await page.keyboard.up('Shift');
  assert.ok(await page.locator('#stamina').evaluate(e => e.value) < 100);
  await page.keyboard.press('Space');
  await page.waitForTimeout(115);
  assert.ok(await page.locator('#stamina').evaluate(e => e.value) < 100);
  const moved = await save(page);
  assert.ok(moved.z < 6);
  assert.ok(moved.hunger < 96 && moved.thirst < 92);

  await setSnapshot(page, { ...moved, x: -2, z: 5.8, yaw: Math.atan2(1, 2), pitch: 0 });
  await expectText(page, '#prompt', 'Chop timber');
  await page.keyboard.press('c');
  await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor();
  assert.equal(await page.locator('#panel').getByRole('button', { name: /^Stone axe/ }).count(), 0);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.keyboard.press('e');
  await expectText(page, '#stock', 'WOOD 3');
  for (let i = 0; i < 3; i++) await page.keyboard.press('e');
  await expectText(page, '#notice', 'Tree felled');
  let s = await save(page);
  assert.equal(s.nodes[0], 0);
  assert.equal(s.wood, 12);

  await setSnapshot(page, { ...s, x: 3.3, z: 6.75, yaw: 0, pitch: -.52 });
  await expectText(page, '#prompt', 'Gather stone');
  for (let i = 0; i < 3; i++) await page.keyboard.press('e');
  await expectText(page, '#stock', 'STONE 6');
  await page.keyboard.press('c');
  await page.getByRole('button', { name: /^Stone axe 3 wood/ }).click();
  await expectText(page, '#notice', 'Stone axe crafted');
  await page.screenshot({ path: resolve(output, 'exodus-axe.png') });
  await page.keyboard.press('c');
  await page.getByRole('button', { name: /^Stone pickaxe 4 wood/ }).click();
  await expectText(page, '#notice', 'Stone pickaxe crafted');
  await page.screenshot({ path: resolve(output, 'exodus-pickaxe.png') });
  s = await save(page);
  assert.equal(s.axe && s.pick, true);
  assert.equal(s.wood, 5);
  assert.equal(s.stone, 1);

  // Start a construction scenario with enough timber for every piece.
  await setSnapshot(page, { ...s, x: 0, z: 7.25, yaw: 0, pitch: -.27, wood: 26 });
  await choose(page, 'Foundation');
  await expectText(page, '#watch-name', 'Foundation');
  await page.keyboard.press(']');
  await expectText(page, '#watch-name', 'Wall');
  await page.keyboard.press('[');
  await expectText(page, '#watch-name', 'Foundation');
  await page.screenshot({ path: resolve(output, 'exodus-watch.png') });
  await expectText(page, '#prompt', 'Ready to place');
  await page.keyboard.press('e');
  await expectText(page, '#notice', 'Foundation placed');
  await expectText(page, '#prompt', 'already occupies');
  await choose(page, 'Wall');
  await expectText(page, '#prompt', 'Ready to place');
  await page.keyboard.press('e');
  await expectText(page, '#notice', 'Wall placed');
  await choose(page, 'Doorframe');
  for (let i = 0; i < 2; i++) await page.keyboard.press('r');
  await expectText(page, '#prompt', 'Ready to place');
  await page.keyboard.press('e');
  await expectText(page, '#notice', 'Doorframe placed');
  await choose(page, 'Door');
  await expectText(page, '#prompt', 'Ready to place');
  await page.keyboard.press('e');
  await expectText(page, '#notice', 'Door placed');
  await choose(page, 'Roof');
  await expectText(page, '#prompt', 'Ready to place');
  await page.keyboard.press('e');
  await expectText(page, '#notice', 'Roof placed');
  await page.keyboard.press('1');
  await expectText(page, '#prompt', 'Open door');
  await page.keyboard.press('e');
  await expectText(page, '#notice', 'Door opened');
  await walk(page, 'w', '/ -4 N');
  s = await save(page);
  assert.deepEqual(s.pieces.map(p => p.type), ['foundation', 'wall', 'frame', 'door', 'roof']);
  assert.equal(s.pieces.find(p => p.type === 'frame').rotation, 2);
  assert.equal(s.pieces.find(p => p.type === 'door').open, true);
  await setSnapshot(page, { ...s, x: 0, z: 8, yaw: 0, pitch: -.03 });
  await page.screenshot({ path: resolve(output, 'exodus-desktop.png') });
  await page.reload();
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await expectText(page, '#objective', 'Extend your shelter');
  assert.equal((await save(page)).pieces.length, 5);
  await page.close();
  console.log('Desktop: movement, sprint, jump, look, harvesting, both tools, all five pieces, door and persistence passed.');

  const mobile = await browser.newPage({ ...devices['iPhone 13 landscape'], defaultBrowserType: 'chromium' });
  observe(mobile);
  await begin(mobile);
  const cdp = await mobile.context().newCDPSession(mobile);
  async function swipe(points, hold = 0) {
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }]
    });
    await touch('touchStart', ...points[0]);
    for (const p of points.slice(1)) await touch('touchMove', ...p);
    if (hold) await mobile.waitForTimeout(hold);
    await touch('touchEnd');
  }
  const joystick = await mobile.locator('#stick').boundingBox();
  assert.ok(joystick);
  const sx = Math.round(joystick.x + joystick.width / 2), sy = Math.round(joystick.y + joystick.height / 2);
  await swipe([[sx, sy], [sx, sy - 39]], 900);
  const oldHeading = await heading(mobile);
  await swipe([[530, 145], [560, 150], [595, 155]]);
  await mobile.waitForFunction(original => document.querySelector('#heading').textContent !== original, oldHeading);
  await mobile.getByRole('button', { name: 'JUMP', exact: true }).tap();
  await mobile.getByRole('button', { name: 'CRAFT', exact: true }).tap();
  await mobile.locator('#panel').waitFor({ state: 'visible' });
  await mobile.getByRole('button', { name: 'Close panel' }).tap();
  await mobile.getByRole('button', { name: 'BUILD', exact: true }).tap();
  await mobile.getByRole('button', { name: /^Foundation 4 wood$/ }).tap();
  await expectText(mobile, '#prompt', 'Foundation');
  await mobile.getByRole('button', { name: 'Next blueprint' }).tap();
  await expectText(mobile, '#watch-name', 'Wall');
  await mobile.getByRole('button', { name: 'Previous blueprint' }).tap();
  await expectText(mobile, '#watch-name', 'Foundation');
  await mobile.getByRole('button', { name: 'ROTATE', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Hands', exact: true }).tap();
  const mobileState = await save(mobile);
  assert.ok(mobileState.z < 7, 'Virtual joystick moved the survivor');
  await setSnapshot(mobile, { ...mobileState, x: -2, z: 5.8, yaw: Math.atan2(1, 2), pitch: 0 });
  await expectText(mobile, '#prompt', 'Chop timber');
  await mobile.getByRole('button', { name: 'GATHER', exact: true }).tap();
  await expectText(mobile, '#stock', 'WOOD 3');
  await mobile.waitForTimeout(300);
  const fallbackPage = await browser.newPage({ viewport: { width: 800, height: 480 } });
  observe(fallbackPage);
  await fallbackPage.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new Error('Browser blocks pointer lock'));
  });
  await begin(fallbackPage);
  await expectText(fallbackPage, '#notice', 'Hold it near either side');
  const fallbackHeading = await heading(fallbackPage);
  await fallbackPage.mouse.move(390, 195);
  await fallbackPage.mouse.move(515, 195);
  await fallbackPage.waitForFunction(original => document.querySelector('#heading').textContent !== original, fallbackHeading);
  // Track unwrapped compass travel using actual mouse movement and on-screen updates.
  await fallbackPage.evaluate(() => {
    const compass = document.querySelector('#heading');
    const degrees = () => Number(compass.textContent.match(/(\d+)°/)[1]);
    let last = degrees();
    window.compassTravel = 0;
    new MutationObserver(() => {
      const current = degrees();
      window.compassTravel += (current - last + 540) % 360 - 180;
      last = current;
    }).observe(compass, { childList: true });
  });
  await fallbackPage.mouse.move(798, 195);
  await fallbackPage.waitForFunction(() => window.compassTravel > 370);
  await fallbackPage.mouse.move(400, 195);
  await fallbackPage.waitForTimeout(160);
  const centerHeading = await heading(fallbackPage);
  await fallbackPage.waitForTimeout(260);
  assert.equal(await heading(fallbackPage), centerHeading, 'Edge turning stops when the cursor returns to the center');
  await fallbackPage.mouse.move(2, 195);
  const leftStart = await fallbackPage.evaluate(() => window.compassTravel);
  await fallbackPage.waitForFunction(start => window.compassTravel < start - 370, leftStart);
  await fallbackPage.close();
  console.log('Mouse look: over 360° in both directions with pointer lock denied.');
  await mobile.screenshot({ path: resolve(output, 'exodus-mobile.png') });
  console.log('Mobile landscape: joystick, swipe look, jump, pack, blueprint, rotation and gather passed.');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
