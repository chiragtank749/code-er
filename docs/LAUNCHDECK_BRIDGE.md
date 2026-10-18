# Krilern bridge — Code ER (1.1.0)

Platform: **Krilern** (krilern.tech). Game title unchanged: *Code ER: the patient must survive*. Target contract: bridge-enabled Platform release (database schema 5), metadata/report schema 1, catalogue `launchdeck-skills-1.0.0`.

## Flow

The Java refactoring workshop (team branches, `mvn test`, the trainer's hidden monitor) is unchanged. Version 1.1.0 adds the **Safety Net Lab**, a zero-dependency Node web game for Round 2 (`lab/`):

1. The host opens `/host`, enters the HOST KEY, picks a difficulty (easy, medium, hard or complex) and the team count, then starts the match. Settings are locked once it starts.
2. Players open `/join`, pick a nickname and a team, and probe the original `RideBookingService`. The probes run against a JavaScript port that `tests/parity.test.mjs` proves matches the real Java class on about 5,000 inputs. Players lock probes in as characterization tests and can flag suspected bugs.
3. "Run the heart monitor" evaluates the player's own probes against that difficulty's broken copies and the answer key. This happens once, on the server.
4. The host ends the session. One immutable schema-1 report is written atomically to `DATA_DIR/reports/<UTC>-<reportId>.json`, and the server prints `GAME REPORT : reports/...` to stdout.
5. Players use **Leave game** before finishing (with a confirmation) or **Return to Krilern** after finishing.

## Runtime

| Setting | Value |
| --- | --- |
| Build | `npm ci` (no dependencies; installs nothing) |
| Start | `node lab/server.mjs` |
| Port / health | `PORT` (default 3000) / `GET /healthz` |
| Host / player | `/host` / `/join` |
| Host key | `HOST_KEY`, used byte-for-byte. The browser sends it base64url-encoded in `x-host-key-b64` so leading and trailing whitespace survive HTTP. It is compared with a constant-time digest comparison. If unset, a random 12-character key is generated. |
| Data | `DATA_DIR` (default `./data`): `state.json` plus `reports/` |
| Docker | `Dockerfile` (non-root user, `/data` volume). Tested with `--read-only --tmpfs /tmp -v vol:/data`. |

## Identity and trust

`x-launchdeck-user-id` and `x-launchdeck-session-id` are trusted **only** when `LAUNCHDECK_SESSION_ID` is set (the Krilern integrated runtime) or `LAUNCHDECK_TRUST_HEADERS=1`. Otherwise they are ignored and every player is an unlinked guest. The container must only be reachable through the Krilern ingress, which strips client-supplied `x-launchdeck-*` headers. Do not publish the port directly when headers are trusted. A session header that conflicts with `LAUNCHDECK_SESSION_ID` gets HTTP 409.

Seats:
- Each seat carries a random HttpOnly cookie token. The server stores only its SHA-256 hash.
- Each account gets at most one seat per match. A second tab of the same account resumes that seat.
- On every request, the account on a seat must match the current account. A token used by a different account, or by a guest after authentication is lost, gets HTTP 403.
- Body and query `userId` values are ignored, and nicknames never decide who an account is.

There is no WebSocket. The UI polls `GET /api/state`, so V07 does not apply.

## Leaving and returning

- `POST /api/leave` is idempotent. It persists `status=left` before replying. `leftEarly` is true only when the player leaves before completing, and rejoining after an unfinished leave is refused.
- Completing and then leaving keeps the completion.
- The match continues for everyone else. The departing player's facts stay in the single final report.
- If saving fails, the UI offers Retry or "Leave without saving" and never claims anything was saved.
- The return destination comes only from server configuration:
  - `LAUNCHDECK_PORTAL_URL` must be https, credential-free, and parse as a URL. Plain http is accepted only for localhost.
  - `LAUNCHDECK_RETURN_URL` is used only when its origin is exactly the portal's origin.
  - Query and body overrides are ignored.
  - With no portal configured, the page says "No portal return address is configured".
- The game never claims the passport was updated. It only says "Saved by game".

**Krilern admin setup:** enable the standard integrated runtime so Krilern injects `LAUNCHDECK_PORTAL_URL`. Set `LAUNCHDECK_RETURN_URL` to `<portal>/#view=passport` only after confirming the deployed portal supports that route.

## Reports

- `reportId` is a UUID v4 created with the match. Retries reuse it, and a written report is never rewritten.
- If the report write fails, `/api/host/end` returns 503 and the write is retried every 3 s with the same ID.
- SIGTERM/SIGINT during a match writes an abandoned report (in well under 2 s) and keeps players who already completed. A finalized match stays ended after a restart, and the host must start a new match (with a new ID).
- An abrupt restart resumes an unfinalized running match.
- A new match is refused at 990 report files or 15 MiB.
- Metrics follow section 8: `bridge*`, `sk_test-design_*`, `sk_error-detection_*`, plus `lockedProbes` and `falseBugFlags`. `bridgeHostAdjustedScore` is always false because there are no host bonuses.

## Limitations

- REAL PLATFORM VALIDATOR: NOT RUN. Reports pass the local checker (`tools/launchdeck-report.mjs`), which is not Krilern's validator.
- The real gateway, collector, passport and points engine are untested (V29/V30). An older portal may ignore `launchdeck.skills.json` and show no human-skill cards or points.
- Choosing a bug category from a list is easier than finding a bug unaided. The rubric limitations say so.
