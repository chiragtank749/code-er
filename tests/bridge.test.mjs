// Krilern bridge verification against the REAL server process (HTTP paths, engine, persistence).
// Uses an integration-only local gateway harness; it is never part of production.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { validateReport } from '../tools/launchdeck-report.mjs';
import { resolveReturnUrl as resolveReturnUrlForTest } from '../lab/return-url.mjs';
import { rating, DIFFICULTIES } from '../lab/engine.mjs';

const root = path.resolve(import.meta.dirname, '..');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'metadata.json'), 'utf8'));
const sidecar = JSON.parse(fs.readFileSync(path.join(root, 'launchdeck.skills.json'), 'utf8'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

async function startGame(extraEnv = {}, dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cer-'))) {
  const port = await freePort();
  const env = { PATH: process.env.PATH, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, ...extraEnv };
  const proc = spawn(process.execPath, [path.join(root, 'lab/server.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const g = { proc, port, dataDir, stdout: '', stderr: '', base: `http://127.0.0.1:${port}` };
  proc.stdout.on('data', (d) => { g.stdout += d; });
  proc.stderr.on('data', (d) => { g.stderr += d; });
  for (let i = 0; i < 100 && !g.stdout.includes('HOST KEY'); i++) await wait(30);
  assert.ok(g.stdout.includes('HOST KEY'), `server did not start: ${g.stderr}`);
  g.exited = new Promise((r) => proc.on('exit', (code, sig) => r({ code, sig })));
  g.stop = async (sig = 'SIGTERM') => { proc.kill(sig); return g.exited; };
  return g;
}

// Gateway harness: strips client x-launchdeck-* headers and injects the test session's identity.
async function startGateway(target, sessionId) {
  const port = await freePort();
  const server = http.createServer((req, res) => {
    const acct = /(?:^|; )gw=([A-Za-z0-9-]+)/.exec(req.headers.cookie || '');
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !k.startsWith('x-launchdeck-')));
    if (acct) { headers['x-launchdeck-user-id'] = `acct-${acct[1]}`; headers['x-launchdeck-role'] = 'learner'; headers['x-launchdeck-session-id'] = sessionId; }
    const up = http.request({ host: '127.0.0.1', port: target.port, path: req.url, method: req.method, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

class Client {
  constructor(base, account) { this.base = base; this.jar = account ? { gw: account } : {}; }
  async req(method, p, body, headers = {}) {
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    const r = await fetch(this.base + p, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) { const [kv] = sc.split(';'); const [k, v] = kv.split('='); this.jar[k] = v; }
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* text */ }
    return { status: r.status, json, text };
  }
  get(p, h) { return this.req('GET', p, null, h); }
  post(p, b = {}, h) { return this.req('POST', p, b, h); }
}
const hk = (key) => ({ 'x-host-key-b64': Buffer.from(key, 'utf8').toString('base64url') });
const host = (g, key) => ({
  get: (p) => fetch(g.base + p, { headers: hk(key) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) })),
  post: (p, b = {}) => fetch(g.base + p, { method: 'POST', headers: { ...hk(key), 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) })),
});

// A strong easy-level probe set (kills all 8 easy mutants) and a weak one.
const STRONG = [
  { type: 'MINI', km: 10, hour: 12, promo: '' }, { type: 'SEDAN', km: 20, hour: 12, promo: '' }, { type: 'SUV', km: 10, hour: 22, promo: '' },
  { type: 'SUV', km: 10, hour: 12, promo: 'FLAT30' }, { type: 'SEDAN', km: 20, hour: 12, promo: 'XYZ' }, { type: 'MINI', km: 4.5, hour: 12, promo: '' },
  { type: 'SUV', km: 5.5, hour: 12, promo: 'XYZ' }, { type: 'SEDAN', km: 7, hour: 23, promo: 'XYZ' },
];
const WEAK = [1, 2, 3, 4, 5].map((km) => ({ type: 'MINI', km, hour: 12, promo: '' }));
async function lockAll(c, inputs, flags = {}) {
  for (const [i, input] of inputs.entries()) {
    const r = await c.post('/api/probe/lock', { kind: 'fare', input, flag: flags[i] || null });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
}
const reports = (g) => fs.readdirSync(path.join(g.dataDir, 'reports')).filter((f) => f.endsWith('.json'));
const readReport = (g, f) => JSON.parse(fs.readFileSync(path.join(g.dataDir, 'reports', f), 'utf8'));
const assertValid = (r, sessionId) => assert.deepEqual(validateReport(r, { metadata, sidecar, sessionId }), []);

test('V01/V02 standalone boot, stdout contract, null identity', async () => {
  const key = '  key with spaces ';
  const g = await startGame({ HOST_KEY: key, PUBLIC_URL: 'https://game.example.test' });
  try {
    assert.equal(g.stdout, `HOST LINK   : https://game.example.test/host\nPLAYER LINK : https://game.example.test/join\nHOST KEY    : ${key}\n`);
    assert.equal((await fetch(g.base + '/healthz')).status, 200);
    const h = host(g, key);
    assert.equal((await h.post('/api/host/start')).status, 200);
    const c = new Client(g.base);
    // Identity headers are ignored on a standalone server.
    assert.equal((await c.post('/api/join', { nickname: 'Solo', team: 1, userId: 'acct-X' }, { 'x-launchdeck-user-id': 'acct-X' })).status, 200);
    await lockAll(c, STRONG);
    assert.equal((await c.post('/api/submit')).status, 200);
    assert.equal((await h.post('/api/host/end')).status, 200);
    const [f] = reports(g);
    const r = readReport(g, f);
    assertValid(r, null);
    assert.equal(r.participants[0].launchdeckUserId, null);
    assert.equal(r.session.launchdeckSessionId, null);
    assert.ok(g.stdout.endsWith(`GAME REPORT : reports/${f}\n`));
    assert.equal(g.stderr, '');
    const dl = await fetch(g.base + '/api/host/report', { headers: hk(key) });
    assert.equal(dl.status, 200);
    // default key is a 12-char alphanumeric when HOST_KEY is absent
    const g2 = await startGame();
    assert.match(g2.stdout.split('\n')[2], /^HOST KEY {4}: [A-Za-z0-9]{12}$/);
    await g2.stop();
  } finally { await g.stop(); }
});

test('V03 every host operation requires the host key', async () => {
  const g = await startGame({ HOST_KEY: 'right' });
  try {
    const player = new Client(g.base);
    const ops = [['GET', '/api/host/state'], ['GET', '/api/host/report'], ['POST', '/api/host/configure'], ['POST', '/api/host/start'], ['POST', '/api/host/end'], ['POST', '/api/host/new-match']];
    for (const [m, p] of ops) {
      assert.equal((await player.req(m, p, m === 'POST' ? {} : null)).status, 401, `${p} no key`);
      assert.equal((await player.req(m, p, m === 'POST' ? {} : null, hk('wrong'))).status, 401, `${p} wrong key`);
      assert.equal((await player.req(m, p, m === 'POST' ? {} : null, { 'x-launchdeck-role': 'host' })).status, 401, `${p} role header`);
    }
    assert.equal((await fetch(g.base + '/api/host/state?key=right')).status, 401);
    assert.equal((await fetch(g.base + '/api/host/state', { headers: { 'x-host-key': 'right' } })).status, 401);
    assert.equal((await fetch(g.base + '/api/host/state', { headers: hk('right') })).status, 200);
  } finally { await g.stop(); }
});

test('integrated play through the gateway (V04-V13, V15, V17-V19, V24)', async (t) => {
  const SESSION = 'fixture-session-001';
  const portal = http.createServer((q, s) => { s.end('portal'); });
  await new Promise((r) => portal.listen(0, '127.0.0.1', r));
  const portalUrl = `http://localhost:${portal.address().port}/`;
  const env = { HOST_KEY: 'hk', LAUNCHDECK_SESSION_ID: SESSION, LAUNCHDECK_PORTAL_URL: portalUrl, LAUNCHDECK_RETURN_URL: `${portalUrl}#view=passport` };
  let g = await startGame(env);
  let gw = await startGateway(g, SESSION);
  const h = () => host(g, 'hk');
  const A = new Client(gw.base, 'A'); const B = new Client(gw.base, 'B'); const C = new Client(gw.base, 'C'); const D = new Client(gw.base, 'D');
  try {
    await t.test('V24 settings configurable in lobby, then locked', async () => {
      assert.equal((await h().post('/api/host/configure', { difficulty: 'easy', teamCount: 2 })).status, 200);
      assert.equal((await h().post('/api/host/start')).status, 200);
      assert.equal((await h().post('/api/host/configure', { difficulty: 'hard', teamCount: 2 })).status, 409);
    });
    await t.test('V04 identical nicknames, distinct accounts', async () => {
      assert.equal((await A.post('/api/join', { nickname: 'Sam', team: 1 })).status, 200);
      assert.equal((await B.post('/api/join', { nickname: 'Sam', team: 2 })).status, 200);
      assert.equal((await C.post('/api/join', { nickname: 'Idle', team: 1 })).status, 200);
      assert.equal((await D.post('/api/join', { nickname: 'Leaver', team: 2 })).status, 200);
      const s = await A.get('/api/state');
      assert.equal(s.json.me.linked, true);
    });
    await t.test('V15 approved return destination exposed', async () => {
      const s = await A.get('/api/state?returnUrl=https://evil.example');
      assert.equal(s.json.returnUrl, `${portalUrl}#view=passport`);
    });
    await t.test('V05 rename keeps ownership', async () => {
      await lockAll(A, STRONG.slice(0, 2));
      assert.equal((await A.post('/api/nickname', { nickname: 'Samira' })).status, 200);
      const s = await A.get('/api/state');
      assert.equal(s.json.me.nickname, 'Samira');
      assert.equal(s.json.me.probes.length, 2);
    });
    await t.test('V06 spoofed identity header/body/query cannot switch account', async () => {
      const r = await A.post('/api/probe/lock?userId=acct-B', { kind: 'fare', input: STRONG[2], userId: 'acct-B' }, { 'x-launchdeck-user-id': 'acct-B' });
      assert.equal(r.status, 200);
      assert.equal((await A.get('/api/state')).json.me.probes.length, 3);
      assert.equal((await B.get('/api/state')).json.me.probes.length, 0);
    });
    await t.test('V08 B cannot use A seat token', async () => {
      const thief = new Client(gw.base, 'B'); thief.jar.cer_seat = A.jar.cer_seat;
      assert.equal((await thief.get('/api/state')).status, 403);
      assert.equal((await thief.post('/api/probe/lock', { kind: 'fare', input: STRONG[3] })).status, 403);
      // a guest (no gateway account) with A's token is refused too (lost auth cannot switch seat)
      const guest = new Client(gw.base); guest.jar.cer_seat = A.jar.cer_seat;
      assert.equal((await guest.get('/api/state')).status, 403);
    });
    await t.test('V09 second tab resumes the same seat', async () => {
      const A2 = new Client(gw.base, 'A');
      const j = await A2.post('/api/join', { nickname: 'Other', team: 2 });
      assert.equal(j.json.resumed, true);
      const s = await A2.get('/api/state');
      assert.equal(s.json.me.nickname, 'Samira');
      assert.equal(s.json.me.probes.length, 3);
    });
    await t.test('V14 failed durable save is not acknowledged; retry works without duplicates', async () => {
      const fault = path.join(g.dataDir, 'FAULT');
      await g.stop('SIGKILL'); await gw.close();
      g = await startGame({ ...env, CODEER_FAULT_FILE: fault }, g.dataDir); gw = await startGateway(g, SESSION);
      A.base = B.base = C.base = D.base = gw.base;
      fs.writeFileSync(fault, '1');
      const r = await A.post('/api/probe/lock', { kind: 'fare', input: STRONG[3] });
      assert.equal(r.status, 503);
      assert.equal((await A.get('/api/state')).json.me.probes.length, 3);
      fs.unlinkSync(fault);
      assert.equal((await A.post('/api/probe/lock', { kind: 'fare', input: STRONG[3] })).status, 200);
      assert.equal((await A.post('/api/probe/lock', { kind: 'fare', input: STRONG[3] })).json.duplicate, true);
      assert.equal((await A.get('/api/state')).json.me.probes.length, 4);
    });
    await t.test('V10 abrupt restart preserves seat and accepted actions', async () => {
      await g.stop('SIGKILL'); await gw.close();
      g = await startGame(env, g.dataDir); gw = await startGateway(g, SESSION);
      A.base = B.base = C.base = D.base = gw.base;
      const s = await A.get('/api/state');
      assert.equal(s.json.match.status, 'running');
      assert.equal(s.json.me.probes.length, 4);
    });
    await t.test('V12 early leave saves once, others unaffected', async () => {
      await lockAll(D, WEAK.slice(0, 2));
      const l1 = await D.post('/api/leave'); const l2 = await D.post('/api/leave');
      assert.equal(l1.json.saved, true); assert.equal(l1.json.completed, false); assert.equal(l1.json.returnUrl, `${portalUrl}#view=passport`);
      assert.equal(l2.json.saved, true);
      assert.equal((await D.post('/api/probe/lock', { kind: 'fare', input: WEAK[3] })).status, 409);
      assert.equal((await B.post('/api/probe/lock', { kind: 'fare', input: WEAK[0] })).status, 200);
      assert.equal((await A.get('/api/state')).json.match.status, 'running');
    });
    await t.test('V13 completed player returns, completion kept', async () => {
      await lockAll(A, STRONG.slice(4), { 0: 'unknown-promo-discount', 3: 'night-suv-only' });
      assert.equal((await A.post('/api/submit')).status, 200);
      assert.equal((await A.post('/api/submit')).json.already, true);
      const l = await A.post('/api/leave');
      assert.equal(l.json.completed, true);
      // B completes with a weak net: rank 1 among completed is not a win (V17)
      await lockAll(B, WEAK.slice(1));
      assert.equal((await B.post('/api/submit')).status, 200);
    });
    await t.test('V18/V11/V17/V04 final report through real actions', async () => {
      assert.equal((await h().post('/api/host/end')).status, 200);
      const files = reports(g);
      assert.equal(files.length, 1);
      const r = readReport(g, files[0]);
      assertValid(r, SESSION);
      const by = Object.fromEntries(r.participants.map((p) => [p.launchdeckUserId, p]));
      assert.deepEqual(Object.keys(by).sort(), ['acct-A', 'acct-B', 'acct-C', 'acct-D']);
      assert.equal(by['acct-A'].displayName, 'Samira');
      assert.equal(by['acct-B'].displayName, 'Sam');
      // A: completed, won, all 8 caught, 2 of 3 bugs
      assert.equal(by['acct-A'].completed, true);
      assert.equal(by['acct-A'].metrics.bridgeLeftEarly, false);
      assert.equal(by['acct-A'].metrics.bridgeWon, true);
      assert.equal(by['acct-A'].metrics['sk_test-design_successes'], 8);
      assert.equal(by['acct-A'].metrics['sk_test-design_rating'], 5);
      assert.equal(by['acct-A'].metrics['sk_error-detection_successes'], 2);
      assert.equal(by['acct-A'].metrics['sk_error-detection_rating'], 3);
      assert.equal(by['acct-A'].metrics.bridgeDifficulty, 1);
      assert.equal(by['acct-A'].metrics.bridgeSkillLevel, 1);
      assert.deepEqual(by['acct-A'].skills.map((s) => s.skillId).sort(), ['attention-to-detail', 'test-design']);
      // V17: B completed but did not meet the objective
      assert.equal(by['acct-B'].completed, true);
      assert.equal(by['acct-B'].metrics.bridgeWon, false);
      // V11: idle C, no completion, no evidence
      assert.equal(by['acct-C'].completed, false);
      assert.deepEqual(by['acct-C'].skills, []);
      assert.equal(by['acct-C'].metrics['sk_test-design_observations'], 0);
      assert.equal(by['acct-C'].metrics['sk_test-design_rating'], undefined);
      // V12: D left early
      assert.equal(by['acct-D'].completed, false);
      assert.equal(by['acct-D'].metrics.bridgeLeftEarly, true);
      // silent teammate C does not inherit A's evidence; teams carry the union
      assert.equal(r.teams.find((x) => x.teamId === 't1').score, 8);
      // every sidecar metric is actually produced
      for (const d of [sidecar.primarySkill, ...sidecar.secondarySkills]) for (const mName of d.metrics) assert.ok(mName in by['acct-A'].metrics, mName);
      assert.ok(g.stdout.includes(`GAME REPORT : reports/${files[0]}`));
      if (process.env.BRIDGE_EVIDENCE_DIR) fs.writeFileSync(path.join(process.env.BRIDGE_EVIDENCE_DIR, 'integrated-completed-report.json'), JSON.stringify(r, null, 2) + '\n');
    });
    await t.test('V19 immutable: double end, leave after end and restart keep one report', async () => {
      const [f] = reports(g);
      const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(g.dataDir, 'reports', f))).digest('hex');
      await h().post('/api/host/end');
      await B.post('/api/leave');
      await g.stop('SIGTERM'); await gw.close();
      g = await startGame(env, g.dataDir); gw = await startGateway(g, SESSION);
      B.base = gw.base;
      await wait(100);
      assert.deepEqual(reports(g), [f]);
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(g.dataDir, 'reports', f))).digest('hex'), hash);
      assert.equal((await B.get('/api/state')).json.match.status, 'ended');
      assert.equal((await B.post('/api/probe/lock', { kind: 'fare', input: WEAK[0] })).status, 409);
      // new match gets a new report id
      assert.equal((await h().post('/api/host/new-match')).status, 200);
    });
    await t.test('V25 local validator rejects bad provenance (local-only)', async () => {
      const r = readReport(g, reports(g)[0]);
      const bad = [
        (x) => { x.session.launchdeckSessionId = 'other'; },
        (x) => { x.game.gameVersion = '0.0.1'; },
        (x) => { x.participants[1].launchdeckUserId = x.participants[0].launchdeckUserId; },
        (x) => { x.participants[0].skills.push({ skillId: 'leadership', type: 'interpersonal', rating: 3, evidence: 'x' }); },
        (x) => { x.reportId = 'not-a-uuid'; },
        (x) => { x.participants[0].metrics['sk_test-design_successes'] = 99; },
        (x) => { x.participants[0].extra = 1; },
      ];
      for (const mut of bad) { const x = structuredClone(r); mut(x); assert.ok(validateReport(x, { metadata, sidecar, sessionId: SESSION }).length > 0); }
    });
    await t.test('session identity conflict rejected', async () => {
      const r = await fetch(g.base + '/api/state', { headers: { 'x-launchdeck-session-id': 'other-session' } });
      assert.equal(r.status, 409);
    });
  } finally { await g.stop(); await gw.close(); portal.close(); }
});

