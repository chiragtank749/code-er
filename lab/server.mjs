// Code ER — Safety Net Lab server. Zero dependencies (Node 18+).
// Implements the Krilern runtime contract: see docs/LAUNCHDECK_BRIDGE.md.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveReturnUrl } from './return-url.mjs';
import { DIFFICULTIES, PROBE_KINDS, BUGS, DECOY_BUGS, MUTANTS, normaliseProbe, runProbe, evaluate, rating } from './engine.mjs';

const GAME = { gameId: 'code-er-ride-booking', name: 'Code ER: the patient must survive', gameVersion: '1.1.0' };
const RUBRIC_VERSION = 1;
const LEVEL_CODE = { beginner: 1, intermediate: 2, advanced: 3 };
const MAX_PROBES = 40;
const MAX_PARTICIPANTS = 1000;
const MAX_REPORT_FILES = 990;
const MAX_REPORT_BYTES = 15 * 1024 * 1024;
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- configuration ------------------------------------------------------------------------
const env = process.env;
const PORT = Number(env.PORT || 3000);
const HOST = env.HOST || '0.0.0.0';
const PUBLIC_URL = (env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const HOST_KEY = env.HOST_KEY !== undefined && env.HOST_KEY !== '' ? env.HOST_KEY : randomKey(12);
const DATA_DIR = path.resolve(env.DATA_DIR || './data');
const REPORTS = path.join(DATA_DIR, 'reports');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const ENV_SESSION = env.LAUNCHDECK_SESSION_ID || null;
// Identity headers are only trusted behind the Krilern ingress (integrated runtime).
const TRUST_HEADERS = Boolean(ENV_SESSION) || env.LAUNCHDECK_TRUST_HEADERS === '1';
const DEBUG = env.LOG_LEVEL === 'debug';
const FAULT_FILE = env.CODEER_FAULT_FILE || null; // test-only: writes fail while this file exists
const RETURN_URL = resolveReturnUrl(env.LAUNCHDECK_PORTAL_URL, env.LAUNCHDECK_RETURN_URL);

function randomKey(n) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += a[crypto.randomInt(a.length)];
  return s;
}
const log = (...a) => { if (DEBUG) console.error('[debug]', ...a); };
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

// The key travels base64url-encoded so leading/trailing whitespace survives HTTP.
function hostKeyOk(encoded) {
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9_-]{1,700}$/.test(encoded)) return false;
  const given = Buffer.from(encoded, 'base64url').toString('utf8');
  return crypto.timingSafeEqual(sha(given), sha(HOST_KEY));
}

// ---- durable state -----------------------------------------------------------------------
fs.mkdirSync(REPORTS, { recursive: true });
function atomicWrite(file, data) {
  if (FAULT_FILE && fs.existsSync(FAULT_FILE)) throw new Error('injected write failure');
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { match: null }; }
}
let state = loadState();
function mutate(fn) {
  const draft = structuredClone(state);
  const result = fn(draft);
  atomicWrite(STATE_FILE, JSON.stringify(draft));
  state = draft;
  return result;
}

function newMatch(draft, difficulty = 'easy', teamCount = 2) {
  draft.match = {
    matchId: crypto.randomUUID(), reportId: crypto.randomUUID(), sessionId: ENV_SESSION,
    status: 'lobby', outcome: null, difficulty, teamCount, rubricVersion: RUBRIC_VERSION,
    createdAt: new Date().toISOString(), startedAt: null, endedAt: null,
    finalized: false, reportFile: null, participants: {},
  };
}
if (!state.match) { try { mutate((d) => newMatch(d)); } catch (e) { console.error('cannot initialise state:', e.message); process.exit(1); } }

// ---- reports ------------------------------------------------------------------------------
function reportCapacityOk() {
  try {
    const files = fs.readdirSync(REPORTS).filter((f) => f.endsWith('.json'));
    const bytes = files.reduce((n, f) => n + fs.statSync(path.join(REPORTS, f)).size, 0);
    return files.length < MAX_REPORT_FILES && bytes < MAX_REPORT_BYTES;
  } catch { return false; }
}

