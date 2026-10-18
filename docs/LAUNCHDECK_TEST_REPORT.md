# Krilern test report — Code ER 1.1.0

Run: 2026-10-18 (UTC), branch `claude/hopeful-dirac-x26vk0`. Node 22, OpenJDK 17+, Chromium 1194 through Playwright 1.56.1, Docker 29.8.2.

| Command | Result |
| --- | --- |
| `npm run test:launchdeck` | exit 0. Artifact gate plus 23 tests: the real artifacts pass, 21 single-field mutations are each rejected, and the source preflight check passes. |
| `npm run test:bridge` | exit 0. Adds 25 tests: JS↔Java parity and the bridge suite. Log in `docs/bridge-evidence/test-bridge.log`. |
| `npm run capture` | exit 0. Real browser play; log in `docs/bridge-evidence/browser-run.log`. |
| `docker build --build-arg BASE_IMAGE=mirror.gcr.io/library/node:22-alpine -t code-er-lab:test .` then `docker run --read-only --tmpfs /tmp -v cerdata:/data …` | Image `sha256:e0544325…01dfa`. See V26. |
| `mvn test` | exit 0 (Java workshop unchanged) |

REAL PLATFORM VALIDATOR: NOT RUN. The Krilern repository is not accessible in this session. Every report check below uses the local `tools/launchdeck-report.mjs`.

| Case | Status | Evidence | Limit |
| --- | --- | --- | --- |
| V01 Standalone boot | PASS | bridge.test.mjs "V01/V02" | — |
| V02 Runtime/stdout | PASS | exact three-line block; whitespace host key unchanged; empty stderr | — |
| V03 Authentication | PASS | all 6 host ops reject missing or wrong key, role header, query key, plain header | — |
| V04 Two accounts | PASS | gateway, identical nickname "Sam" → acct-A/acct-B in report; browser run with "CyberTiger" ×2 | simulated gateway |
| V05 Rename | PASS | "Samira" keeps seat, probes, account | — |
| V06 HTTP spoof | PASS | header/body/query acct-B stripped/ignored | simulated gateway |
| V07 WebSocket spoof | NOT APPLICABLE | No WebSocket; realtime is HTTP polling through the same checked path | — |
| V08 Seat theft | PASS | B or guest with A's token → 403 on read and mutation | — |
| V09 Duplicate tabs | PASS | second tab resumes the same seat; one report participant | — |
| V10 Reconnect/restart | PASS | SIGKILL + restart keeps match, seat, probes | — |
| V11 No activity | PASS | idle joiner: completed=false, skills [], observations 0 | — |
| V12 Early leave | PASS | idempotent leave, leftEarly=true, others keep playing | — |
| V13 Completed return | PASS | completed=true, bridgeLeftEarly=false after leave | — |
| V14 Save failure | PASS | injected write failure → 503, no change; retry adds one probe; duplicate ignored | fault hook `CODEER_FAULT_FILE` (test only) |
| V15 Return config | PASS | browser: same-tab cross-origin nav to portal stub `#view=passport`; null without config | local portal stub |
| V16 Unsafe returns | PASS | javascript:, data:, credentials, http non-local, foreign origin, query override rejected | — |
| V17 Mode outcomes | PASS | completed rank-1 player below 70% has bridgeWon=false; team mode only | no bots, no solo mode |
| V18 Finalization | PASS | full match via real API and browser UI → one atomic report + `GAME REPORT` line | — |
| V19 Immutable retry | PASS | double end, leave after end and restart: same file, same SHA-256 | — |
| V20 Graceful shutdown | PASS | SIGTERM <2 s → abandoned report; completed player stays completed; terminal after restart | — |
| V21 Writer failure/limits | PASS | failed report write → 503, retry keeps the reportId; 990 files → 507; `/_launchdeck/*` 404 | — |
| V22 Skills/rubrics | PASS | artifact gate + mutations; all rating boundaries; silent teammate gets no evidence; sidecar metrics present in real reports | — |
| V23 Transport | PASS | error-detection → attention-to-detail, emitted in team mode | no solo mode |
| V24 Levels | PASS | each of easy/medium/hard/complex: codes 1-4 → levels 1/2/3/3; units bounded; settings 409 after start | — |
| V25 Bad provenance | PASS (local only) | local validator rejects wrong session, version, duplicate account, undeclared skill, bad id, successes > observations, unknown field | not the real validator |
| V26 Read-only container | PASS | `--read-only` image: `/app` not writable; health, join, probes, monitor, report in `/data`; `docker stop` clean | built from mirror.gcr.io (Docker Hub 429) |
| V27 UI/mobile | PASS | browser at 1600, 390, 320 CSS px and 360x640@3: no horizontal overflow; exit control visible; keyboard-opened dialog | Chromium only |
| V28 Images | PARTIAL | game_iamge/README.md: 7 real captures measured and inspected | header cover crop weak |
| V29 Private test | NOT RUN | no Krilern staging access | — |
| V30 Real bridge | NOT RUN | no Krilern staging access | — |

Evidence in `docs/bridge-evidence/`: `integrated-completed-report.json` (from the gateway run), `browser-completed-report.json` (from the browser run), `abandoned-report.json` (from SIGTERM), `test-bridge.log`, `browser-run.log`. All IDs are fictional.
