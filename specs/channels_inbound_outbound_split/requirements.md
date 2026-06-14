# requirements.md — channels_inbound_outbound_split

> Feature #20 — Separar canales/troncales entrantes y salientes para evitar
> contar llamadas extensión-extensión como salientes.

---

## Configuración y migración

R1. THE SYSTEM SHALL store the configured trunk/channel lists in
    `config.channels.inbound` (array of channel name prefixes) and
    `config.channels.outbound` (array of channel name prefixes), replacing the
    v1.0 flat `config.channels` array.

R2. WHEN the system loads `config.json` and `config.channels` is a plain array
    (v1.0 format) THE SYSTEM SHALL automatically convert it in memory to
    `{ inbound: <the array>, outbound: [] }` before continuing startup.

R3. WHEN the system performs the migration described in R2 THE SYSTEM SHALL
    persist the converted `channels` structure back to `config.json`, without
    discarding or altering any other top-level key (`db`, `ami`, `server`,
    `channelAliases`, `queues`, `lostDestinations`, `smtp`, `users`, `app`).

R4. IF `config.channels` is already an object with `inbound` and/or `outbound`
    arrays (v2.0 format) THEN THE SYSTEM SHALL use it as-is without rewriting
    `config.json`, defaulting any missing list (`inbound` or `outbound`) to an
    empty array in memory.

R5. IF `config.channels` is absent entirely (e.g. a fresh `config.example.json`)
    THEN THE SYSTEM SHALL treat both `channels.inbound` and `channels.outbound`
    as empty arrays without error.

R6. `config.example.json` SHALL define `channels` using the new
    `{ inbound: [...], outbound: [...] }` structure, with `channels.outbound`
    including `"SIP/SALIENTE_CALL"` as a documented example value.

---

## Filtrado de direcciones (in / out / null)

R7. WHEN a CDR record is evaluated with `direction = 'in'` THE SYSTEM SHALL
    include the record only if its normalized channel (after applying the
    existing channel-suffix cleanup) is present in `channels.inbound`.

R8. WHEN a CDR record is evaluated with `direction = 'out'` THE SYSTEM SHALL
    include the record only if its normalized channel is present in
    `channels.outbound`, evaluated explicitly — never by exclusion of
    `channels.inbound` or any other list.

R9. WHEN a CDR record is evaluated with `direction = 'out'` and its normalized
    channel starts with `Local/` THE SYSTEM SHALL exclude the record (internal
    extension-to-extension calls are never counted as outbound), regardless of
    the contents of `channels.outbound`.

R10. IF `channels.outbound` is empty or not configured AND `direction = 'out'`
     THEN THE SYSTEM SHALL return zero matching records for that direction
     (no record passes the filter), so that an unconfigured outbound trunk
     list never causes extension-to-extension traffic to be reported as
     outbound calls.

R11. WHEN a CDR record is evaluated with `direction = null` (no direction /
     totals) THE SYSTEM SHALL include the record regardless of
     `channels.inbound` or `channels.outbound` contents (unchanged from v1.0
     behavior).

R12. A call between two internal extensions (e.g. `channel = SIP/2XX-xxxx`,
     `dst = 2YY`, normalized channel not present in `channels.outbound`) SHALL
     NOT be counted in `/api/calls/range?direction=out`, in the
     outbound-specific view of the dashboard, nor in the aggregated outbound
     statistics, channel breakdown, or hourly breakdown.

R13. A call placed over a channel listed in `channels.outbound` (e.g.
     `SIP/SALIENTE_CALL`) SHALL continue to be counted correctly as an
     outbound call in the aggregated outbound statistics, channel breakdown,
     hourly breakdown, and the outbound calls list/export endpoint.

---

## Endpoints existentes — compatibilidad

R14. `GET /api/calls/today` SHALL continue to return the same response shape
     (`stats`, `channels`, `hourly`, `inbound`, `outbound`, `queues`,
     `channelAliases`, `appName`, `from`, `to`, `generatedAt`) after the
     configuration and filtering changes, with `inbound.*` derived from
     `channels.inbound` and `outbound.*` derived from `channels.outbound`.

R15. `GET /api/calls/range?from=&to=` SHALL continue to function and return
     the same response shape as R14, with the same `inbound`/`outbound`
     semantics.

R16. THE SYSTEM SHALL continue to emit SSE `init` (on client connect) and
     `update` (on each poll cycle) events on `/api/events` with the same
     response shape as R14.

R17. `GET /api/calls/outbound` and `GET /api/calls/outbound/export` SHALL
     return only calls whose channel matches a prefix configured in
     `channels.outbound` (explicit match), excluding `Local/` channels and
     extension-to-extension calls, instead of "every channel not in the
     inbound list".

---

## Gestión de canales (admin)

R18. `GET /api/admin/channels` SHALL return every channel configured in either
     `channels.inbound` or `channels.outbound`, each annotated with its
     direction (`"inbound"` or `"outbound"`) and its current alias (if any)
     from `channelAliases`.

R19. IF the same channel name appears in both `channels.inbound` and
     `channels.outbound` THEN THE SYSTEM SHALL list it once per direction
     (two entries, one per direction) in the response of R18, each carrying
     its own `direction` value.

R20. `PUT /api/admin/channels/:channel` SHALL continue to allow updating the
     display alias (`channelAliases`) of a channel that exists in
     `channels.inbound` and/or `channels.outbound`, without requiring the
     `direction` to be specified for an alias-only update.

R21. IF `PUT /api/admin/channels/:channel` is called for a channel name that
     does not exist in `channels.inbound` nor `channels.outbound` THEN THE
     SYSTEM SHALL respond with HTTP 404 and `{ ok: false, error: '...' }`,
     unchanged from v1.0 behavior.

---

## No-funcionales

R22. THE SYSTEM SHALL NOT introduce any write operation against the Issabel
     CDR database (MySQL `asteriskcdrdb`); all CDR access remains read-only
     `SELECT` with prepared statement parameters (`?`).

R23. THE SYSTEM SHALL NOT remove or rename the existing `channelAliases` map
     in `config.json`, nor invalidate aliases configured for channels that
     remain present in `channels.inbound` or `channels.outbound` after
     migration.
