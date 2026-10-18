#!/usr/bin/env node
// Krilern artifact gate: validates metadata.json + launchdeck.skills.json (+ source preflight).
// Usage: node tools/launchdeck-validate.mjs [rootDir]   (exit 1 on any error)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const MODES = ['solo', 'team', 'multiplayer'];
const CATEGORIES = ['CS / IT', 'Finance', 'Sales', 'Mechanical', 'Marketing', 'HR', 'Operations', 'Management', 'Electrical', 'Civil', 'General'];
const DOMAINS = ['cs-it', 'finance', 'sales', 'mechanical', 'marketing', 'hr', 'operations', 'management', 'electrical', 'civil', 'general'];
const TOP_KEYS = ['schemaVersion', 'type', 'catalogueVersion', 'gameId', 'gameVersion', 'primarySkill', 'secondarySkills', 'supportedSkillLevels', 'difficultyToSkillLevel', 'rubricVersion', 'completionRule', 'winRule', 'legacyAliases', 'returnNavigation'];
const DESC_REQ = ['skillId', 'family', 'role', 'v1Type', 'v1SkillId', 'measuredBy', 'minimumObservations', 'metrics', 'thresholds', 'applicableModes', 'applicableRoles', 'rubricReference', 'limitations'];
const DESC_OPT = ['difficultyToSkillLevel'];
const BLOCKED_SEGMENTS = ['.git', '.ssh', '.aws', 'node_modules', '.venv', 'venv', '__pycache__', '.next'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, max) => typeof v === 'string' && v.trim() !== '' && (max === undefined || v.length <= max);

export function loadCatalogue(root) {
  const c = JSON.parse(fs.readFileSync(path.join(root, 'skill-catalogue.json'), 'utf8'));
  return c;
}

export function validateCatalogue(c, errors) {
  const E = (p, m) => errors.push(`skill-catalogue.json ${p}: ${m}`);
  if (c.catalogueVersion !== 'launchdeck-skills-1.0.0') E('$.catalogueVersion', 'must be launchdeck-skills-1.0.0');
  if (!Array.isArray(c.domainSkills) || c.domainSkills.length !== 160) E('$.domainSkills', 'must contain exactly 160 rows');
  if (!Array.isArray(c.humanSkills) || c.humanSkills.length !== 120) E('$.humanSkills', 'must contain exactly 120 rows');
  const seen = new Set();
  const umbrellas = new Set();
  for (const [k, list] of [['domainSkills', c.domainSkills || []], ['humanSkills', c.humanSkills || []]]) {
    list.forEach((s, i) => {
      if (!KEBAB.test(s.id || '')) E(`$.${k}[${i}].id`, 'invalid id');
      if (seen.has(s.id)) E(`$.${k}[${i}].id`, `duplicate ${s.id}`);
      seen.add(s.id);
      if (!isStr(s.label)) E(`$.${k}[${i}].label`, 'missing label');
      if (k === 'humanSkills') umbrellas.add(s.v1Umbrella);
    });
  }
  if (umbrellas.size !== 12) E('$.humanSkills', 'must map to exactly 12 v1 umbrellas');
  for (const u of umbrellas) if (!(c.humanSkills || []).some((s) => s.id === u && s.v1Umbrella === u)) E('$.humanSkills', `umbrella ${u} is not itself a row mapping to itself`);
}

