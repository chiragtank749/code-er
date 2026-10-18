# Krilern bridge — Code ER

Platform: **Krilern** (krilern.tech). Game title unchanged: *Code ER: the patient must survive*. Target contract: bridge-enabled Platform release (database schema 5), metadata/report schema 1, catalogue `launchdeck-skills-1.0.0`.

## What this game actually is

A facilitated, offline team workshop. Teams work on their own git branch (`team-N`), refactor `RideBookingService` in Java and write characterization tests. The trainer grades branches with a hidden kit (`trainer-kit/`, git-ignored, not in this repository). There is **no server, no browser UI, no player accounts and no in-game identity**. Gameplay was deliberately not redesigned.

## What is implemented

| Artifact | Status |
| --- | --- |
| `metadata.json` | Schema 1 catalogue entry. `runtime.mode` is `"none"` with empty start/health/host/player paths because no runnable service exists. `report.emitsGameReport` is `false`. |
| `launchdeck.skills.json` | Section 6.1 profile: primary `test-design`, secondary `error-detection` (v1 `attention-to-detail`). |
| `skill-catalogue.json` | Full 280-row catalogue transcribed from the standard. |
| `docs/SKILL_RUBRICS.md` | Counters, thresholds, worked examples. |
| `tools/launchdeck-validate.mjs` | Artifact gate + source preflight; `npm run test:launchdeck` (Node 18+, no dependencies). |

## Why there is no report writer / runtime bridge

- Skill evidence (mutants caught, bugs logged) is produced per **team branch** by the trainer kit. The standard forbids copying team results onto individuals as identical ratings, and nothing in the game attributes work to an individual (roles rotate; commits may come from one keyboard). So no truthful per-participant schema-1 report can be written. `emitsGameReport` stays `false`.
- No HTTP service exists, so `PORT`/`HOST`/`PUBLIC_URL`/`HOST_KEY`, `/healthz`, the stdout link block, `x-launchdeck-*` identity, seats, the Leave game / Return to Krilern control and `DATA_DIR/reports/` are not implemented. Adding them would mean building a new web game around the workshop, which this task did not authorise.

## Difficulty and levels

The scenario is fixed (`standard` → `intermediate` in the sidecar). It is not one of easy/medium/hard/complex, so any future report would emit `bridgeDifficulty=0` and therefore `bridgeSkillLevel=0` and every `sk_*_level=0` (unassessed) unless the platform owner approves classifying it as a supported difficulty.

## Return navigation

`returnNavigation` names `LAUNCHDECK_PORTAL_URL` / `LAUNCHDECK_RETURN_URL` as required, but nothing in the game reads them because there is no game page to navigate from. Learners return to Krilern through the portal itself.

## Paths to a real bridge (portal/trainer dependency)

1. Wrap the trainer kit in a small host-authorised service that records the mutation and answer-key results per team and maps trusted `x-launchdeck-user-id` accounts to teams.
2. Decide an individual attribution rule (e.g. per-player characterization test files) before emitting any skill rating.
3. Then implement the section 2–4 and 8 runtime and report contract, and set `emitsGameReport: true` only after tests pass.
