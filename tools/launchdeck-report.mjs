// Local schema-1 report checker (sections 7-8). Not the real Krilern validator.
// Usage: node tools/launchdeck-report.mjs <report.json> [--session <id>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
const METRIC = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const FORBIDDEN_METRIC = /constructor|prototype|password|token|secret|email|ip_?addr|chat/i;
const KEYS = {
  report: ['schemaVersion', 'type', 'reportId', 'game', 'session', 'teams', 'participants'],
  game: ['gameId', 'name', 'gameVersion'],
  session: ['launchdeckSessionId', 'playMode', 'startedAt', 'endedAt', 'outcome'],
  team: ['teamId', 'name', 'rank', 'score', 'memberIds'],
  participant: ['participantId', 'launchdeckUserId', 'displayName', 'role', 'teamId', 'completed', 'rank', 'rankOutOf', 'score', 'maxScore', 'metrics', 'skills'],
  skill: ['skillId', 'type', 'rating', 'evidence'],
};
function exact(o, keys, p, E) {
  if (!isObj(o)) return E(p, 'must be an object');
  for (const k of Object.keys(o)) if (!keys.includes(k)) E(`${p}.${k}`, 'unknown field');
  for (const k of keys) if (!(k in o)) E(`${p}.${k}`, 'missing');
}