function participantFacts(m, p) {
  const d = DIFFICULTIES[m.difficulty];
  const required = d.requiredProbes + 1; // N locked probes + the monitor submission
  const done = Math.min(p.probes.length, d.requiredProbes) + (p.submitted ? 1 : 0);
  const completed = p.submitted && p.probes.length >= d.requiredProbes;
  const r = p.result || { killed: [], bugsFound: [], falseFlags: 0 };
  const obsT = p.submitted ? d.mutants.length : 0;
  const obsE = p.submitted ? d.bugs.length : 0;
  const ratingT = rating(r.killed.length, obsT, 5);
  const ratingE = rating(r.bugsFound.length, obsE, 3);
  const won = completed && obsT > 0 && r.killed.length / obsT >= 0.7;
  return { d, required, done, completed, r, obsT, obsE, ratingT, ratingE, won };
}

function competitionRanks(items, key) {
  const sorted = [...items].sort((a, b) => key(b) - key(a));
  const ranks = new Map();
  sorted.forEach((it, i) => ranks.set(it, i > 0 && key(sorted[i - 1]) === key(it) ? ranks.get(sorted[i - 1]) : i + 1));
  return ranks;
}

export function buildReport(m) {
  const level = LEVEL_CODE[DIFFICULTIES[m.difficulty].skillLevel];
  const players = Object.values(m.participants);
  const facts = new Map(players.map((p) => [p, participantFacts(m, p)]));
  const ranked = players.filter((p) => facts.get(p).completed);
  const pRanks = competitionRanks(ranked, (p) => facts.get(p).r.killed.length);
  const teams = [];
  for (let t = 1; t <= m.teamCount; t++) {
    const members = players.filter((p) => p.teamId === `t${t}`);
    if (!members.length) continue;
    const union = new Set(members.flatMap((p) => (p.submitted ? p.result.killed : [])));
    teams.push({ teamId: `t${t}`, name: `Team ${t}`, rank: null, score: union.size, memberIds: members.map((p) => p.pid) });
  }
  const tRanks = competitionRanks(teams, (t) => t.score);
  for (const t of teams) t.rank = tRanks.get(t);
  return {
    schemaVersion: 1, type: 'launchdeck.game-report', reportId: m.reportId,
    game: { ...GAME },
    session: { launchdeckSessionId: m.sessionId, playMode: 'team', startedAt: m.startedAt || m.createdAt, endedAt: m.endedAt, outcome: m.outcome },
    teams,
    participants: players.map((p) => {
      const f = facts.get(p);
      const metrics = {
        bridgeProtocol: 1, bridgeSkillLevel: level, bridgeDifficulty: f.d.code, bridgeRubricVersion: m.rubricVersion,
        bridgeRequiredUnits: f.required, bridgeCompletedUnits: f.done, bridgeEligibleUnits: f.required, bridgeParticipationUnits: f.done,
        bridgeCompletionEligible: f.completed, bridgeLeftEarly: Boolean(p.leftEarly) && !f.completed,
        bridgeWinEligible: f.completed, bridgeWon: f.won, bridgeHostAdjustedScore: false,
        lockedProbes: p.probes.length, falseBugFlags: f.r.falseFlags,
        'sk_test-design_observations': f.obsT, 'sk_test-design_successes': f.r.killed.length, 'sk_test-design_level': level,
        'sk_error-detection_observations': f.obsE, 'sk_error-detection_successes': f.r.bugsFound.length, 'sk_error-detection_level': level,
      };
      if (f.ratingT !== null) metrics['sk_test-design_rating'] = f.ratingT;
      if (f.ratingE !== null) metrics['sk_error-detection_rating'] = f.ratingE;
      const skills = [];
      if (f.ratingT !== null) skills.push({ skillId: 'test-design', type: 'technical', rating: f.ratingT, evidence: `Own locked characterization probes caught ${f.r.killed.length} of ${f.obsT} broken copies (${m.difficulty}).` });
      if (f.ratingE !== null) skills.push({ skillId: 'attention-to-detail', type: 'interpersonal', rating: f.ratingE, evidence: `Error detection: correctly flagged ${f.r.bugsFound.length} of ${f.obsE} suspected bugs with a reproducing probe; ${f.r.falseFlags} incorrect flag(s).` });
      return {
        participantId: p.pid, launchdeckUserId: p.userId, displayName: p.nickname, role: 'player', teamId: p.teamId,
        completed: f.completed, rank: f.completed ? pRanks.get(p) : null, rankOutOf: f.completed ? ranked.length : null,
        score: p.submitted ? f.r.killed.length : 0, maxScore: f.d.mutants.length, metrics, skills,
      };
    }),
  };
}