test('V24 every difficulty records its code and level; complex accepts all probe kinds', async () => {
  const levels = { easy: [1, 1], medium: [2, 2], hard: [3, 3], complex: [4, 3] };
  for (const [diff, [code, level]] of Object.entries(levels)) {
    const g = await startGame({ HOST_KEY: 'k' });
    try {
      const h = host(g, 'k');
      await h.post('/api/host/configure', { difficulty: diff, teamCount: 1 });
      await h.post('/api/host/start');
      const c = new Client(g.base);
      await c.post('/api/join', { nickname: 'P', team: 1 });
      const need = DIFFICULTIES[diff].requiredProbes;
      for (let i = 0; i < need; i++) assert.equal((await c.post('/api/probe/lock', { kind: 'fare', input: { type: 'SUV', km: i + 1, hour: 12, promo: '' } })).status, 200);
      const other = diff === 'easy' ? 400 : 200;
      assert.equal((await c.post('/api/probe/lock', { kind: 'register', input: { name1: 'Ann', type1: 'MINI', name2: 'ann', type2: 'MINI' }, flag: 'duplicate-driver-case' })).status, diff === 'hard' || diff === 'complex' ? 200 : 400);
      assert.equal((await c.post('/api/probe/run', { kind: 'book', input: { name: 'R', phone: '9876543210', type: 'MINI', km: 3, hour: 12, promo: 'FLAT30' } })).status, other);
      assert.equal((await c.post('/api/submit')).status, 200);
      await h.post('/api/host/end');
      const r = readReport(g, reports(g)[0]);
      assertValid(r, null);
      assert.equal(r.participants[0].metrics.bridgeDifficulty, code);
      assert.equal(r.participants[0].metrics.bridgeSkillLevel, level);
      assert.equal(r.participants[0].metrics['sk_test-design_level'], level);
      assert.equal(r.participants[0].metrics['sk_test-design_observations'], DIFFICULTIES[diff].mutants.length);
      assert.equal(r.participants[0].metrics.bridgeRequiredUnits, need + 1);
      assert.equal(r.participants[0].metrics.bridgeCompletedUnits, need + 1);
    } finally { await g.stop(); }
  }
});

