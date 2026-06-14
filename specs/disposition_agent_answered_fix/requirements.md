# requirements.md — disposition_agent_answered_fix

> Feature #21 — Distinguir llamadas atendidas por un agente real de llamadas
> donde solo el IVR/cola responde y el cliente nunca habla con un agente,
> aplicando un criterio único y consistente en `queryStats`, `queryChannels`
> y `queryHourly`.

---

## Criterio "atendida por agente"

R1. THE SYSTEM SHALL define a CDR record as "answered by an agent" if and
    only if its `dstchannel` matches the regular expression `/^Agent\/\d+/`
    (e.g. `Agent/03`, `Agent/04`) OR the regular expression `/^SIP\/\d+-/`
    (a numeric-extension channel, e.g. `SIP/203-00001a2b`).

R2. WHEN a CDR record has `disposition = 'ANSWERED'` AND its `dstchannel`
    does NOT match the "answered by an agent" criterion of R1 (empty
    `dstchannel`, or any other value) THE SYSTEM SHALL reclassify that
    record's count, duration and billsec away from the `ANSWERED` bucket and
    into the `'NO ANSWER'` ("Perdidas") bucket, regardless of the value of
    `dst`.

R3. IF a CDR record has `disposition = 'ANSWERED'` AND its `dstchannel`
    matches the "answered by an agent" criterion of R1 THEN THE SYSTEM SHALL
    keep that record counted under `ANSWERED` ("Contestadas"), unchanged from
    v1.0 behavior.

R4. THE SYSTEM SHALL apply the criterion of R1/R2 only to records with
    `disposition = 'ANSWERED'`. Records with `disposition` equal to `'NO
    ANSWER'`, `'BUSY'`, or `'FAILED'` SHALL be classified exactly as in v1.0
    (unaffected by the `dstchannel` check), regardless of their `dstchannel`
    value.

---

## Interacción con la reclasificación por `lostDestinations` (#17)

R5. WHEN a CDR record qualifies for reclassification under the existing
    `config.lostDestinations` criterion (feature #17: `dst` is in
    `lostDestinations`, originally `disposition` in
    {ANSWERED, BUSY, FAILED}) AND it also qualifies for reclassification under
    R2 (ANSWERED without an agent `dstchannel`) THE SYSTEM SHALL count that
    record exactly once in the `'NO ANSWER'` ("Perdidas") bucket — never
    twice and never subtracted twice from its original bucket.

R6. THE SYSTEM SHALL continue to apply the `config.lostDestinations`
    reclassification of feature #17 to `BUSY` and `FAILED` records with
    `dst` in `lostDestinations` exactly as before, independent of the
    `dstchannel`-based criterion of R1/R2 (which only applies to `ANSWERED`
    records per R4).

---

## Cola sin agente (caso central de esta feature)

R7. WHEN a CDR record has `dst` in `config.queues` (e.g. `'8000'`,
    `'8300'`), `disposition = 'ANSWERED'`, and `dstchannel` empty or not
    matching R1 (no `Agent/<n>` answered the call) THE SYSTEM SHALL subtract
    that record's count from the `ANSWERED` ("Contestadas") total and add it
    to the `'NO ANSWER'` ("Perdidas") total, in `queryStats`, `queryChannels`
    and `queryHourly` alike.

R8. WHEN a CDR record has `dst` in `config.queues`, `disposition =
    'ANSWERED'`, and `dstchannel` matching `Agent/<n>` (R1) THE SYSTEM SHALL
    continue counting it under `ANSWERED` ("Contestadas"), unchanged.

---

## Totales y consistencia (queryStats)

R9. THE SYSTEM SHALL preserve the invariant `total = dispositions.ANSWERED.count
    + dispositions['NO ANSWER'].count + dispositions.BUSY.count +
    dispositions.FAILED.count` after applying R1–R8: every record that passes
    the channel/direction filter contributes to exactly one of the four
    buckets (or to none if its `disposition` is not one of the four
    recognized values, exactly as in v1.0), and `total` counts every such
    record exactly once.

