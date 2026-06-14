# requirements.md — dashboard_cards_restructure

> Feature #23 — Reestructura tres tarjetas del Dashboard principal: (1) la
> StatCard "Perdidas" se renombra a "No Contestadas" y se elimina la tarjeta
> de desglose introducida por #22; (2) las QueueCard (tarjetas de colas)
> reflejan la reclasificación de `resolveDisposition` (#17/#21) también dentro
> de cada cola, lo que requiere modificar `queryQueues`; (3) las dos StatCard
> "Extensiones"/"Activas" (#18/#19) se combinan en una sola tarjeta.

---

## 1. Renombrado de la StatCard "Perdidas" → "No Contestadas"

R1. THE SYSTEM SHALL rename the Dashboard `StatCard` currently labeled
    "Perdidas" to "No Contestadas".

R2. THE SYSTEM SHALL preserve, for the renamed "No Contestadas" `StatCard`,
    exactly the same presentation format as the existing "Contestadas"
    `StatCard`: a label, a total value (`dispositions['NO ANSWER'].count`), a
    descriptive sub-text, and a percentage of the grand total
    (`dispositions['NO ANSWER'].pct`).

R3. THE SYSTEM SHALL NOT change the underlying data source of the renamed
    card: it SHALL continue to read `stats.dispositions['NO ANSWER'].count`
    and `stats.dispositions['NO ANSWER'].pct` exactly as the "Perdidas" card
    did before this feature (no change to `queryStats`, `resolveDisposition`,
    or any reclassification logic of #16/#17/#21).

---

## 2. Eliminación de la tarjeta "Detalle de Perdidas" (#22)

R4. THE SYSTEM SHALL remove from the Dashboard the card/section titled
    "Detalle de Perdidas" (the `UnansweredBreakdownCard` component and its
    containing grid row, introduced by feature #22), including its
    rendering call site in `Dashboard.jsx`.

R5. THE SYSTEM SHALL NOT require any change to the backend payload as a
    result of R4: the field `dispositions['NO ANSWER'].breakdown` (with keys
    `no_answer`, `ivr_hangup`, `queue_no_agent`, computed by `queryStats` per
    feature #22) MAY continue to exist in the JSON responses of
    `/api/calls/today`, `/api/calls/range`, and the SSE `init`/`update`
    events, for backward compatibility with any other consumer. The
    Dashboard simply SHALL NOT render it.

R6. THE SYSTEM SHALL remove the `UnansweredBreakdownCard` component
    definition, the `UNANSWERED_REASONS` and `REASON_COLOR_CLASS` constants,
    and the `noAnswerBreakdown` variable from `Dashboard.jsx` if, after R4,
    they are no longer referenced anywhere in the file (dead-code removal).

---

## 3. QueueCard — "No contest." reclasificado por cola

R7. THE SYSTEM SHALL apply the same per-record effective-disposition
    resolution used by `queryStats` for the global "No Contestadas" KPI
    (features #17/#21: a record whose `dst` is in `config.lostDestinations`,
    or whose original `disposition = 'ANSWERED'` but whose `dstchannel` does
    not match the "answered by an agent" criterion of feature #21, is
    reclassified to the effective disposition `'NO ANSWER'`) when computing
    each configured queue's per-disposition aggregates
    (`queue.ANSWERED`, `queue['NO ANSWER']`, `queue.BUSY`, `queue.FAILED`,
    `queue.total`).

R8. WHEN a CDR record's `dst` matches one of the queues configured in
    `config.queues` AND, after applying the resolution of R7, its effective
    disposition is `'NO ANSWER'` (regardless of whether its original
    `disposition` was `'ANSWERED'`, `'NO ANSWER'`, `'BUSY'`, or `'FAILED'`)
    THE SYSTEM SHALL count that record under that queue's
    `queue['NO ANSWER']` aggregate.

R9. WHEN a CDR record's `dst` matches one of the queues configured in
    `config.queues` AND, after applying the resolution of R7, its effective
    disposition is `'ANSWERED'`, `'BUSY'`, or `'FAILED'`, THE SYSTEM SHALL
    count that record under the corresponding `queue.ANSWERED`,
    `queue.BUSY`, or `queue.FAILED` aggregate of that queue, exactly as
    before this feature (no behavior change for these three buckets beyond
    the reclassification itself).

R10. THE SYSTEM SHALL preserve, for every queue `q` such that
     `q.queue !== '__lost__'`, the invariant
     `q.total === q.ANSWERED + q['NO ANSWER'] + q.BUSY + q.FAILED`
     (assuming no records with an unrecognized `disposition` value reach
     that queue — same assumption as the pre-existing `queryQueues`
     behavior).

R11. THE SYSTEM SHALL NOT change the bucket semantics, membership rules, or
     total of the special `'__lost__'` queue entry (records whose `dst` is
     in `config.lostDestinations` but not in `config.queues`) beyond what is
     implied by reusing the resolution of R7 for its own
     `ANSWERED`/`'NO ANSWER'`/`BUSY`/`FAILED` buckets, if it has any (in
     practice, every record routed to `'__lost__'` has `dst` in
     `lostDestinations`, so R7 always resolves it to effective disposition
     `'NO ANSWER'`, exactly as before).

R12. THE SYSTEM SHALL continue to display, in each non-`'__lost__'`
     `QueueCard`, the text "No contest.: N" with the same visual format as
     before this feature, where `N` is now `queue['NO ANSWER']` as computed
     per R7-R10 (the reclassified value) instead of the raw count of
     `disposition = 'NO ANSWER'` records for that queue.

R13. THE SYSTEM SHALL NOT change the visual format, layout, or any other
     displayed field of `QueueCard` (total, "Contestadas" count/percentage,
     progress bar, "Ocupado" count) as a result of this feature — only the
     numeric value of `queue['NO ANSWER']` (and, transitively,
     `queue.ANSWERED` for records reclassified away from `ANSWERED`) changes.

---

## 4. Tarjeta combinada de Extensiones / Activas

R14. THE SYSTEM SHALL replace the two separate `StatCard` instances labeled
     "Extensiones" (showing `extensionsData.total`) and "Activas" (showing
     `extensionsData.active`) with a single card that displays both values
     together.

R15. THE SYSTEM SHALL display, in the combined extensions card, both the
     total number of configured extensions (`extensionsData.total`) and the
     number currently registered/active (`extensionsData.active`), in a
     manner that makes clear which number is the total and which is the
     active subset (e.g. "8 / 12 activas" or equivalent labeled
     presentation).

R16. WHEN `extensionsData.available === false` (AMI not configured or
     unreachable, per #18/#19) THE SYSTEM SHALL apply the same visual
     degradation treatment to the combined card that was previously applied
     to the two separate cards (reduced opacity and an explanatory `title`
     attribute), so the user can tell at a glance that extension status is
     unavailable.

R17. WHEN `extensionsData.available === true` THE SYSTEM SHALL render the
     combined card with full opacity and without the unavailability
     indicator, displaying the current `total` and `active` values.

R18. THE SYSTEM SHALL preserve the existing REST polling mechanism for
     `extensionsData` (`api.pbxExtensions()`, polled every
     `EXTENSIONS_POLL_MS`, independent of SSE) unchanged; this feature only
     changes how `extensionsData` is rendered, not how it is fetched.

---

## 5. Payload, SSE y compatibilidad

R19. `GET /api/calls/today` SHALL continue to return the same response
     shape as after feature #22 (`stats`, `channels`, `hourly`, `inbound`,
     `outbound`, `queues`, `channelAliases`, `appName`, `from`, `to`,
     `generatedAt`), with the only behavioral change being that the numeric
     values inside `queues[*].ANSWERED`, `queues[*]['NO ANSWER']`,
     `queues[*].BUSY`, `queues[*].FAILED`, and `queues[*].total` (for
     `queue !== '__lost__'`, and for `'__lost__'` itself per R11) reflect the
     R7-R10 reclassification. `stats.dispositions['NO ANSWER'].breakdown`
     (per #22) remains present in the payload (R5).

R20. `GET /api/calls/range?from=&to=` SHALL continue to function and return
     the same response shape as R19, with the same reclassified `queues[*]`
     values.

R21. THE SYSTEM SHALL continue to emit SSE `init` (on client connect) and
     `update` (on each poll cycle) events on `/api/events` with the same
     response shape as R19, including the reclassified `queues[*]` values.

R22. IF `config.queues` is empty or not configured THE SYSTEM SHALL continue
     to return `queues: []` from `queryQueues` exactly as before this
     feature (no behavior change to the early-return path).

R23. THE SYSTEM SHALL NOT introduce any write operation against the Issabel
     CDR database (MySQL `asteriskcdrdb`); all CDR access remains read-only
     `SELECT` with prepared statement parameters (`?`).

R24. THE SYSTEM SHALL NOT add new npm dependencies (backend or frontend) for
     this feature.

---

## 6. Tests

R25. THE SYSTEM SHALL include automated tests verifying:
     - the Dashboard renders a card labeled "No Contestadas" (not
       "Perdidas") showing `dispositions['NO ANSWER'].count` and
       `dispositions['NO ANSWER'].pct` with the same format as
       "Contestadas" (R1-R3);
     - the Dashboard does NOT render a card/section titled "Detalle de
       Perdidas" / the `UnansweredBreakdownCard` component, even when
       `dispositions['NO ANSWER'].breakdown` is present in the payload
       (R4-R6);
     - `queryQueues` produces `queue['NO ANSWER']` values that include
       records whose original `disposition = 'ANSWERED'` but whose
       `dstchannel` does not match the agent criterion of #21, for a `dst`
       in `config.queues` (R7, R8);
     - `queryQueues` produces `queue['NO ANSWER']` values that include
       records whose `dst` is in `config.lostDestinations` and whose `dst`
       also matches a configured queue (if such an overlap is configured),
       consistent with R7;
     - for at least one mixed dataset, `queue.total === queue.ANSWERED +
       queue['NO ANSWER'] + queue.BUSY + queue.FAILED` for every
       non-`'__lost__'` queue (R10);
     - the combined extensions card renders both `total` and `active` values
       when `extensionsData.available === true`, and renders the degraded
       (unavailable) state when `extensionsData.available === false` (R14-
       R17).
