// Real-browser play (V15, V27, V28): drives the actual UI through the gateway harness with two
// fictional accounts, checks layout at 1600/390/320 CSS px, and captures game_iamge/ screenshots.
// Usage: node tests/browser-capture.mjs   (needs Playwright; set PLAYWRIGHT_MODULE to its index.mjs)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright/index.mjs');
const root = path.resolve(import.meta.dirname, '..');
const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'cer-shots-'));
const evidence = path.join(root, 'docs/bridge-evidence');
fs.mkdirSync(evidence, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const portal = http.createServer((q, s) => { s.setHeader('content-type', 'text/html'); s.end('<title>Krilern portal stub</title><h1>Krilern portal stub</h1>'); });
await new Promise((r) => portal.listen(0, '127.0.0.1', r));
const portalUrl = `http://localhost:${portal.address().port}/`;
const SESSION = 'fixture-capture-session';
const gport = await freePort();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cer-cap-'));
const game = spawn(process.execPath, [path.join(root, 'lab/server.mjs')], { env: { PATH: process.env.PATH, PORT: String(gport), HOST: '127.0.0.1', DATA_DIR: dataDir, HOST_KEY: 'demo-host-key', LAUNCHDECK_SESSION_ID: SESSION, LAUNCHDECK_PORTAL_URL: portalUrl, LAUNCHDECK_RETURN_URL: `${portalUrl}#view=passport` }, stdio: ['ignore', 'pipe', 'inherit'] });
let out = ''; game.stdout.on('data', (d) => { out += d; });
for (let i = 0; i < 100 && !out.includes('HOST KEY'); i++) await wait(30);

const gwPort = await freePort();
const gw = http.createServer((req, res) => {
  const acct = /(?:^|; )gw=([A-Za-z0-9-]+)/.exec(req.headers.cookie || '');
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !k.startsWith('x-launchdeck-')));
  if (acct) Object.assign(headers, { 'x-launchdeck-user-id': `acct-${acct[1]}`, 'x-launchdeck-role': 'learner', 'x-launchdeck-session-id': SESSION });
  const up = http.request({ host: '127.0.0.1', port: gport, path: req.url, method: req.method, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  req.pipe(up);
});
await new Promise((r) => gw.listen(gwPort, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${gwPort}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = async (acct, viewport, scale = 1) => {
  const c = await browser.newContext({ viewport, deviceScaleFactor: scale });
  if (acct) await c.addCookies([{ name: 'gw', value: acct, domain: '127.0.0.1', path: '/' }]);
  return c;
};
const noHScroll = async (page, label) => {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(sw <= cw, `${label}: horizontal overflow ${sw} > ${cw}`);
};
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(raw, name), ...opts });
const log = [];
const step = (s) => { log.push(s); console.log('✓', s); };

try {
  // Host
  const hc = await ctx(null, { width: 1600, height: 1000 });
  const hp = await hc.newPage();
  await hp.goto(BASE + '/host');
  await hp.fill('#key', 'demo-host-key');
  await hp.click('#keyBtn');
  await hp.waitForSelector('#console:not(.hidden)');
  await hp.selectOption('#diff', 'medium');
  await hp.fill('#teams', '2');
  await hp.click('#saveBtn');
  await wait(300);
  step('host opened console with HOST KEY and chose Medium difficulty');

  // Player A desktop
  const ac = await ctx('A', { width: 1600, height: 1000 });
  const ap = await ac.newPage();
  await ap.goto(BASE + '/join');
  await ap.waitForSelector('#joinView:not(.hidden)');
  await ap.fill('#nick', 'CyberTiger');
  await shot(ap, '01-welcome.png');
  await ap.click('#joinBtn');
  await ap.waitForSelector('#waitView:not(.hidden)');
  step('account A joined as CyberTiger');

  // Player B on mobile (360x640 @3 = 1080x1920)
  const bc = await ctx('B', { width: 360, height: 640 }, 3);
  const bp = await bc.newPage();
  await bp.goto(BASE + '/join');
  await bp.waitForSelector('#joinView:not(.hidden)');
  await bp.fill('#nick', 'CyberTiger');
  await bp.selectOption('#team', '2');
  await bp.click('#joinBtn');
  await bp.waitForSelector('#waitView:not(.hidden)');
  step('account B joined with the identical nickname CyberTiger');

  await hp.click('#startBtn');
  await ap.waitForSelector('#playView:not(.hidden)', { timeout: 6000 });
  await bp.waitForSelector('#playView:not(.hidden)', { timeout: 6000 });
  step('host started the match');

  const probe = async (page, kind, vals, flag) => {
    await page.selectOption('#kind', kind);
    for (const [k, v] of Object.entries(vals)) {
      const el = page.locator('#f_' + k);
      if ((await el.evaluate((e) => e.tagName)) === 'SELECT') await el.selectOption(String(v)); else await el.fill(String(v));
    }
    await page.click('#runBtn');
    await page.waitForFunction(() => !document.getElementById('obs').textContent.startsWith('Run a probe'));
    if (flag) await page.selectOption('#flag', flag);
    await page.click('#lockBtn');
    await page.waitForFunction(() => document.getElementById('obs').textContent.includes('locked'));
  };
  const A_PROBES = [
    ['fare', { type: 'MINI', km: 10, hour: 12, promo: '' }], ['fare', { type: 'SEDAN', km: 20, hour: 12, promo: "''" }],
    ['fare', { type: 'SUV', km: 10, hour: 22, promo: 'FLAT30' }], ['fare', { type: 'SEDAN', km: 20, hour: 23, promo: 'XYZ' }, 'unknown-promo-discount'],
    ['fare', { type: 'MINI', km: 4.5, hour: 12, promo: 'NONE' }], ['fare', { type: 'SUV', km: 5.5, hour: 5, promo: '' }],
    ['book', { name: 'Riya', phone: '9876543210', type: 'MINI', km: 3, hour: 12, promo: 'FLAT30' }, 'estimate-booking-mismatch'],
    ['book', { name: 'Riya', phone: '98765432101', type: 'SEDAN', km: 100, hour: 12, promo: '' }],
    ['cancel', { type: 'SEDAN', km: 3, minutes: 5, completeFirst: 'false' }],
    ['cancel', { type: 'MINI', km: 3, minutes: 6, completeFirst: 'true' }, 'cancel-finished-ride'],
  ];
  for (const [i, [k, v, f]] of A_PROBES.entries()) {
    await probe(ap, k, v, f);
    if (i === 6) await shot(ap, '03-gameplay.png');
  }
  await ap.waitForFunction(() => document.getElementById('progressText').textContent.startsWith('10 locked'));
  step('account A locked 10 probes through the real UI (fare, book, cancel), flagging 3 suspected bugs');

  await probe(bp, 'fare', { type: 'MINI', km: 5, hour: 12, promo: '' });
  await probe(bp, 'fare', { type: 'MINI', km: 23, hour: 23, promo: 'flat30' }, 'promo-case-sensitive');
  await bp.evaluate(() => window.scrollTo(0, 0));
  await noHScroll(bp, 'mobile 360');
  await shot(bp, '06-mobile-gameplay.png');
  step('account B played on a 360x640 mobile viewport');

  // Layout checks at 390 and 320 CSS px
  for (const w of [390, 320]) {
    await ap.setViewportSize({ width: w, height: 800 });
    await wait(200);
    await noHScroll(ap, `A at ${w}`);
    const box = await ap.locator('#exitBtn').boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= w, `exit control clipped at ${w}`);
  }
  await ap.setViewportSize({ width: 1600, height: 1000 });
  step('no horizontal overflow and exit control visible at 390 and 320 CSS px');

  // Unfinished exit shows confirmation (keyboard accessible)
  await ap.focus('#exitBtn');
  await ap.keyboard.press('Enter');
  await ap.waitForSelector('#leaveDlg[open]');
  await shot(ap, '04-leave-confirmation.png');
  await ap.click('#leaveCancel');
  step('Leave game opens a confirmation by keyboard; cancelled');

  // Host console detail
  await wait(2700);
  await shot(hp, '02-host-console.png');

  // A runs the monitor
  await ap.click('#submitBtn');
  await ap.waitForSelector('#resultView:not(.hidden)');
  step('account A ran the heart monitor: ' + (await ap.textContent('#vitals')));
  hp.once('dialog', (d) => d.accept());
  await hp.click('#endBtn');
  await ap.waitForSelector('#boardWrap:not(.hidden)', { timeout: 6000 });
  await shot(ap, '05-results.png');
  step('host ended the session; final board shown');
  assert.equal((await ap.textContent('#exitBtn')).trim(), 'Return to Krilern');

  // Header at 1920x1080 (real results screen of the running game)
  await ap.setViewportSize({ width: 1920, height: 1080 });
  await wait(200);
  await shot(ap, 'header.png');
  await ap.setViewportSize({ width: 1600, height: 1000 });

  // Return to Krilern -> cross-origin portal stub in the same tab
  await ap.click('#exitBtn');
  await ap.waitForURL(`${portalUrl}#view=passport`, { timeout: 5000 });
  assert.equal(await ap.title(), 'Krilern portal stub');
  step('Return to Krilern navigated the same tab to the approved portal origin');

  const reportLine = out.split('\n').find((l) => l.startsWith('GAME REPORT'));
  assert.ok(reportLine, 'no GAME REPORT line');
  const report = JSON.parse(fs.readFileSync(path.join(dataDir, reportLine.split(': ')[1]), 'utf8'));
  fs.writeFileSync(path.join(evidence, 'browser-completed-report.json'), JSON.stringify(report, null, 2) + '\n');
  step(`report ${reportLine.split(': ')[1]} participants: ${report.participants.map((p) => `${p.displayName}/${p.launchdeckUserId}/completed=${p.completed}`).join(', ')}`);
  fs.writeFileSync(path.join(evidence, 'browser-run.log'), `UTC ${new Date().toISOString()}\n` + log.map((l) => '- ' + l).join('\n') + '\n');
  console.log('RAW_DIR=' + raw);
} finally {
  await browser.close();
  game.kill('SIGTERM'); gw.close(); portal.close();
}