test('V20 SIGTERM mid-match writes a bounded abandoned report, keeps completed players', async () => {
  const g = await startGame({ HOST_KEY: 'k' });
  const h = host(g, 'k');
  await h.post('/api/host/start');
  const done = new Client(g.base); const mid = new Client(g.base);
  await done.post('/api/join', { nickname: 'Done', team: 1 });
  await mid.post('/api/join', { nickname: 'Mid', team: 2 });
  await lockAll(done, STRONG); await done.post('/api/submit');
  await lockAll(mid, WEAK.slice(0, 2));
  const t0 = Date.now();
  await g.stop('SIGTERM');
  assert.ok(Date.now() - t0 < 2000);
  const [f] = reports(g);
  const r = readReport(g, f);
  assertValid(r, null);
  assert.equal(r.session.outcome, 'abandoned');
  const by = Object.fromEntries(r.participants.map((p) => [p.displayName, p]));
  assert.equal(by.Done.completed, true);
  assert.equal(by.Mid.completed, false);
  if (process.env.BRIDGE_EVIDENCE_DIR) fs.writeFileSync(path.join(process.env.BRIDGE_EVIDENCE_DIR, 'abandoned-report.json'), JSON.stringify(r, null, 2) + '\n');
  // after restart the finalized match is terminal
  const g2 = await startGame({ HOST_KEY: 'k' }, g.dataDir);
  try {
    mid.base = g2.base;
    assert.equal((await mid.post('/api/probe/lock', { kind: 'fare', input: WEAK[3] })).status, 409);
    assert.deepEqual(reports(g2), [f]);
  } finally { await g2.stop(); }
});

