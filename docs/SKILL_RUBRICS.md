# Skill rubrics — Code ER (rubricVersion 1)

Catalogue `launchdeck-skills-1.0.0`. Difficulty: the game has one fixed scenario, recorded as `standard` and mapped to `intermediate` (report code: difficulty 0 = custom/unspecified, so any future report must emit level 0 unless a supported difficulty classification is added; see `docs/LAUNCHDECK_BRIDGE.md`).

All evidence is **team-branch evidence** produced by the trainer's offline kit (`trainer-kit/`, never committed). It must not be copied onto individual players as identical ratings. That is why `metadata.json` declares `report.emitsGameReport: false`.

Shared cutoffs (success rate = successes / observations): `>=0.90` → 5, `>=0.70` → 4, `>=0.50` → 3, `>=0.25` → 2, otherwise 1. Below the minimum sample: no rating (never 0).

## test-design

Primary, domain, v1 `technical` / `test-design`.

- **Observation:** one secretly broken copy (mutant) run against the team's `CharacterizationTest.java`.
- **Success:** at least one test fails on the mutant. Precondition: every test passes on the original `patient-v0` code; if not, no rating.
- **Denominator:** mutants run. **Minimum:** 5.
- **Metrics:** `sk_test-design_observations`, `sk_test-design_successes`.
- Successful example: mutant changes `km <= 10` to `km < 10`; a `@CsvSource` row at `km=10` fails → success.
- Unsuccessful example: mutant drops the SUV night surcharge; no test uses `hour>=22` → not caught.
- Worked examples (10 mutants): 9 → 0.90 → 5; 7 → 0.70 → 4; 6 → 0.60 → 3; 5 → 0.50 → 3; 3 → 0.30 → 2; 2 → 0.20 → 1. 4 mutants run → no rating.

## error-detection

Secondary, human, v1 `interpersonal` / `attention-to-detail`.

- **Observation:** one seeded suspected bug in the trainer's answer key.
- **Success:** logged in `SURGERY_NOTES.md` with a reproducing input, and the code still behaves as before (logged, not fixed). A "fixed" bug is not a success.
- **Denominator:** answer-key bugs. **Minimum:** 3.
- **Metrics:** `sk_error-detection_observations`, `sk_error-detection_successes`.
- Worked examples (4 bugs): 4 → 1.00 → 5; 3 → 0.75 → 4; 2 → 0.50 → 3; 1 → 0.25 → 2; 0 → 1.

## Modes and roles

Only `team` mode exists. In-game roles (Surgeon, Diagnostician, …) rotate and are not tracked, so `applicableRoles` is `[]`. Message volume, commit counts or time online are never used as evidence.
