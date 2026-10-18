# Krilern test report — Code ER 1.0.0

Date (UTC): 2026-10-18. Commands: `npm run test:launchdeck` (artifact gate + 23 negative/positive mutation tests + source preflight: exit 0); `mvn test` (exit 0, gameplay unchanged).

REAL PLATFORM VALIDATOR: NOT RUN — the Krilern repository (`services/platform/src/game-contract.mjs`, `game-reports.mjs`) is not accessible in this session.

| Case | Status | Evidence / reason |
| --- | --- | --- |
| V01 Standalone boot | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V02 Runtime/stdout | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V03 Authentication | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V04 Two accounts | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V05 Rename | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V06 HTTP spoof | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V07 WebSocket spoof | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V08 Seat theft | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V09 Duplicate tabs | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V10 Reconnect/restart | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V11 No activity | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V12 Early leave | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V13 Completed return | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V14 Save failure | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V15 Return config | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V16 Unsafe returns | NOT APPLICABLE | NOT APPLICABLE — no server/UI exists; game is a git+Maven workshop (docs/LAUNCHDECK_BRIDGE.md) |
| V17 Mode outcomes | NOT APPLICABLE | Team scoring is done by the trainer kit, not in this repository |
| V18 Finalization | NOT APPLICABLE | No report writer: evidence is team-level only (`emitsGameReport: false`) |
| V19 Immutable retry | NOT APPLICABLE | No reports emitted |
| V20 Graceful shutdown | NOT APPLICABLE | No running process |
| V21 Writer failure/limits | NOT APPLICABLE | No reports emitted |
| V22 Skills/rubrics | PASS (artifacts) | `npm run test:launchdeck`; rubric boundaries documented in docs/SKILL_RUBRICS.md. Metrics are produced only by the external trainer kit, not by code here — not verified |
| V23 Transport | PASS (artifacts) | `error-detection` → `attention-to-detail`; metadata declarations checked equal to transport ids |
| V24 Levels | NOT APPLICABLE | No reports; fixed `standard` difficulty documented as code 0 in docs/LAUNCHDECK_BRIDGE.md |
| V25 Bad provenance | NOT RUN | Real validator unavailable; no reports to validate |
| V26 Read-only container | NOT APPLICABLE | No runnable service image |
| V27 UI/mobile | NOT APPLICABLE | No UI |
| V28 Images | NOT RUN | No real screens exist to capture; see game_iamge/README.md |
| V29 Private test | NOT RUN | No Krilern staging access |
| V30 Real bridge | NOT RUN | No Krilern staging access; no report writer |