test('V21 report write failure retries with the same id; capacity bound enforced', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cer-'));
  const fault = path.join(dataDir, 'FAULT');
  const g = await startGame({ HOST_KEY: 'k', CODEER_FAULT_FILE: fault }, dataDir);
  try {
    const h = host(g, 'k');
    await h.post('/api/host/start');
    const c = new Client(g.base);
    await c.post('/api/join', { nickname: 'P', team: 1 });
    await lockAll(c, STRONG); await c.post('/api/submit');
    fs.writeFileSync(fault, '1');
    const e = await h.post('/api/host/end');
    assert.equal(e.status, 503);
    assert.deepEqual(reports(g), []);
    fs.unlinkSync(fault);
    const e2 = await h.post('/api/host/end');
    assert.equal(e2.status, 200);
    const files = reports(g);
    assert.equal(files.length, 1);
    const state = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
    assert.ok(files[0].includes(state.match.reportId));
    // capacity: with 990 report files, a new match cannot start
    for (let i = 0; i < 990; i++) fs.writeFileSync(path.join(dataDir, 'reports', `filler-${i}.json`), '{}');
    assert.equal((await h.post('/api/host/new-match')).status, 507);
  } finally { await g.stop(); }
  // reserved platform routes are not implemented by the game
  const g3 = await startGame();
  try { assert.equal((await fetch(g3.base + '/_launchdeck/return')).status, 404); } finally { await g3.stop(); }
});

