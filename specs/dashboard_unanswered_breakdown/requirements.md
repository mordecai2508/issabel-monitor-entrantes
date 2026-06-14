# requirements.md — dashboard_unanswered_breakdown

> Feature #22 — Desglose por motivo de las llamadas no contestadas
> ("Perdidas") en el Dashboard principal, reutilizando la lógica de
> reclasificación ya existente en `resolveDisposition` (#17 + #21).

---

## Orden de evaluación y criterio de clasificación

R1. THE SYSTEM SHALL define, for every CDR record whose effective disposition
    (per `resolveDisposition`, features #17/#21) is `'NO ANSWER'`, exactly one
    "unanswered reason" subcategory among `'ivr_hangup'`, `'no_answer'`, and
    `'queue_no_agent'`, evaluated in the following order (first match wins):

    1. `ivr_hangup` — IF `row.dst` is present in `lostDests`
       (`config.lostDestinations`, default `['s', 'hang', 'hangup']`),
       regardless of the record's original `disposition` value.
    2. `queue_no_agent` — ELSE IF the record's original `disposition` is
       `'ANSWERED'` AND `row.dstchannel` does NOT match
       `AGENT_DSTCHANNEL_RE` (`/^(Agent\/\d+|SIP\/\d+-)/`), evaluated on the
       raw `dstchannel` value (same as R19 of #21).
    3. `no_answer` — ELSE (the record's original `disposition` is already
       `'NO ANSWER'` and `row.dst` is NOT in `lostDests`).

R2. THE SYSTEM SHALL apply R1 only to records for which `resolveDisposition`
    returns `'NO ANSWER'`. Records whose effective disposition is `'ANSWERED'`,
    `'BUSY'`, `'FAILED'`, or `null` (unrecognized `disposition`) SHALL NOT be
    classified into any unanswered-reason subcategory and SHALL NOT
    contribute to the breakdown.

---

## Exhaustividad y exclusión mutua (sin doble conteo)

R3. THE SYSTEM SHALL guarantee that for every record counted in
    `dispositions['NO ANSWER'].count`, exactly one of `breakdown.no_answer`,
    `breakdown.ivr_hangup`, `breakdown.queue_no_agent` is incremented by that
    record's count — never zero, never more than one — such that:

    `breakdown.no_answer + breakdown.ivr_hangup + breakdown.queue_no_agent
     === dispositions['NO ANSWER'].count`

R4. WHEN a record has original `disposition = 'NO ANSWER'` AND `row.dst` is
    NOT in `lostDests` THE SYSTEM SHALL classify it as `no_answer` ("timbró y
    nadie contestó", caso puro sin reclasificación).

R5. WHEN a record has `row.dst` in `lostDests` (regardless of its original
    `disposition` — including the case where the original `disposition` was
    already `'NO ANSWER'`) THE SYSTEM SHALL classify it as `ivr_hangup` and
    SHALL NOT additionally classify it as `no_answer`, even if the original
    `disposition` was `'NO ANSWER'` (R1 step 1 takes precedence over step 3 —
    no double counting between `ivr_hangup` and `no_answer`).

R6. WHEN a record has original `disposition = 'ANSWERED'`, `row.dst` is NOT in
    `lostDests`, AND `row.dstchannel` does NOT match `AGENT_DSTCHANNEL_RE`
    (the #21 reclassification) THE SYSTEM SHALL classify it as
    `queue_no_agent`.

R7. THE SYSTEM SHALL evaluate R1's three subcategories as mutually exclusive
    and collectively exhaustive over the set of records whose effective
    disposition is `'NO ANSWER'`: every such record matches exactly one of
    R4, R5, R6 (there is no remaining case, because `resolveDisposition`
    only returns `'NO ANSWER'` via the lostDests path (#17), the dstchannel
    path (#21), or because the original `disposition` was already
    `'NO ANSWER'` with `dst` not in `lostDests` — which are precisely R5, R6,
    R4 respectively).

---

## Cálculo en queryStats

R8. `queryStats` (or a function reusing `resolveDisposition`) SHALL compute,
    in addition to the existing `dispositions['NO ANSWER']` aggregate (count,
    total_duration, total_billsec, avg_billsec, pct), an additional field
    `dispositions['NO ANSWER'].breakdown` with the shape:

    ```js
    { no_answer: <int>, ivr_hangup: <int>, queue_no_agent: <int> }
    ```

    where each value is the running count of records classified per R1–R7
    over the same `rows` already aggregated by `queryStats` (same
    `GROUP BY channel, dst, dstchannel, disposition`, same per-row filtering
    via `passesFilter`).

R9. THE SYSTEM SHALL NOT modify the existing fields of
    `dispositions['NO ANSWER']` (`count`, `total_duration`, `total_billsec`,
    `avg_billsec`, `pct`) — `breakdown` is purely additive. The other
    disposition buckets (`ANSWERED`, `BUSY`, `FAILED`) SHALL NOT receive a
    `breakdown` field.

R10. THE SYSTEM SHALL preserve the invariant `total = dispositions.ANSWERED.count
     + dispositions['NO ANSWER'].count + dispositions.BUSY.count +
     dispositions.FAILED.count` (R9 of #21/#17) unchanged — R8 adds an
     internal breakdown of `dispositions['NO ANSWER'].count` without altering
     `total` or any other bucket.

---

## queryChannels / queryHourly — fuera de alcance (decisión documentada)

R11. `queryChannels` and `queryHourly` SHALL NOT be required to compute the
     `breakdown` field. The unanswered-reason breakdown is scoped to the
     Dashboard's "Perdidas" card, which is fed exclusively by `queryStats`
     (`stats.dispositions`). `channels[*]` and `hourly[*]` (used by
     `ChannelTable`, `HourlyChart`, `DispositionChart`) SHALL remain exactly
     as produced by #21, with no new fields.

---

## Endpoints y SSE existentes

R12. `GET /api/calls/today` SHALL continue to return the same response shape
     as after #21 (`stats`, `channels`, `hourly`, `inbound`, `outbound`,
     `queues`, `channelAliases`, `appName`, `from`, `to`, `generatedAt`), with
     the addition that `stats.dispositions['NO ANSWER']` (and, per R13,
     `inbound.stats.dispositions['NO ANSWER']` /
     `outbound.stats.dispositions['NO ANSWER']`) now also contains the
     `breakdown` field of R8. No existing field is removed or renamed.

R13. `GET /api/calls/range?from=&to=` SHALL continue to function and return
     the same response shape as R12, including `breakdown` in every
     `dispositions['NO ANSWER']` object produced by any `queryStats`
     invocation (total / `direction=in` / `direction=out`), consistent with
     how `queryStats` is already invoked three times in `fetchData()`.

R14. THE SYSTEM SHALL continue to emit SSE `init` (on client connect) and
     `update` (on each poll cycle) events on `/api/events` with the same
     response shape as R12, including `breakdown` in
     `stats.dispositions['NO ANSWER']` (and its `inbound`/`outbound`
     equivalents).

R15. Existing clients that do not read `dispositions['NO ANSWER'].breakdown`
     SHALL continue to function unmodified (the field is additive — R9, R12).

---

## Dashboard (frontend)

R16. WHEN the Dashboard receives data containing
     `stats.dispositions['NO ANSWER'].breakdown` THE SYSTEM SHALL render a new
     section/card adjacent to (below or beside) the existing "Perdidas"
     `StatCard`, displaying the three subcategories with the following
     Spanish labels:
     - `no_answer` → "Sin respuesta"
     - `ivr_hangup` → "Colgó en IVR"
     - `queue_no_agent` → "Cola sin agente"

R17. THE SYSTEM SHALL display, for each of the three subcategories in R16, its
     raw count and its percentage of `dispositions['NO ANSWER'].count`
     (`Math.round((subcat / noAnswerTotal) * 1000) / 10`, consistent with the
     existing `pct` rounding convention used elsewhere in `Dashboard.jsx`). If
     `dispositions['NO ANSWER'].count` is `0`, THE SYSTEM SHALL display each
     subcategory's percentage as `0` (avoiding division by zero), matching the
     existing pattern (`total > 0 ? ... : 0`).

R18. IF `data` is falsy (not yet loaded, same condition as the existing
     `{!data && ...}` loading guard) THEN THE SYSTEM SHALL NOT render the new
     breakdown section, consistent with how the existing StatCards are
     guarded.

R19. IF `stats.dispositions['NO ANSWER'].breakdown` is absent or `undefined`
     (e.g. stale cached payload from before this feature) THEN THE SYSTEM
     SHALL render the breakdown section with all three subcategory counts
     defaulting to `0`, without throwing a runtime error (defensive
     `?? 0` access, consistent with existing `disp?.['NO ANSWER']?.count ?? 0`
     pattern).

R20. THE SYSTEM SHALL NOT introduce any chart/visualization library other than
     Recharts (already used by `DispositionChart`/`HourlyChart`). A purely
     numeric/card-based presentation (no chart) satisfies R16/R17; if the
     `spec_author`'s chosen design includes a chart, it SHALL use Recharts.

---

## No-funcionales

R21. THE SYSTEM SHALL NOT introduce any write operation against the Issabel
     CDR database (MySQL `asteriskcdrdb`); all CDR access remains read-only
     `SELECT` with prepared statement parameters (`?`). R8's breakdown is
     computed entirely in memory from rows already returned by the existing
     `queryStats` SQL query (no new SQL query, no change to the `SELECT` or
     `GROUP BY` of `queryStats`).

R22. THE SYSTEM SHALL NOT alter the response shape of any existing endpoint
     other than the additive `breakdown` field described in R8/R12–R15; in
     particular `/api/calls/inbound`, `/api/calls/outbound`, `/api/admin/*`
     remain unchanged.

R23. THE SYSTEM SHALL NOT add new npm dependencies (backend or frontend) for
     this feature.
