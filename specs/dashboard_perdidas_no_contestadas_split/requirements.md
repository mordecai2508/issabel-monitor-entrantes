# requirements.md — dashboard_perdidas_no_contestadas_split

> Feature #24 — La feature #23 renombró la `StatCard` "Perdidas" a
> "No Contestadas", mostrando el total agregado
> `dispositions['NO ANSWER'].count` (que agrupa las 3 subcategorías de #22:
> `no_answer`, `ivr_hangup`, `queue_no_agent`). Esta feature separa ese total
> en dos `StatCard` independientes — "Perdidas" (colgó en IVR/menú) y
> "No Contestadas" (sin respuesta o cola sin agente real) — reutilizando el
> campo `dispositions['NO ANSWER'].breakdown` ya calculado por `queryStats`
> desde #22.

---

## Definición de las dos categorías

R1. THE SYSTEM SHALL define, for the Dashboard's "Perdidas" `StatCard`
    (re-introduced by this feature, distinct from the "No Contestadas"
    `StatCard` of #23), its displayed value as
    `dispositions['NO ANSWER'].breakdown.ivr_hangup` — the count of records
    whose `dst` is present in `config.lostDestinations` (default `['s',
    'hang', 'hangup']`), i.e. records where the caller hung up in the
    IVR/menu (per #17/#22).

R2. THE SYSTEM SHALL define, for the Dashboard's "No Contestadas" `StatCard`
    (as introduced/renamed by #23, redefined by this feature), its displayed
    value as the sum `dispositions['NO ANSWER'].breakdown.no_answer +
    dispositions['NO ANSWER'].breakdown.queue_no_agent` — records whose
    original `disposition` was `'NO ANSWER'` with `dst` NOT in
    `lostDestinations` (rang and nobody answered), plus records whose
    original `disposition` was `'ANSWERED'` but reclassified by #21 because
    `dstchannel` did not match the "answered by a real agent" criterion
    (queue/IVR played a message but no agent picked up).

R3. THE SYSTEM SHALL guarantee that the sum of the values defined in R1 and
    R2 equals exactly `dispositions['NO ANSWER'].count`:

    `breakdown.ivr_hangup + (breakdown.no_answer + breakdown.queue_no_agent)
     === dispositions['NO ANSWER'].count`

    This follows directly from the invariant already established by #22
    (R3 of `dashboard_unanswered_breakdown`): `breakdown.no_answer +
    breakdown.ivr_hangup + breakdown.queue_no_agent ===
    dispositions['NO ANSWER'].count`.

---

## Presentación de las tarjetas

R4. THE SYSTEM SHALL render a `StatCard` labeled "Perdidas" with the same
    presentation format as the existing "Contestadas" `StatCard`: a label, a
    total value (per R1), a descriptive sub-text, and a percentage of the
    grand total (per R6).

R5. THE SYSTEM SHALL render a `StatCard` labeled "No Contestadas" with the
    same presentation format as the existing "Contestadas" `StatCard`: a
    label, a total value (per R2), a descriptive sub-text, and a percentage
    of the grand total (per R6).

R6. THE SYSTEM SHALL compute the percentage (`pct`) displayed on each of the
    "Perdidas" and "No Contestadas" `StatCard`s (R4, R5) as that card's
    value divided by the dashboard's grand total (`stats.total`), rounded
    consistent with the existing `pct` rounding convention used elsewhere in
    `Dashboard.jsx` (`Math.round((value / total) * 1000) / 10`), and IF
    `stats.total` is `0` THEN the displayed percentage SHALL be `0`
    (avoiding division by zero). Each percentage is computed independently
    against the grand total — NOT against `dispositions['NO ANSWER'].count`
    and NOT against each other.

R7. THE SYSTEM SHALL position the "Perdidas" and "No Contestadas" `StatCard`s
    such that both are visible alongside (in the same row/group as) the
    "Contestadas" `StatCard`, preserving the existing visual grouping of the
    primary disposition KPIs established by #16/#23.

---

## Invariante global

R8. THE SYSTEM SHALL preserve the invariant established by #16/#17/#21:

    `stats.total === dispositions.ANSWERED.count + breakdown.ivr_hangup +
     (breakdown.no_answer + breakdown.queue_no_agent) +
     dispositions.BUSY.count + dispositions.FAILED.count`

    i.e. `Total = Contestadas + Perdidas + No Contestadas + Ocupado +
    Fallidas`, where "Perdidas" and "No Contestadas" are the values defined
    in R1 and R2 respectively. This holds by construction given R3 and the
    pre-existing invariant `total = ANSWERED.count + ['NO
    ANSWER'].count + BUSY.count + FAILED.count`.

---

## Consistencia con los gráficos (DispositionChart / HourlyChart)

R9. THE SYSTEM SHALL preserve the existing behavior of `DispositionChart`
    and `HourlyChart`, which display a single combined "no contestadas"
    category corresponding to `dispositions['NO ANSWER'].count` /
    `hourly[*]['NO ANSWER']` (via `resolveDisposition`, #21) — these charts
    SHALL NOT be split into "Perdidas" / "No Contestadas" subcategories by
    this feature. The sum of the two new `StatCard`s (R1 + R2) SHALL remain
    numerically equal to the single "no contestadas" value already shown by
    these charts (per R3), preserving consistency between the `StatCard`s
    and the charts.

---

## Caso degradado — breakdown ausente o incompleto

R10. IF `dispositions['NO ANSWER'].breakdown` is absent or `undefined` (e.g.
     a stale cached payload predating #22) THEN THE SYSTEM SHALL render both
     the "Perdidas" `StatCard` (R4) and the "No Contestadas" `StatCard` (R5)
     with a value of `0` and a percentage of `0`, without throwing a runtime
     error (defensive `?? 0` access on `breakdown.ivr_hangup`,
     `breakdown.no_answer`, and `breakdown.queue_no_agent` individually).

R11. IF `dispositions['NO ANSWER'].breakdown` is present but one or more of
     its keys (`ivr_hangup`, `no_answer`, `queue_no_agent`) is missing or
     `undefined` THEN THE SYSTEM SHALL treat each missing key as `0` for the
     purposes of R1/R2/R6, independently of the other keys (per-key
     defensive default, not an all-or-nothing fallback).

---

## Alcance — sin cambios de backend

R12. THE SYSTEM SHALL NOT require any modification to `queryStats`,
     `resolveDisposition`, `classifyUnansweredReason`, or the response shape
     of `/api/calls/today`, `/api/calls/range`, or the SSE `init`/`update`
     events: `dispositions['NO ANSWER'].breakdown` is already computed and
     present in the payload since #22, and remains unchanged by #23 (it is
     simply not rendered). This feature is implemented entirely by reading
     existing fields in `Dashboard.jsx`.

---

## No-funcionales

R13. THE SYSTEM SHALL NOT introduce any write operation against the Issabel
     CDR database (MySQL `asteriskcdrdb`); all CDR access remains read-only
     (and, per R12, this feature performs no new CDR access at all).

R14. THE SYSTEM SHALL NOT add new npm dependencies (backend or frontend) for
     this feature.

R15. THE SYSTEM SHALL NOT introduce any chart/visualization library other
     than Recharts (already used by `DispositionChart`/`HourlyChart`); this
     feature does not require any new chart (R4/R5 reuse the existing
     `StatCard` component).

---

## Tests

R16. THE SYSTEM SHALL include automated tests verifying:
     - the Dashboard renders a `StatCard` labeled "Perdidas" showing
       `dispositions['NO ANSWER'].breakdown.ivr_hangup` with the same
       presentation format as "Contestadas" (R1, R4);
     - the Dashboard renders a `StatCard` labeled "No Contestadas" showing
       `dispositions['NO ANSWER'].breakdown.no_answer +
       dispositions['NO ANSWER'].breakdown.queue_no_agent` with the same
       presentation format as "Contestadas" (R2, R5);
     - for a sample payload, the sum of the values shown by "Perdidas" and
       "No Contestadas" equals `dispositions['NO ANSWER'].count` (R3);
     - for a sample payload, `Total === Contestadas + Perdidas + No
       Contestadas + Ocupado + Fallidas` (R8);
     - the percentage shown on each of "Perdidas" and "No Contestadas" is
       computed against `stats.total`, not against `dispositions['NO
       ANSWER'].count` nor against each other (R6);
     - WHEN `dispositions['NO ANSWER'].breakdown` is `undefined`, both
       "Perdidas" and "No Contestadas" render with value `0` and percentage
       `0` without throwing (R10);
     - WHEN `dispositions['NO ANSWER'].breakdown` is present but missing one
       of its three keys, the corresponding `StatCard`(s) treat the missing
       key as `0` (R11).
