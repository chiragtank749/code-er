# Skill rubrics — Code ER Safety Net Lab (rubricVersion 1)

Catalogue `launchdeck-skills-1.0.0`. Evidence comes from the Safety Net Lab (`lab/`) and is **individual**: each player's own locked probes are evaluated on the server when that player runs the heart monitor. The team's Java refactoring rounds are still graded separately by the trainer and are not part of this evidence.

Shared cutoffs (success rate = successes / observations): `>=0.90` → 5, `>=0.70` → 4, `>=0.50` → 3, `>=0.25` → 2, otherwise 1. Below the minimum sample there is no rating (the rating is omitted, never reported as 0). Implementation: `rating()` in `lab/engine.mjs`. The boundaries are tested in `tests/bridge.test.mjs` (V22).

## Difficulty levels

| Difficulty | Report code | Skill level (code) | Probe types | Broken copies | Bugs in key | Required probes |
| --- | --- | --- | --- | --- | --- | --- |
| easy | 1 | beginner (1) | fare | 8 | 3 | 5 |
| medium | 2 | intermediate (2) | fare, book, cancel | 20 | 5 | 8 |
| hard | 3 | advanced (3) | + rate, register | 27 | 7 | 10 |
| complex | 4 | advanced (3) | all | 30 (adds subtle validation mutants) | 9 | 12 |

The difficulty, skill level and rubric version are fixed when the host starts the match. Any attempt to change settings after that returns HTTP 409.

## test-design

Primary, domain, v1 `technical` / `test-design`.

- **Observation:** one broken copy (mutant) in the match's difficulty. There are `observations = mutant count` once the player has run the monitor, and 0 before.
- **Success:** at least one of the player's locked probes gives a different canonical result on the mutant than on the original. Expected values are always computed by the server from the original code; the client never supplies them.
- **Minimum:** 5 observations (every level has 8 or more).
- **Metrics:** `sk_test-design_observations`, `sk_test-design_successes`, `sk_test-design_rating`, `sk_test-design_level`.
- Successful example: the probe `calcFare("MINI", 10, 12, "")` catches M1, the copy where the boundary `km<=10` became `km<10`.
- Unsuccessful example: probes that only use MINI at noon never catch M8 (SUV night surcharge dropped).
- Worked examples at easy (8 copies): 8 caught → 1.00 → 5; 6 → 0.75 → 4; 4 → 0.50 → 3; 2 → 0.25 → 2; 1 → 0.125 → 1. At medium (20): 14 → 0.70 → 4; 13 → 0.65 → 3.

## error-detection

Secondary, human, v1 `interpersonal` / `attention-to-detail`.

- **Observation:** one suspected bug in the difficulty's answer key (`BUGS` in `lab/engine.mjs`).
- **Success:** the player flags that bug category on a locked probe that actually reproduces it, judged by the server-side `exhibits` predicate. Each bug counts once. Decoy categories and wrong flags count as `falseBugFlags` and never add successes.
- **Minimum:** 3 observations.
- **Metrics:** `sk_error-detection_observations`, `sk_error-detection_successes`, `sk_error-detection_rating`, `sk_error-detection_level`.
- Successful example: flagging "Promo codes are case-sensitive" on `calcFare("MINI", 23, 23, "flat30")`.
- Unsuccessful example: flagging the same category on `calcFare("MINI", 5, 12, "FLAT30")`, which does not reproduce it.
- Worked examples at easy (3 bugs): 3 → 5; 2 → 0.67 → 3; 1 → 0.33 → 2; 0 → 1. At medium (5): 4 → 0.80 → 4.

## Transport

`error-detection` is sent on the wire as the umbrella `attention-to-detail` (interpersonal). Only team mode exists, so that entry is always emitted when the evidence is sufficient. The canonical IDs stay in the numeric `sk_*` metrics.

## Modes and roles

Team mode only. The workshop roles rotate and are not tracked (`applicableRoles: []`). Team score is the union of the members' caught copies and is reported only on `teams`. A teammate who stays silent gets no evidence. Message volume and time online are never used.
