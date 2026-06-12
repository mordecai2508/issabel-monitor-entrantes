# requirements.md — dashboard_extensions_status

> Feature ID: 18 | Notación EARS | Revisión: 2026-06-12

---

## Configuración AMI

**R1.** THE SYSTEM SHALL support an optional `ami` configuration block in `config.json` (and a documented placeholder in `config.example.json`) containing `host`, `port`, `username`, and `password`, independent from and analogous to the existing `db` block, used exclusively for read-only Asterisk Manager Interface (AMI) operations.

**R2.** IF the `ami` configuration block is absent, empty, or missing required fields (`host`, `port`, `username`, `password`) THEN THE SYSTEM SHALL treat the AMI integration as "not configured" without throwing a startup error and without preventing the rest of the server (CDR queries, SSE, existing endpoints) from starting normally.

---

## Consulta de endpoints PJSIP vía AMI

**R3.** WHILE the server is running AND `ami` is configured THE SYSTEM SHALL periodically query the Asterisk Manager Interface for the list of configured PJSIP/SIP endpoints and their registration/contact status.

**R4.** WHEN an AMI endpoint query completes successfully THE SYSTEM SHALL store, for each reported endpoint, its identifier (`extension`) and a normalized status value indicating whether it is currently registered/reachable (`active`) or not (`inactive`).

**R5.** THE SYSTEM SHALL NOT issue any write/action commands to the Asterisk Manager Interface other than those strictly required to read endpoint configuration and registration state (read-only AMI usage).

**R6.** THE SYSTEM SHALL respond to requests for extension status using the result of the most recent successful AMI query (cached in memory), without requiring a new AMI query on every request, so that response time is not affected by AMI latency.

---

## Endpoint REST: GET /api/pbx/extensions

**R7.** WHEN an authenticated user sends `GET /api/pbx/extensions` AND the AMI integration is configured and has completed at least one successful query THE SYSTEM SHALL return HTTP 200 with `{ ok: true, data: { total, active, extensions, available: true } }`, where `total` is the number of reported PJSIP/SIP endpoints, `active` is the number of those endpoints currently registered, and `extensions` is an array of `{ extension, status }` objects (one per endpoint, `status` being `"active"` or `"inactive"`).

**R8.** IF an unauthenticated client sends `GET /api/pbx/extensions` THEN THE SYSTEM SHALL return HTTP 401, without returning any extension status data.

---

## Manejo de "no configurado" y fallos de conexión

**R9.** IF `ami` is not configured (per R2) WHEN `GET /api/pbx/extensions` is requested by an authenticated user THEN THE SYSTEM SHALL return HTTP 200 with `{ ok: true, data: { total: 0, active: 0, extensions: [], available: false } }`.

**R10.** IF the AMI connection or query fails (connection error, authentication error, or timeout) THEN THE SYSTEM SHALL treat the extension status as unavailable, retain the previously cached successful result if one exists for the purposes of R6, and IF no successful query has ever completed THEN `GET /api/pbx/extensions` SHALL return `{ ok: true, data: { total: 0, active: 0, extensions: [], available: false } }` with HTTP 200.

**R11.** WHEN an AMI connection or query attempt fails THE SYSTEM SHALL log the failure for diagnostic purposes and SHALL NOT crash the server process or interrupt any other endpoint, SSE stream, or polling cycle.

---

## Rendimiento y no bloqueo

**R12.** THE SYSTEM SHALL perform AMI endpoint queries without noticeably degrading the performance of the existing periodic real-time update cycle (`/api/events` `update` broadcast every `pollIntervalMs`); AMI queries SHALL NOT block or delay that cycle.

**R13.** IF an AMI query does not complete within a bounded time limit THEN THE SYSTEM SHALL treat it as a failed query (per R10) with a descriptive internal error, rather than leaving the AMI connection or the calling code waiting indefinitely.

---

## Visualización en el dashboard

**R14.** THE SYSTEM SHALL display, on the main dashboard, an indicator labeled "Extensiones" showing the `total` value from `GET /api/pbx/extensions`.

**R15.** THE SYSTEM SHALL display, on the main dashboard, an indicator labeled "Activas" showing the `active` value from `GET /api/pbx/extensions`.

**R16.** WHEN the dashboard loads or refreshes its extension status data AND `available` is `false` THEN THE SYSTEM SHALL display the "Extensiones" and "Activas" indicators in a way that communicates the data is unavailable (e.g. showing `0` or a neutral placeholder) without showing an error that blocks or hides the rest of the dashboard's KPIs and charts.

**R17.** IF the request for extension status fails at the network/HTTP level (distinct from `available: false` reported by the API itself) THEN THE SYSTEM SHALL display the "Extensiones"/"Activas" indicators in a neutral/unavailable state and SHALL NOT crash or block the rendering of the rest of the dashboard.

---

## Compatibilidad y seguridad

**R18.** THE SYSTEM SHALL NOT modify the behavior of the existing endpoints `GET /api/calls/today`, `GET /api/calls/range`, `GET /api/events`, and `GET /api/pbx/health`/`POST /api/pbx/sync`; these SHALL continue to operate exactly as before, independently of the AMI integration introduced by this feature.

**R19.** THE SYSTEM SHALL NOT write to, modify, or alter the schema of the Issabel CDR database (`asteriskcdrdb.cdr`) as part of this feature; the AMI integration operates over a separate channel (TCP AMI protocol) and SHALL NOT use the MySQL `pool` for extension status data.

**R20.** THE SYSTEM SHALL NOT expose the AMI username or password in any API response, log message, or error message returned to the client.
