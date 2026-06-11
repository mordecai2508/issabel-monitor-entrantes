# requirements.md — pbx_health

> Feature ID: 14 | Notación EARS | Revisión: 2026-06-10

---

## Endpoint: GET /api/pbx/health

**R1.** WHEN an authenticated user sends `GET /api/pbx/health` THE SYSTEM SHALL return HTTP 200 with the current connection status to the Issabel database, including: `connected` (boolean), `lastCheck` (ISO 8601 timestamp of the most recent verification), `lastError` (string describing the most recent connection error, or `null` if the last verification succeeded), and `latencyMs` (number, the duration in milliseconds of the most recent verification).

**R2.** IF an unauthenticated client sends `GET /api/pbx/health` THEN THE SYSTEM SHALL return HTTP 401, without returning any connection status data.

**R3.** WHEN `GET /api/pbx/health` is requested and no verification has been performed yet since the server started THE SYSTEM SHALL perform a verification synchronously before responding, so that `lastCheck` is never `null` in a successful response.

**R4.** THE SYSTEM SHALL respond to `GET /api/pbx/health` using the result of the most recent verification (performed periodically in the background or on demand), without requiring a new verification on every request, so that the response time is not affected by the latency of the Issabel database.

---

## Endpoint: POST /api/pbx/sync

**R5.** WHEN an authenticated user sends `POST /api/pbx/sync` THE SYSTEM SHALL perform a new, on-demand verification of the connection to the Issabel database immediately (regardless of when the last periodic verification ran), update the stored connection status with its result, and return HTTP 200 with the same shape described in R1 (`connected`, `lastCheck`, `lastError`, `latencyMs`) reflecting this new verification.

**R6.** IF an unauthenticated client sends `POST /api/pbx/sync` THEN THE SYSTEM SHALL return HTTP 401, without performing any verification.

**R7.** IF a verification triggered by `POST /api/pbx/sync` cannot reach the Issabel database (connection error or timeout) THEN THE SYSTEM SHALL still return HTTP 200 with `connected: false` and a non-null `lastError` describing the failure — a failed verification is a successful execution of the sync operation, not an HTTP error.

---

## Verificación periódica de la conexión

**R8.** WHILE the server is running THE SYSTEM SHALL periodically verify the connection to the Issabel database in the background, independently of whether any client has requested `/api/pbx/health`.

**R9.** IF a verification of the connection to the Issabel database does not complete within a bounded time limit THEN THE SYSTEM SHALL treat it as a failed verification (`connected: false`) with a `lastError` describing the timeout, rather than leaving the request pending indefinitely.

**R10.** THE SYSTEM SHALL measure `latencyMs` as the time elapsed between starting and completing (or timing out) each verification, regardless of whether the verification succeeded or failed.

---

## Evento SSE 'pbx_status'

**R11.** WHEN a verification of the connection to the Issabel database (periodic or manual) completes with a `connected` value different from the value determined by the immediately preceding verification THE SYSTEM SHALL broadcast a `pbx_status` event to all connected real-time clients, containing at least `connected`, `lastCheck`, `lastError`, and `latencyMs`.

**R12.** IF a verification of the connection to the Issabel database completes with the same `connected` value as the immediately preceding verification THEN THE SYSTEM SHALL NOT broadcast a `pbx_status` event for that verification (no duplicate notifications for an unchanged status).

**R13.** WHEN the very first verification of the connection (since server start) completes THE SYSTEM SHALL NOT broadcast a `pbx_status` event for it, since there is no previous status to compare against; this initial status SHALL only be available via `GET /api/pbx/health` or the `init` event of the existing real-time channel.

---

## Indicador visual y notificación en el frontend

**R14.** THE SYSTEM SHALL display a PBX connection status indicator in the application's main layout, visible on every authenticated screen, showing a distinct visual state for "connected" (e.g. green) and "disconnected" (e.g. red).

**R15.** WHEN the application starts (or the user logs in) THE SYSTEM SHALL initialize the PBX connection status indicator using the result of `GET /api/pbx/health`.

**R16.** WHEN a `pbx_status` event is received indicating the connection has changed from connected to disconnected THE SYSTEM SHALL update the status indicator to the "disconnected" state and display a toast notification informing the user that the connection to the PBX was lost.

**R17.** WHEN a `pbx_status` event is received indicating the connection has changed from disconnected to connected THE SYSTEM SHALL update the status indicator to the "connected" state; THE SYSTEM MAY also display a toast notification informing the user that the connection to the PBX was restored.

**R18.** WHEN the user activates a manual synchronization action associated with the status indicator THE SYSTEM SHALL call the on-demand verification, display a loading/pending state while the request is in progress, and update the indicator and any displayed details (`lastCheck`, `lastError`, `latencyMs`) with the result once it completes.

**R19.** IF the request for `GET /api/pbx/health` or the manual synchronization action fails at the network/HTTP level (distinct from a PBX disconnection reported by the API itself) THEN THE SYSTEM SHALL display the status indicator in a neutral/unknown state rather than incorrectly showing "connected", and SHALL NOT crash or block the rest of the interface.

---

## Compatibilidad y seguridad

**R20.** THE SYSTEM SHALL NOT modify the behavior of the existing endpoints `GET /api/calls/today`, `GET /api/calls/range`, and `GET /api/events`; these SHALL continue to operate exactly as in v1.0, independently of the connection-verification mechanism introduced by this feature.

**R21.** THE SYSTEM SHALL NOT write to, modify, or alter the schema of the Issabel CDR database (`asteriskcdrdb.cdr`); connection verification SHALL only use read-only operations that do not depend on the existence or content of any specific table or row.

**R22.** THE SYSTEM SHALL perform connection verifications without noticeably degrading the performance of the existing periodic real-time update cycle (`/api/events` `update` broadcast every `pollIntervalMs`); verification SHALL NOT block or delay that cycle.

**R23.** WHEN the existing real-time channel emits its `init` event to a newly connected client THE SYSTEM SHALL include the current PBX connection status (same shape as R1) alongside the existing data, so the frontend can initialize the indicator without an additional request when real-time data is already being loaded.