function validateDescriptor(d, p, role, ctx, E) {
  if (!isObj(d)) return E(p, 'must be an object');
  for (const k of Object.keys(d)) if (!DESC_REQ.includes(k) && !DESC_OPT.includes(k)) E(`${p}.${k}`, 'key not allowed');
  for (const k of DESC_REQ) if (!(k in d)) E(`${p}.${k}`, 'required key missing');
  const dom = ctx.domain.get(d.skillId);
  const hum = ctx.human.get(d.skillId);
  if (!dom && !hum) E(`${p}.skillId`, `unknown skill id ${JSON.stringify(d.skillId)}`);
  const family = dom ? 'domain' : hum ? 'human' : null;
  if (family && d.family !== family) E(`${p}.family`, `must be ${family}`);
  if (d.role !== role) E(`${p}.role`, `must be ${role}`);
  if (family && d.v1Type !== (family === 'domain' ? 'technical' : 'interpersonal')) E(`${p}.v1Type`, 'wrong v1Type for family');
  const expectV1 = dom ? d.skillId : hum ? hum.v1Umbrella : undefined;
  if (expectV1 && d.v1SkillId !== expectV1) E(`${p}.v1SkillId`, `must be ${expectV1}`);
  if (!isStr(d.measuredBy, 1000)) E(`${p}.measuredBy`, 'must be a nonempty string <=1000 chars');
  if (!Number.isInteger(d.minimumObservations) || d.minimumObservations < 1 || d.minimumObservations > 1000000) E(`${p}.minimumObservations`, 'must be an integer 1..1000000');
  if (!Array.isArray(d.metrics) || d.metrics.length === 0 || !d.metrics.every((m) => isStr(m, 80) && /^[A-Za-z][A-Za-z0-9_-]*$/.test(m))) E(`${p}.metrics`, 'must be a nonempty array of metric names');
  else if (!d.metrics.some((m) => m === `sk_${d.skillId}_observations`)) E(`${p}.metrics`, `must include sk_${d.skillId}_observations`);
  if (!(isStr(d.thresholds) || isObj(d.thresholds))) E(`${p}.thresholds`, 'must be a nonempty string or object');
  if (!Array.isArray(d.applicableModes) || d.applicableModes.length === 0 || !d.applicableModes.every((m) => ctx.playModes.includes(m))) E(`${p}.applicableModes`, 'must be a nonempty subset of metadata.playModes');
  if (!Array.isArray(d.applicableRoles) || !d.applicableRoles.every((r) => isStr(r))) E(`${p}.applicableRoles`, 'must be an array of strings');
  if (!isStr(d.rubricReference, 500)) E(`${p}.rubricReference`, 'must be a nonempty string <=500 chars');
  else checkRubricRef(d.rubricReference, `${p}.rubricReference`, ctx.root, E);
  if (!isStr(d.limitations, 2000)) E(`${p}.limitations`, 'must be a nonempty string <=2000 chars');
  if ('difficultyToSkillLevel' in d) checkDiffMap(d.difficultyToSkillLevel, `${p}.difficultyToSkillLevel`, E);
}

