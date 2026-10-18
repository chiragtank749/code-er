# Changelog

## 1.1.0 — 2026-10-18

- Added the Safety Net Lab (`lab/`), a zero-dependency Node web companion for Round 2. Each player probes the original `RideBookingService`, locks in characterization probes, flags suspected bugs and runs a heart monitor against hidden broken copies.
- Added four difficulty levels: easy (8 copies, 3 bugs), medium (20, 5), hard (27, 7) and complex (30, 9).
- Added the Krilern runtime contract: stdout link block, `/healthz`, host key, trusted account seats, Leave game / Return to Krilern, and atomic immutable schema-1 reports with individual skill evidence.
- `metadata.json` now declares a runnable Node service and `emitsGameReport: true`. The sidecar maps each difficulty to a skill level.
- Added a Dockerfile, a JS↔Java parity test, a bridge test suite, browser capture and the game_iamge screenshots.
- The Java workshop, `pom.xml` and `ContractSmokeTest` are unchanged.

## 1.0.0 — 2026-10-18

- Added Krilern catalogue artifacts, the artifact validator with negative tests, and the bridge, rubric and test-report docs.