test('V15/V16 return destination rules', () => {
  const R = resolveReturnUrlForTest;
  assert.equal(R('https://portal.example/', 'https://portal.example/#view=passport'), 'https://portal.example/#view=passport');
  assert.equal(R('https://portal.example/', 'https://evil.example/'), 'https://portal.example/');
  assert.equal(R('https://portal.example/', 'javascript:alert(1)'), 'https://portal.example/');
  assert.equal(R('javascript:alert(1)', null), null);
  assert.equal(R('data:text/html,hi', null), null);
  assert.equal(R('https://user:pw@portal.example/', null), null);
  assert.equal(R('http://portal.example/', null), null);
  assert.equal(R('http://localhost:9000/', null), 'http://localhost:9000/');
  assert.equal(R(undefined, 'https://portal.example/'), null);
});

test('V22 rating boundaries and minimum samples', () => {
  assert.equal(rating(9, 10, 5), 5); assert.equal(rating(8, 10, 5), 4); assert.equal(rating(7, 10, 5), 4);
  assert.equal(rating(69, 100, 5), 3); assert.equal(rating(5, 10, 5), 3); assert.equal(rating(49, 100, 5), 2);
  assert.equal(rating(1, 4, 3), 2); assert.equal(rating(24, 100, 5), 1); assert.equal(rating(0, 8, 5), 1);
  assert.equal(rating(4, 4, 5), null); assert.equal(rating(2, 2, 3), null);
});
