// Negative mutation tests for the artifact gate. Run: node --test tools/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAll, sourcePreflight } from './launchdeck-validate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const fresh = () => ({ meta: load('metadata.json'), sidecar: load('launchdeck.skills.json') });

test('real on-disk artifacts are valid', () => {
  assert.deepEqual(validateAll(root), []);
});

const mutations = {
  'missing primary minimumObservations': (a) => { delete a.sidecar.primarySkill.minimumObservations; },
  'missing secondary minimumObservations': (a) => { delete a.sidecar.secondarySkills[0].minimumObservations; },
  'nested minimumObservations': (a) => { const d = a.sidecar.primarySkill; d.measuredBy = { text: d.measuredBy, minimumObservations: 5 }; delete d.minimumObservations; },
  'string "3" minimumObservations': (a) => { a.sidecar.secondarySkills[0].minimumObservations = '3'; },
  'zero minimumObservations': (a) => { a.sidecar.primarySkill.minimumObservations = 0; },
  'measuredBy as object': (a) => { a.sidecar.primarySkill.measuredBy = { observation: 'x' }; },
  'missing rubricReference': (a) => { delete a.sidecar.primarySkill.rubricReference; },
  'missing limitations': (a) => { delete a.sidecar.secondarySkills[0].limitations; },
  'old modes key': (a) => { const d = a.sidecar.primarySkill; d.modes = d.applicableModes; delete d.applicableModes; },
  'old roles key': (a) => { const d = a.sidecar.primarySkill; d.roles = d.applicableRoles; delete d.applicableRoles; },
  'old rubricRef key': (a) => { const d = a.sidecar.primarySkill; d.rubricRef = d.rubricReference; delete d.rubricReference; },
  'old cannotEstablish key': (a) => { const d = a.sidecar.primarySkill; d.cannotEstablish = d.limitations; delete d.limitations; },
  'object-valued difficulty mapping': (a) => { a.sidecar.difficultyToSkillLevel = { standard: { difficultyCode: 1, skillLevel: 'intermediate' } }; },
  'unknown skill id': (a) => { a.sidecar.primarySkill.skillId = 'refactoring'; },
  'wrong umbrella': (a) => { a.sidecar.secondarySkills[0].v1SkillId = 'critical-thinking'; },
  'mismatched gameVersion': (a) => { a.sidecar.gameVersion = '9.9.9'; },
  'obsolete returnNavigation keys': (a) => { a.sidecar.returnNavigation = { portalVariable: 'LAUNCHDECK_PORTAL_URL', returnVariable: 'LAUNCHDECK_RETURN_URL' }; },
  'invented top-level field': (a) => { a.sidecar.difficultyCodes = {}; },
  'metadata declaration mismatch': (a) => { a.meta.skills.interpersonal = []; },
  'mode not in playModes': (a) => { a.sidecar.primarySkill.applicableModes = ['solo']; },
  'unresolved rubric anchor': (a) => { a.sidecar.primarySkill.rubricReference = 'docs/SKILL_RUBRICS.md#nope'; },
  'primary repeated as secondary': (a) => { a.sidecar.secondarySkills.push({ ...a.sidecar.primarySkill, role: 'secondary' }); },
};

for (const [name, mutate] of Object.entries(mutations)) {
  test(`rejects: ${name}`, () => {
    const a = fresh();
    mutate(a);
    const errs = validateAll(root, a);
    assert.ok(errs.length > 0, `expected rejection for ${name}`);
  });
}

test('source preflight blocks forbidden paths, allows .env.example', () => {
  assert.deepEqual(sourcePreflight(['a/node_modules/x.js', '.env', 'docs/secrets.md', 'k.pem', '.env.example', 'src/A.java']), ['a/node_modules/x.js', '.env', 'docs/secrets.md', 'k.pem']);
});