R10. THE SYSTEM SHALL compute `dispositions.ANSWERED.avg_billsec` and
     `dispositions[key].pct` (for all four keys) from the post-reclassification
     bucket values, using the same formulas as v1.0 (feature #17).

---

## Consistencia entre queryStats, queryChannels y queryHourly

R11. WHEN `queryChannels` aggregates records by channel THE SYSTEM SHALL
     apply the same R1–R8 reclassification per record before incrementing the
     `ANSWERED` / `'NO ANSWER'` / `BUSY` / `FAILED` / `total` counters for that
     channel, so that summing the `ANSWERED` (and `'NO ANSWER'`) columns of
     `queryChannels` across all channels for a given direction matches
     `dispositions.ANSWERED.count` (and `dispositions['NO ANSWER'].count`)
     returned by `queryStats` for the same `from`/`to`/direction.

R12. WHEN `queryHourly` aggregates records by hour-of-day THE SYSTEM SHALL
     apply the same R1–R8 reclassification per record before incrementing the
     `ANSWERED` / `'NO ANSWER'` / `BUSY` / `FAILED` / `total` counters for that
     hour, so that summing the `ANSWERED` (and `'NO ANSWER'`) values across all
     24 hours for a given direction matches `dispositions.ANSWERED.count` (and
     `dispositions['NO ANSWER'].count`) returned by `queryStats` for the same
     `from`/`to`/direction.

R13. `queryChannels` and `queryHourly` SHALL also apply the
     `config.lostDestinations` reclassification of feature #17 (per R5/R6) on
     a per-record basis, so that their results remain consistent with
     `queryStats` for both reclassification criteria simultaneously, closing
     the known limitation documented in feature #17's design (`ChannelTable`
     and `HourlyChart` previously did not reflect `dst`-based reclassification).

---

## Endpoints y SSE existentes

R14. `GET /api/calls/today` SHALL continue to return the same response shape
     (`stats`, `channels`, `hourly`, `inbound`, `outbound`, `queues`,
     `channelAliases`, `appName`, `from`, `to`, `generatedAt`), with the
     numeric values of `stats.dispositions`, `channels[*]` and `hourly[*]`
     (and their `inbound.*` / `outbound.*` equivalents) reflecting the R1–R13
     reclassification.

R15. `GET /api/calls/range?from=&to=` SHALL continue to function and return
     the same response shape as R14, with the same reclassified values.

R16. THE SYSTEM SHALL continue to emit SSE `init` (on client connect) and
     `update` (on each poll cycle) events on `/api/events` with the same
     response shape as R14, reflecting the R1–R13 reclassification.

R17. `queryQueues` (per-queue breakdown, feature #16/#17) SHALL remain
     unaffected in its own bucket semantics: a record with `dst` in
     `config.queues`, `disposition = 'ANSWERED'`, and `dstchannel` not
     matching R1 continues to be counted under that queue's own `ANSWERED`
     counter in `queryQueues` exactly as before — this feature does not
     change the per-queue breakdown, only the global `ANSWERED`/`'NO ANSWER'`
     totals of `queryStats`/`queryChannels`/`queryHourly`. This is a
     documented, intentional discrepancy between the per-queue view and the
     global dashboard KPIs (see design.md decision section).

---

## Casos límite

R18. IF `dstchannel` is `NULL`, an empty string, or any value not matching
     `/^Agent\/\d+/` or `/^SIP\/\d+-/` (e.g. `'SIP/trunk-00a1b2c3'`,
     `'Local/...'`, `'IAX2/...'`) AND `disposition = 'ANSWERED'` THEN THE
     SYSTEM SHALL apply R2 (reclassify to `'NO ANSWER'`).

R19. THE SYSTEM SHALL evaluate the R1 regular expressions against the raw
     `dstchannel` value as stored in the CDR (before any per-call suffix
     stripping such as `extractChannel`), since the numeric-extension and
     `Agent/<n>` prefixes are stable and the suffix is irrelevant to the
     match.

---

## No-funcionales

R20. THE SYSTEM SHALL NOT introduce any write operation against the Issabel
     CDR database (MySQL `asteriskcdrdb`); all CDR access remains read-only
     `SELECT` with prepared statement parameters (`?`).

R21. THE SYSTEM SHALL NOT alter the response shape of any existing endpoint
     (`/api/calls/today`, `/api/calls/range`, `/api/events`,
     `/api/calls/inbound`, `/api/calls/outbound`, `/api/admin/*`); only the
     numeric values within `stats.dispositions`, `channels[*]` and
     `hourly[*]` (and their `inbound`/`outbound` equivalents) change as a
     result of R1–R13.