// Finalize exactly once. Keeps the same reportId on retry; never rewrites a written report.
function finalize(outcome) {
  const m = state.match;
  if (!m || m.finalized) return true;
  try {
    mutate((d) => { if (!d.match.endedAt) { d.match.status = 'ended'; d.match.outcome = outcome; d.match.endedAt = new Date().toISOString(); } });
  } catch (e) { console.error('finalize: state save failed:', e.message); return false; }
  const m2 = state.match;
  const stamp = m2.endedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const name = `${stamp}-${m2.reportId}.json`;
  try {
    const body = JSON.stringify(buildReport(m2), null, 2);
    if (Buffer.byteLength(body) >= 512 * 1024) throw new Error('report exceeds 512 KiB');
    if (!fs.existsSync(path.join(REPORTS, name))) atomicWrite(path.join(REPORTS, name), body);
    mutate((d) => { d.match.finalized = true; d.match.reportFile = name; });
  } catch (e) { console.error('finalize: report write failed, will retry:', e.message); return false; }
  console.log(`GAME REPORT : reports/${name}`);
  return true;
}
setInterval(() => { if (state.match && state.match.status === 'ended' && !state.match.finalized) finalize(state.match.outcome); }, 3000).unref();

// ---- identity & seats ---------------------------------------------------------------------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function identity(req) {
  const userId = TRUST_HEADERS ? (req.headers['x-launchdeck-user-id'] || null) : null;
  const hdrSession = TRUST_HEADERS ? (req.headers['x-launchdeck-session-id'] || null) : null;
  if (ENV_SESSION && hdrSession && hdrSession !== ENV_SESSION) throw new HttpError(409, 'Session identity mismatch.');
  return { userId: userId ? String(userId).slice(0, 200) : null };
}
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((x) => x.length === 2));

function findSeat(req, id) {
  const m = state.match;
  const token = cookies(req).cer_seat;
  const byToken = token ? Object.values(m.participants).find((p) => p.tokenHashes.includes(sha(token).toString('hex'))) : null;
  if (byToken) {
    if (byToken.userId !== id.userId) throw new HttpError(403, 'This seat belongs to another account.');
    return { seat: byToken, token: null };
  }
  if (id.userId) {
    const own = Object.values(m.participants).find((p) => p.userId === id.userId);
    if (own) return { seat: own, token: 'reissue' };
  }
  return { seat: null, token: null };
}

function issueToken(draftSeat) {
  const token = crypto.randomBytes(24).toString('base64url');
  draftSeat.tokenHashes = [...draftSeat.tokenHashes, sha(token).toString('hex')].slice(-5);
  return token;
}
const seatCookie = (t) => `cer_seat=${t}; Path=/; HttpOnly; SameSite=Lax${PUBLIC_URL.startsWith('https:') ? '; Secure' : ''}`;