function checkRubricRef(ref, p, root, E) {
  const [file, anchor] = ref.split('#');
  const fp = path.join(root, file);
  if (!fs.existsSync(fp)) return E(p, `file ${file} not found`);
  if (anchor) {
    const slugs = fs.readFileSync(fp, 'utf8').split('\n').filter((l) => /^#+ /.test(l))
      .map((l) => l.replace(/^#+ /, '').trim().toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-'));
    if (!slugs.includes(anchor)) E(p, `anchor #${anchor} not found in ${file}`);
  }
}

function checkDiffMap(m, p, E) {
  if (!isObj(m)) return E(p, 'must be an object');
  for (const [k, v] of Object.entries(m)) if (typeof v !== 'string' || !LEVELS.includes(v)) E(`${p}.${k}`, 'value must be a level string');
}

export function validateSidecar(s, meta, ctx, errors) {
  const E = (p, m) => errors.push(`launchdeck.skills.json ${p}: ${m}`);
  if (!isObj(s)) return E('$', 'must be an object');
  for (const k of Object.keys(s)) if (!TOP_KEYS.includes(k)) E(`$.${k}`, 'key not allowed');
  for (const k of TOP_KEYS) if (!(k in s)) E(`$.${k}`, 'required key missing');
  if (s.schemaVersion !== 1) E('$.schemaVersion', 'must be 1');
  if (s.type !== 'launchdeck.game-skill-profile') E('$.type', 'must be launchdeck.game-skill-profile');
  if (s.catalogueVersion !== 'launchdeck-skills-1.0.0') E('$.catalogueVersion', 'must be launchdeck-skills-1.0.0');
  if (s.gameId !== meta.gameId) E('$.gameId', 'must match metadata.gameId');
  if (s.gameVersion !== meta.gameVersion) E('$.gameVersion', 'must match metadata.gameVersion');
  validateDescriptor(s.primarySkill, '$.primarySkill', 'primary', ctx, E);
  if (!Array.isArray(s.secondarySkills) || s.secondarySkills.length > 4) E('$.secondarySkills', 'must be an array of 0..4');
  const secs = Array.isArray(s.secondarySkills) ? s.secondarySkills : [];
  secs.forEach((d, i) => validateDescriptor(d, `$.secondarySkills[${i}]`, 'secondary', ctx, E));
  const all = [s.primarySkill, ...secs].filter(isObj);
  const ids = all.map((d) => d.skillId);
  if (new Set(ids).size !== ids.length) E('$.secondarySkills', 'duplicate skill ids (primary may not repeat as secondary)');
  for (const d of all) {
    const h = ctx.human.get(d.skillId);
    if (h && h.v1Umbrella !== d.skillId && ids.includes(h.v1Umbrella)) E('$.secondarySkills', `both umbrella ${h.v1Umbrella} and descendant ${d.skillId} selected`);
  }
  if (!Array.isArray(s.supportedSkillLevels) || s.supportedSkillLevels.length === 0 || !s.supportedSkillLevels.every((l) => LEVELS.includes(l))) E('$.supportedSkillLevels', 'must be nonempty levels');
  checkDiffMap(s.difficultyToSkillLevel, '$.difficultyToSkillLevel', E);
  if (isObj(s.difficultyToSkillLevel)) for (const [k, v] of Object.entries(s.difficultyToSkillLevel)) if (!(s.supportedSkillLevels || []).includes(v)) E(`$.difficultyToSkillLevel.${k}`, 'level not in supportedSkillLevels');
  if (!Number.isInteger(s.rubricVersion) || s.rubricVersion < 1) E('$.rubricVersion', 'must be a positive integer');
  if (!isStr(s.completionRule)) E('$.completionRule', 'must be a nonempty string');
  if (!isStr(s.winRule)) E('$.winRule', 'must be a nonempty string');
  if (!isObj(s.legacyAliases)) E('$.legacyAliases', 'must be an object');
  else for (const [k, v] of Object.entries(s.legacyAliases)) if (!ctx.domain.has(v) && !ctx.human.has(v)) E(`$.legacyAliases.${k}`, 'target must be a catalogue id');
  const rn = s.returnNavigation;
  if (!isObj(rn) || Object.keys(rn).length !== 2 || rn.portalUrlEnv !== 'LAUNCHDECK_PORTAL_URL' || rn.returnUrlEnv !== 'LAUNCHDECK_RETURN_URL') E('$.returnNavigation', 'must be exactly {portalUrlEnv:"LAUNCHDECK_PORTAL_URL", returnUrlEnv:"LAUNCHDECK_RETURN_URL"}');

  // metadata skill declarations must equal selected transport ids after umbrella dedupe
  const want = { technical: new Set(), interpersonal: new Set() };
  for (const d of all) if (d.v1Type in want && d.v1SkillId) want[d.v1Type].add(d.v1SkillId);
  for (const t of ['technical', 'interpersonal']) {
    const have = ((meta.skills || {})[t] || []).map((x) => x.id);
    const a = [...want[t]].sort().join(','), b = [...new Set(have)].sort().join(',');
    if (a !== b || have.length !== new Set(have).size) errors.push(`metadata.json $.skills.${t}: declarations [${have}] must equal selected transport ids [${[...want[t]]}]`);
  }
}

export function validateMetadata(m, errors) {
  const E = (p, msg) => errors.push(`metadata.json ${p}: ${msg}`);
  if (Buffer.byteLength(JSON.stringify(m)) >= 64 * 1024) E('$', 'must be below 64 KiB');
  if (m.schemaVersion !== 1) E('$.schemaVersion', 'must be 1');
  if (!isStr(m.name, 100)) E('$.name', 'nonempty <=100');
  if (!CATEGORIES.includes(m.category)) E('$.category', 'not an allowed category');
  if (!Array.isArray(m.tags) || m.tags.length > 20 || new Set(m.tags).size !== m.tags.length || !m.tags.every((t) => KEBAB.test(t) && t.length <= 40)) E('$.tags', '<=20 distinct kebab-case tags <=40 chars');
  if (!isStr(m.description, 1600)) E('$.description', 'nonempty <=1600');
  if (!isStr(m.instructions, 16000)) E('$.instructions', 'nonempty <=16000');
  if (!KEBAB.test(m.gameId || '') || m.gameId.length > 100) E('$.gameId', 'kebab-case <=100');
  if (!SEMVER.test(m.gameVersion || '')) E('$.gameVersion', 'must be semver');
  if (!Array.isArray(m.playModes) || m.playModes.length === 0 || !m.playModes.every((x) => MODES.includes(x))) E('$.playModes', 'nonempty subset of solo/team/multiplayer');
  const p = m.players;
  if (!isObj(p) || !Number.isInteger(p.min) || !Number.isInteger(p.max) || p.min < 1 || p.max < p.min) E('$.players', 'invalid bounds');
  else if ((m.playModes || []).includes('team') ? !isObj(p.teamSize) : p.teamSize !== null) E('$.players.teamSize', 'object iff team mode');
  if (!Number.isInteger(m.durationMinutes) || m.durationMinutes < 1 || m.durationMinutes > 1440) E('$.durationMinutes', 'integer 1..1440');
  if (!LEVELS.includes(m.level)) E('$.level', 'invalid level');
  if (!Array.isArray(m.domains) || !m.domains.every((d) => DOMAINS.includes(d))) E('$.domains', 'invalid domain');
  for (const u of ['video', 'communityUrl']) if (m[u] !== '' && !/^https:\/\/[^@\s]+$/.test(m[u] || '')) E(`$.${u}`, 'empty or credential-free https URL');
  for (const t of ['technical', 'interpersonal']) {
    const arr = (m.skills || {})[t];
    if (!Array.isArray(arr) || arr.length > 40) E(`$.skills.${t}`, 'array <=40');
    else arr.forEach((s, i) => { if (!isStr(s.measuredBy, 1000)) E(`$.skills.${t}[${i}].measuredBy`, 'nonempty <=1000'); });
  }
  if (!isObj(m.runtime)) E('$.runtime', 'required');
  else if (m.runtime.supportsSolo !== (m.playModes || []).includes('solo')) E('$.runtime.supportsSolo', 'must agree with playModes');
  if (!isObj(m.report) || m.report.reportSchemaVersion !== 1 || typeof m.report.emitsGameReport !== 'boolean') E('$.report', 'reportSchemaVersion 1 and boolean emitsGameReport');
}

export function sourcePreflight(files) {
  const bad = [];
  for (const f of files) {
    const segs = f.split('/');
    const base = segs[segs.length - 1].toLowerCase();
    const hit = segs.some((s) => BLOCKED_SEGMENTS.includes(s.toLowerCase()))
      || (base !== '.env.example' && (base === '.env' || base.startsWith('.env.')))
      || ['.npmrc', '.pypirc', 'id_rsa', 'id_ed25519'].includes(base)
      || /^(credentials|secrets?)(\..*)?$/.test(base)
      || /\.(pem|p12|pfx|key)$/.test(base);
    if (hit) bad.push(f);
  }
  return bad;
}

export function validateAll(root, { meta, sidecar, files } = {}) {
  const errors = [];
  const cat = loadCatalogue(root);
  validateCatalogue(cat, errors);
  meta ??= JSON.parse(fs.readFileSync(path.join(root, 'metadata.json'), 'utf8'));
  sidecar ??= JSON.parse(fs.readFileSync(path.join(root, 'launchdeck.skills.json'), 'utf8'));
  validateMetadata(meta, errors);
  const ctx = {
    root,
    playModes: meta.playModes || [],
    domain: new Map(cat.domainSkills.map((s) => [s.id, s])),
    human: new Map(cat.humanSkills.map((s) => [s.id, s])),
  };
  validateSidecar(sidecar, meta, ctx, errors);
  if (files) for (const f of sourcePreflight(files)) errors.push(`source preflight: blocked path ${f}`);
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  let files;
  try {
    const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    files = execFileSync('git', ['-C', top, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch { files = undefined; console.error('warning: not a git checkout, source preflight skipped'); }
  const errors = validateAll(root, { files });
  if (errors.length) { for (const e of errors) console.error(e); console.error(`FAIL: ${errors.length} error(s)`); process.exit(1); }
  console.log(`OK: metadata.json, launchdeck.skills.json, skill-catalogue.json valid; source preflight ${files ? `passed (${files.length} tracked files)` : 'NOT RUN'}`);
}
