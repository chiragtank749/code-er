// Proves the lab's JavaScript port matches the real Java RideBookingService on a large probe grid.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runProbe, MUTANTS, DIFFICULTIES, BUGS } from '../lab/engine.mjs';

const root = path.resolve(import.meta.dirname, '..');
const N = '<null>';
const enc = (v) => (v === null ? N : String(v));

function grid() {
  const probes = [];
  const types = ['MINI', 'mini', 'Sedan', 'SUV', 'suv', 'BIKE', '', null];
  const kms = [-5, 0, 0.5, 1, 4.16, 5, 9.99, 10, 10.01, 11, 37.5, 100, 100.5];
  const hours = [-1, 0, 5, 6, 12, 21, 22, 23, 24];
  const promos = [null, '', 'NONE', 'none', 'FLAT30', 'flat30', 'XYZ'];
  for (const type of types) for (const km of kms) for (const hour of hours) for (const promo of promos) probes.push(['fare', { type, km, hour, promo }]);
  for (const type of ['MINI', 'SEDAN', 'suv', 'BIKE', null]) for (const km of [0, 2, 10, 50, 100, 101]) for (const promo of [null, 'FLAT30', 'X'])
    for (const [name, phone] of [['Riya', '9876543210'], ['', '9876543210'], ['  ', '9876543210'], [null, '1'], ['Al', '98765432101'], ['Al', '987654321'], ['Al', null]])
      probes.push(['book', { name, phone, type, km, hour: 23, promo }]);
  for (const type of ['MINI', 'SEDAN', 'SUV', 'bike', null]) for (const km of [3, 0, 120]) for (const minutes of [-1, 0, 5, 6, 60]) for (const completeFirst of [false, true])
    probes.push(['cancel', { type, km, minutes, completeFirst }]);
  for (const ratings of [[5], [1], [3, 4], [0], [6], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [2, 5, 9]]) probes.push(['rate', { ratings }]);
  for (const [name1, type1, name2, type2] of [['Ann', 'MINI', 'ann', 'MINI'], ['Ann', 'MINI', 'Ann', 'SUV'], ['', 'MINI', 'B', 'SEDAN'], ['  ', 'mini', 'x', 'TRUCK'], [null, null, 'Ann', 'suv'], ['Ann ', 'SUV', 'Ann', 'SUV']])
    probes.push(['register', { name1, type1, name2, type2 }]);
  return probes;
}

const line = ([k, i]) => {
  switch (k) {
    case 'fare': return [k, enc(i.type), i.km, i.hour, enc(i.promo)];
    case 'book': return [k, enc(i.name), enc(i.phone), enc(i.type), i.km, i.hour, enc(i.promo)];
    case 'cancel': return [k, enc(i.type), i.km, i.minutes, i.completeFirst];
    case 'rate': return [k, i.ratings.join(',')];
    case 'register': return [k, enc(i.name1), enc(i.type1), enc(i.name2), enc(i.type2)];
  }
};

test('JS port matches real Java patient on probe grid', { timeout: 120000 }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
  execFileSync('javac', ['-d', out, path.join(root, 'src/main/java/com/codeer/ride/RideBookingService.java'), path.join(root, 'tests/parity/ParityHarness.java')]);
  const probes = grid();
  const input = probes.map((p) => line(p).join('\t')).join('\n') + '\n';
  const javaOut = execFileSync('java', ['-cp', out, 'com.codeer.ride.ParityHarness'], { input, encoding: 'utf8', maxBuffer: 64 << 20 }).trimEnd().split('\n');
  assert.equal(javaOut.length, probes.length);
  let mismatches = [];
  probes.forEach((p, idx) => {
    const js = runProbe(p[0], p[1]).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
    if (js !== javaOut[idx]) mismatches.push({ probe: p, js, java: javaOut[idx] });
  });
  assert.deepEqual(mismatches.slice(0, 5), []);
});

test('every mutant is killable by some grid probe, and every bug is exhibited', () => {
  const probes = grid();
  for (const mid of Object.keys(MUTANTS)) {
    assert.ok(probes.some(([k, i]) => runProbe(k, i) !== runProbe(k, i, new Set([mid]))), `mutant ${mid} equivalent on grid`);
  }
  for (const [bid, b] of Object.entries(BUGS)) assert.ok(probes.some(([k, i]) => b.exhibits(k, i)), `bug ${bid} never exhibited`);
  for (const d of Object.values(DIFFICULTIES)) assert.ok(d.mutants.length >= 5 && d.bugs.length >= 3);
});