// ---- views --------------------------------------------------------------------------------
function publicMatch(m) {
  const d = DIFFICULTIES[m.difficulty];
  return {
    status: m.status, outcome: m.outcome, difficulty: m.difficulty, difficultyLabel: d.label, teamCount: m.teamCount,
    requiredProbes: d.requiredProbes, maxProbes: MAX_PROBES, kinds: d.kinds.map((k) => ({ id: k, ...PROBE_KINDS[k] })),
    mutantCount: d.mutants.length, bugCount: d.bugs.length,
    bugOptions: Object.entries({ ...Object.fromEntries(Object.entries(BUGS).map(([k, v]) => [k, v.label])), ...DECOY_BUGS }).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
    playerCount: Object.keys(m.participants).length,
  };
}
function playerView(p, m) {
  if (!p) return null;
  const f = participantFacts(m, p);
  const v = { nickname: p.nickname, teamId: p.teamId, status: p.status, linked: Boolean(p.userId), probes: p.probes.map(({ id, kind, input, expected, flag }) => ({ id, kind, input, expected, flag })), submitted: p.submitted, completed: f.completed };
  if (p.submitted) v.result = { killed: f.r.killed.length, of: f.obsT, killedNames: f.r.killed.map((k) => MUTANTS[k]), bugsFound: f.r.bugsFound.length, bugsOf: f.obsE, falseFlags: f.r.falseFlags, objectiveMet: f.won };
  return v;
}
function leaderboard(m) {
  if (m.status !== 'ended') return null;
  const r = buildReport(m);
  return r.participants.map((p) => ({ name: p.displayName, team: p.teamId, completed: p.completed, rank: p.rank, score: p.score, maxScore: p.maxScore })).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
}