export function validateReport(r, { metadata, sidecar, sessionId } = {}) {
  const errors = [];
  const E = (p, m) => errors.push(`${p}: ${m}`);
  exact(r, KEYS.report, '$', E);
  if (r.schemaVersion !== 1) E('$.schemaVersion', 'must be 1');
  if (r.type !== 'launchdeck.game-report') E('$.type', 'wrong type');
  if (!UUID4.test(r.reportId || '')) E('$.reportId', 'must be UUID v4');
  exact(r.game, KEYS.game, '$.game', E);
  if (metadata && r.game) {
    if (r.game.gameId !== metadata.gameId) E('$.game.gameId', 'does not match metadata');
    if (r.game.gameVersion !== metadata.gameVersion) E('$.game.gameVersion', 'does not match metadata');
  }
  exact(r.session, KEYS.session, '$.session', E);
  const s = r.session || {};
  if (sessionId !== undefined && s.launchdeckSessionId !== sessionId) E('$.session.launchdeckSessionId', 'does not match instance');
  if (metadata && !metadata.playModes.includes(s.playMode)) E('$.session.playMode', 'not a declared play mode');
  if (!ISO.test(s.startedAt || '') || !ISO.test(s.endedAt || '')) E('$.session', 'startedAt/endedAt must be UTC ISO');
  if (!['completed', 'abandoned'].includes(s.outcome)) E('$.session.outcome', 'completed or abandoned');
  if (!Array.isArray(r.teams)) E('$.teams', 'array');
  const teamIds = new Set();
  (r.teams || []).forEach((t, i) => { exact(t, KEYS.team, `$.teams[${i}]`, E); teamIds.add(t.teamId); });
  if (!Array.isArray(r.participants) || r.participants.length > 1000) E('$.participants', 'array of at most 1000');
  const declared = new Set();
  if (metadata) for (const t of ['technical', 'interpersonal']) for (const d of metadata.skills[t]) declared.add(`${t}:${d.id}`);
  const users = new Set(); const pids = new Set();
  (r.participants || []).forEach((p, i) => {
    const P = `$.participants[${i}]`;
    exact(p, KEYS.participant, P, E);
    if (pids.has(p.participantId)) E(`${P}.participantId`, 'duplicate'); pids.add(p.participantId);
    if (p.launchdeckUserId !== null) { if (users.has(p.launchdeckUserId)) E(`${P}.launchdeckUserId`, 'account appears twice'); users.add(p.launchdeckUserId); }
    if (p.teamId !== null && !teamIds.has(p.teamId)) E(`${P}.teamId`, 'unknown team');
    if (typeof p.completed !== 'boolean') E(`${P}.completed`, 'boolean');
    const m = p.metrics;
    if (!isObj(m) || Object.keys(m).length > 100) { E(`${P}.metrics`, 'object with at most 100 entries'); return; }
    for (const [k, v] of Object.entries(m)) {
      if (!METRIC.test(k) || FORBIDDEN_METRIC.test(k)) E(`${P}.metrics.${k}`, 'invalid metric name');
      if (!(typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)))) E(`${P}.metrics.${k}`, 'finite number or boolean');
    }
    if (m.bridgeProtocol === 1) {
      const req = m.bridgeRequiredUnits, done = m.bridgeCompletedUnits, el = m.bridgeEligibleUnits, part = m.bridgeParticipationUnits;
      if (!(done >= 0 && done <= req)) E(`${P}.metrics.bridgeCompletedUnits`, 'out of bounds');
      if (!(part >= 0 && part <= el)) E(`${P}.metrics.bridgeParticipationUnits`, 'out of bounds');
      if (m.bridgeCompletionEligible !== p.completed) E(`${P}.metrics.bridgeCompletionEligible`, 'must equal completed');
      if (p.completed && !(m.bridgeLeftEarly === false && req > 0 && done === req && part > 0)) E(`${P}.completed`, 'completion invariants violated');
      if (m.bridgeWon && !m.bridgeWinEligible) E(`${P}.metrics.bridgeWon`, 'won without eligibility');
      if (!(Number.isInteger(m.bridgeDifficulty) && m.bridgeDifficulty >= 0 && m.bridgeDifficulty <= 4)) E(`${P}.metrics.bridgeDifficulty`, '0..4');
      if (!(Number.isInteger(m.bridgeSkillLevel) && m.bridgeSkillLevel >= 0 && m.bridgeSkillLevel <= 3)) E(`${P}.metrics.bridgeSkillLevel`, '0..3');
      if (m.bridgeDifficulty === 0 && m.bridgeSkillLevel !== 0) E(`${P}.metrics.bridgeSkillLevel`, 'must be 0 with custom difficulty');
      if (sidecar) {
        const names = { 1: 'easy', 2: 'medium', 3: 'hard', 4: 'complex' };
        const lvl = { beginner: 1, intermediate: 2, advanced: 3 }[sidecar.difficultyToSkillLevel[names[m.bridgeDifficulty]]] ?? 0;
        if (m.bridgeSkillLevel !== lvl) E(`${P}.metrics.bridgeSkillLevel`, `must be ${lvl} for difficulty ${m.bridgeDifficulty}`);
        for (const d of [sidecar.primarySkill, ...sidecar.secondarySkills]) {
          const o = m[`sk_${d.skillId}_observations`], sc = m[`sk_${d.skillId}_successes`], rt = m[`sk_${d.skillId}_rating`], lv = m[`sk_${d.skillId}_level`];
          if (!Number.isInteger(o) || o < 0) E(`${P}.metrics.sk_${d.skillId}_observations`, 'nonnegative integer required');
          if (sc !== undefined && !(Number.isInteger(sc) && sc >= 0 && sc <= o)) E(`${P}.metrics.sk_${d.skillId}_successes`, 'must be <= observations');
          if (rt !== undefined && (!Number.isInteger(rt) || rt < 1 || rt > 5 || o < d.minimumObservations)) E(`${P}.metrics.sk_${d.skillId}_rating`, 'rating only with sufficient evidence, 1..5');
          if (lv !== m.bridgeSkillLevel) E(`${P}.metrics.sk_${d.skillId}_level`, 'must equal bridgeSkillLevel');
        }
      }
    }
    if (!Array.isArray(p.skills)) { E(`${P}.skills`, 'array'); return; }
    if (p.role === 'host' && (p.skills.length || p.completed || p.rank !== null || p.score !== null)) E(P, 'host-only participant must have no results');
    const seen = new Set();
    p.skills.forEach((k, j) => {
      const K = `${P}.skills[${j}]`;
      exact(k, KEYS.skill, K, E);
      if (seen.has(`${k.type}:${k.skillId}`)) E(K, 'duplicate skill'); seen.add(`${k.type}:${k.skillId}`);
      if (metadata && !declared.has(`${k.type}:${k.skillId}`)) E(`${K}.skillId`, 'not declared in metadata');
      if (!Number.isInteger(k.rating) || k.rating < 1 || k.rating > 5) E(`${K}.rating`, 'integer 1..5');
      if (typeof k.evidence !== 'string' || !k.evidence.trim() || k.evidence.length > 2000) E(`${K}.evidence`, 'nonempty <=2000');
      if (s.playMode === 'solo' && k.type === 'interpersonal') E(K, 'interpersonal entries are not emitted in solo');
    });
  });
  if (Buffer.byteLength(JSON.stringify(r)) >= 512 * 1024) E('$', 'report must be below 512 KiB');
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const file = process.argv[2];
  const si = process.argv.indexOf('--session');
  const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const errs = validateReport(read(file), { metadata: read(path.join(root, 'metadata.json')), sidecar: read(path.join(root, 'launchdeck.skills.json')), sessionId: si > 0 ? (process.argv[si + 1] === 'null' ? null : process.argv[si + 1]) : undefined });
  if (errs.length) { errs.forEach((e) => console.error(`${file} ${e}`)); process.exit(1); }
  console.log(`OK: ${file} (local schema-1 check only)`);
}