// ---- HTTP ---------------------------------------------------------------------------------
const STATIC = { '/join': 'join.html', '/host': 'host.html', '/static/app.js': 'app.js', '/static/host.js': 'host.js', '/static/style.css': 'style.css' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
  res.end(data);
}
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 64 * 1024) throw new HttpError(413, 'Body too large.'); chunks.push(c); }
  if (!chunks.length) return {};
  try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); return v && typeof v === 'object' ? v : {}; } catch { throw new HttpError(400, 'Invalid JSON.'); }
}
const nick = (v) => { const s = typeof v === 'string' ? v.trim() : ''; if (!s || s.length > 30) throw new HttpError(400, 'Nickname must be 1-30 characters.'); return s; };
function save(fn) { try { return mutate(fn); } catch (e) { if (e instanceof HttpError) throw e; console.error('save failed:', e.message); throw new HttpError(503, 'The game could not save your progress. Nothing was changed; please retry.'); } }

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p.startsWith('/_launchdeck/')) return send(res, 404, 'Not found');
  if (req.method === 'GET' && p === '/healthz') return send(res, 200, { ok: true });
  if (req.method === 'GET' && p === '/') return send(res, 302, '', { location: './join' });
  if (req.method === 'GET' && STATIC[p]) {
    const f = STATIC[p];
    return send(res, 200, fs.readFileSync(path.join(HERE, 'public', f), 'utf8'), { 'content-type': TYPES[path.extname(f)], 'referrer-policy': 'no-referrer' });
  }
  if (!p.startsWith('/api/')) return send(res, 404, 'Not found');

  const id = identity(req);
  const body = req.method === 'POST' ? await readBody(req) : {};
  const m = state.match;

  if (p.startsWith('/api/host/')) {
    if (!hostKeyOk(req.headers['x-host-key-b64'])) throw new HttpError(401, 'Host key required.');
    return hostApi(req, res, p, body);
  }

  if (req.method === 'GET' && p === '/api/config') return send(res, 200, { returnUrl: RETURN_URL, game: GAME });

  const { seat, token } = findSeat(req, id);
  const extra = {};
  if (seat && token === 'reissue') {
    const t = save((d) => issueToken(d.match.participants[seat.pid]));
    extra['set-cookie'] = seatCookie(t);
  }
  const me = seat ? state.match.participants[seat.pid] : null;

  if (req.method === 'GET' && p === '/api/state') {
    return send(res, 200, { match: publicMatch(state.match), me: playerView(me, state.match), leaderboard: leaderboard(state.match), returnUrl: RETURN_URL, linkedAccount: Boolean(id.userId) }, extra);
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');

  if (p === '/api/join') {
    if (me) return send(res, 200, { ok: true, resumed: true }, extra);
    if (m.status === 'ended') throw new HttpError(409, 'This match has ended.');
    if (Object.keys(m.participants).length >= MAX_PARTICIPANTS) throw new HttpError(409, 'Match is full.');
    const nickname = nick(body.nickname);
    const team = Number(body.team);
    if (!Number.isInteger(team) || team < 1 || team > m.teamCount) throw new HttpError(400, 'Choose a team.');
    let t;
    save((d) => {
      const pid = 'p' + crypto.randomBytes(6).toString('hex');
      const s = { pid, userId: id.userId, nickname, teamId: `t${team}`, joinedAt: new Date().toISOString(), status: 'active', leftEarly: false, probes: [], submitted: false, result: null, tokenHashes: [] };
      d.match.participants[pid] = s;
      t = issueToken(s);
    });
    return send(res, 200, { ok: true }, { 'set-cookie': seatCookie(t) });
  }

  if (!me) throw new HttpError(401, 'Join the match first.');

  if (p === '/api/leave') {
    const f = participantFacts(m, me);
    if (me.status !== 'left') save((d) => { const s = d.match.participants[me.pid]; s.status = 'left'; s.leftEarly = !f.completed && d.match.status !== 'ended'; s.leftAt = new Date().toISOString(); });
    return send(res, 200, { saved: true, completed: f.completed, returnUrl: RETURN_URL, reportPending: !state.match.finalized });
  }
  if (p === '/api/nickname') { const n = nick(body.nickname); save((d) => { d.match.participants[me.pid].nickname = n; }); return send(res, 200, { ok: true }); }

  // gameplay mutations
  if (me.status === 'left') throw new HttpError(409, 'You left this match. Rejoining after leaving is not allowed.');
  if (m.status !== 'running') throw new HttpError(409, m.status === 'lobby' ? 'The host has not started the match yet.' : 'The match has ended.');
  const d = DIFFICULTIES[m.difficulty];

  if (p === '/api/probe/run' || p === '/api/probe/lock') {
    if (me.submitted) throw new HttpError(409, 'You already ran the monitor.');
    if (!d.kinds.includes(body.kind)) throw new HttpError(400, 'That probe type is not part of this difficulty.');
    let input;
    try { input = normaliseProbe(body.kind, body.input); } catch (e) { throw new HttpError(400, e.message); }
    const expected = runProbe(body.kind, input);
    if (p === '/api/probe/run') return send(res, 200, { observed: expected });
    const flag = body.flag ? String(body.flag) : null;
    if (flag && !BUGS[flag] && !DECOY_BUGS[flag]) throw new HttpError(400, 'Unknown bug category.');
    const key = JSON.stringify([body.kind, input]);
    const dup = me.probes.find((x) => JSON.stringify([x.kind, x.input]) === key);
    if (dup) return send(res, 200, { ok: true, duplicate: true, observed: expected });
    if (me.probes.length >= MAX_PROBES) throw new HttpError(409, `At most ${MAX_PROBES} probes.`);
    save((dr) => { dr.match.participants[me.pid].probes.push({ id: crypto.randomBytes(4).toString('hex'), kind: body.kind, input, expected, flag }); });
    return send(res, 200, { ok: true, observed: expected });
  }
  if (p === '/api/probe/delete') {
    if (me.submitted) throw new HttpError(409, 'You already ran the monitor.');
    save((dr) => { const s = dr.match.participants[me.pid]; s.probes = s.probes.filter((x) => x.id !== body.id); });
    return send(res, 200, { ok: true });
  }
  if (p === '/api/submit') {
    if (me.submitted) return send(res, 200, { ok: true, already: true });
    if (me.probes.length < d.requiredProbes) throw new HttpError(400, `Lock at least ${d.requiredProbes} probes first.`);
    const result = evaluate(m.difficulty, me.probes);
    save((dr) => { const s = dr.match.participants[me.pid]; s.submitted = true; s.result = result; });
    return send(res, 200, { ok: true });
  }
  throw new HttpError(404, 'Not found.');
}

function hostApi(req, res, p, body) {
  const m = state.match;
  if (req.method === 'GET' && p === '/api/host/state') {
    return send(res, 200, {
      match: { ...publicMatch(m), matchId: m.matchId, finalized: m.finalized, reportFile: m.reportFile },
      difficulties: Object.entries(DIFFICULTIES).map(([id, d]) => ({ id, label: d.label, mutants: d.mutants.length, bugs: d.bugs.length, requiredProbes: d.requiredProbes })),
      roster: Object.values(m.participants).map((s) => { const f = participantFacts(m, s); return { nickname: s.nickname, team: s.teamId, linked: Boolean(s.userId), status: s.status, probes: s.probes.length, submitted: s.submitted, completed: f.completed, killed: s.submitted ? f.r.killed.length : null, bugs: s.submitted ? f.r.bugsFound.length : null }; }),
    });
  }
  if (req.method === 'GET' && p === '/api/host/report') {
    if (!m.finalized) throw new HttpError(409, 'The report is written when the match ends.');
    return send(res, 200, fs.readFileSync(path.join(REPORTS, m.reportFile), 'utf8'), { 'content-type': 'application/json', 'content-disposition': `attachment; filename="${m.reportFile}"` });
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  if (p === '/api/host/configure') {
    if (m.status !== 'lobby') throw new HttpError(409, 'Settings are locked once the match starts.');
    if (!DIFFICULTIES[body.difficulty]) throw new HttpError(400, 'Unknown difficulty.');
    const tc = Number(body.teamCount);
    if (!Number.isInteger(tc) || tc < 1 || tc > 20) throw new HttpError(400, 'Team count must be 1-20.');
    if (Object.values(m.participants).some((s) => Number(s.teamId.slice(1)) > tc)) throw new HttpError(409, 'Players are already on a team that would be removed.');
    save((d) => { d.match.difficulty = body.difficulty; d.match.teamCount = tc; });
    return send(res, 200, { ok: true });
  }
  if (p === '/api/host/start') {
    if (m.status !== 'lobby') throw new HttpError(409, 'Already started.');
    if (!reportCapacityOk()) throw new HttpError(507, 'Report storage is full; collect old reports first.');
    save((d) => { d.match.status = 'running'; d.match.startedAt = new Date().toISOString(); });
    return send(res, 200, { ok: true });
  }
  if (p === '/api/host/end') {
    if (m.status === 'lobby') throw new HttpError(409, 'The match has not started.');
    const ok = finalize('completed');
    return send(res, ok ? 200 : 503, { ok, finalized: state.match.finalized });
  }
  if (p === '/api/host/new-match') {
    if (!m.finalized) throw new HttpError(409, 'End the current match first.');
    if (!reportCapacityOk()) throw new HttpError(507, 'Report storage is full; collect old reports first.');
    save((d) => newMatch(d, m.difficulty, m.teamCount));
    return send(res, 200, { ok: true });
  }
  throw new HttpError(404, 'Not found.');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error('request error:', e);
    send(res, 500, { error: 'Internal error.' });
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`HOST LINK   : ${PUBLIC_URL}/host\nPLAYER LINK : ${PUBLIC_URL}/join\nHOST KEY    : ${HOST_KEY}\n`);
  log('listening', HOST, PORT, 'trustHeaders', TRUST_HEADERS, 'return', RETURN_URL);
});

let stopping = false;
function shutdown(sig) {
  if (stopping) return;
  stopping = true;
  log('signal', sig);
  const m = state.match;
  if (m && m.status === 'running' && !m.finalized) finalize('abandoned');
  else if (m && m.status === 'ended' && !m.finalized) finalize(m.outcome);
  server.close();
  setTimeout(() => process.exit(0), 50).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
