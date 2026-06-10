# requirements.md — dashboard_lost_destinations

> Feature ID: 17 | Notación EARS | Revisión: 2026-06-10

---

## Contexto

La feature #16 (`dashboard_kpi_breakdown`, ya implementada y commiteada) define
"Perdidas" como `dispositions['NO ANSWER'].count`, derivado de `queryStats()`
en `backend/server.js`, y establece la identidad:

```
Total = Contestadas + Perdidas + Ocupado + Fallidas
      = ANSWERED.count + 'NO ANSWER'.count + BUSY.count + FAILED.count
```

Esta feature **amplía** el criterio de "Perdidas": una llamada CDR también
debe contar como "Perdidas" si su campo `dst` está en `config.lostDestinations`
(configuración existente, default `['s', 'hang', 'hangup']`, ya usada hoy por
`queryQueues`/`__lost__` para el bloque de colas), **sin importar su
`disposition`** original.

Para no romper la identidad `Total = Contestadas + Perdidas + Ocupado +
Fallidas` (R2 de `dashboard_kpi_breakdown`), las llamadas reclasificadas se
**mueven** entre categorías (se restan de su disposición original y se suman a
"Perdidas"), nunca se duplican ni se añaden como una quinta categoría.

Esta feature opera sobre `queryStats` (usada por `/api/calls/today`,
`/api/calls/range` y los eventos SSE `init`/`update`). El bloque de colas
(`queryQueues`/`__lost__`, feature #16 R7/R8) es independiente y no se modifica.

---

## Reclasificación de "Perdidas"

**R1.** THE SYSTEM SHALL treat a CDR record as belonging to the "Perdidas"
category for the queried period WHEN its `dst` field is contained in
`config.lostDestinations`, regardless of its `disposition` value.

**R2.** WHEN a CDR record has `disposition = 'ANSWERED'` (or `BUSY`, or
`FAILED`) AND its `dst` is contained in `config.lostDestinations` THE SYSTEM
SHALL subtract that record from the count of its original disposition category
(`Contestadas`, `Ocupado`, or `Fallidas` respectively) AND add it to the count
of "Perdidas".

*Ejemplo:* un registro con `disposition='ANSWERED'` y `dst='hang'` se resta de
`Contestadas` (`dispositions.ANSWERED.count -= 1`) y se suma a `Perdidas`
(`dispositions['NO ANSWER'].count += 1`).

**R3.** WHEN a CDR record has `disposition = 'NO ANSWER'` AND its `dst` is
contained in `config.lostDestinations` THE SYSTEM SHALL count that record
exactly once in "Perdidas" (no double counting between the existing `NO
ANSWER` classification and the `dst`-based reclassification of R1).

*Ejemplo:* un registro con `disposition='NO ANSWER'` y `dst='s'` cuenta una
sola vez en `dispositions['NO ANSWER'].count` — no se le suma ni resta nada
adicional.

**R4.** WHEN a CDR record has `disposition = 'NO ANSWER'` AND its `dst` is NOT
contained in `config.lostDestinations` THE SYSTEM SHALL continue to count that
record in "Perdidas" (`dispositions['NO ANSWER'].count`), unchanged from the
behavior defined by `dashboard_kpi_breakdown` R1.

**R5.** WHEN a CDR record has `disposition` ∈ {`ANSWERED`, `BUSY`, `FAILED`}
AND its `dst` is NOT contained in `config.lostDestinations` THE SYSTEM SHALL
count that record only in its original disposition category, unchanged from
current behavior (no reclassification applies).

---

## Configuración `lostDestinations`

**R6.** THE SYSTEM SHALL read the list of "lost" destinations from
`config.lostDestinations`.

**R7.** IF `config.lostDestinations` is not defined in the configuration THEN
THE SYSTEM SHALL use the default list `['s', 'hang', 'hangup']`, matching the
existing default already used by the queue aggregation (`queryQueues`/
`__lost__`).

**R8.** IF `config.lostDestinations` is configured as an empty list THEN THE
SYSTEM SHALL apply no reclassification (R1–R3 have no effect), and "Perdidas"
SHALL equal `dispositions['NO ANSWER'].count` exactly as before this feature
(equivalent to `dashboard_kpi_breakdown` R1).

---

## Conservación del total y de la identidad R2 de #16

**R9.** THE SYSTEM SHALL preserve `Total = Contestadas + Perdidas + Ocupado +
Fallidas` (i.e. `total === ANSWERED.count + 'NO ANSWER'.count + BUSY.count +
FAILED.count`) for any data returned by the backend, both before and after
applying the reclassification of R1–R3.

**R10.** THE SYSTEM SHALL NOT change the value of `total` (the overall record
count for the queried period) as a result of the reclassification — only the
distribution of that total among the four disposition categories changes.

**R11.** THE SYSTEM SHALL recompute the percentage (`pct`) of each disposition
category (`ANSWERED`, `'NO ANSWER'`, `BUSY`, `FAILED`) relative to `total`
after applying the reclassification, consistent with the existing percentage
calculation defined by `queryStats`.

---

## Alcance: endpoints y SSE

**R12.** THE SYSTEM SHALL apply the reclassification of R1–R5 to the
`dispositions` aggregate returned by `GET /api/calls/today`.

**R13.** THE SYSTEM SHALL apply the reclassification of R1–R5 to the
`dispositions` aggregate returned by `GET /api/calls/range` (general,
`inbound`, and `outbound` aggregates alike, for any range queried).

**R14.** THE SYSTEM SHALL apply the reclassification of R1–R5 to the
`dispositions` aggregates included in the SSE `init` and `update` events,
consistent with `dashboard_kpi_breakdown` R13.

---

## No interferencia con el bloque de colas (`queryQueues`/`__lost__`)

**R15.** THE SYSTEM SHALL NOT modify the queue aggregation
(`queryQueues`/`__lost__`) or its output, defined and validated by
`dashboard_kpi_breakdown` R7 and R8. The reclassification of R1–R5 operates
exclusively on the `dispositions`/`total` aggregate produced for the general,
inbound, and outbound `stats` objects.

**R16.** THE SYSTEM SHALL allow the `dispositions['NO ANSWER']`-based
"Perdidas" value (R1–R5) and the `queryQueues`/`__lost__` aggregate to coexist
in the same payload without conflict — both MAY be present simultaneously,
each computed independently from its own criteria.

---

## Casos límite y errores

**R17.** IF the dispositions aggregate for the queried period is absent or all
counts are zero (e.g. no calls yet today) THEN THE SYSTEM SHALL return
`dispositions['NO ANSWER'].count = 0` and `total = 0`, without errors or
negative values, regardless of `config.lostDestinations`.

**R18.** IF a CDR record's `disposition` value is not one of `ANSWERED`, `NO
ANSWER`, `BUSY`, `FAILED` (an unrecognized/unexpected value) THEN THE SYSTEM
SHALL NOT apply the reclassification of R1–R3 to that record (it is not
subtracted from any `base[disposition]` bucket, consistent with current
behavior where only the four recognized dispositions are tracked in `base`),
and that record's count SHALL continue to be included in `total` only, exactly
as before this feature.

**R19.** THE SYSTEM SHALL NOT produce negative counts for any disposition
category as a result of the reclassification (a category can only lose records
that it actually contains).

---

## No regresión

**R20.** THE SYSTEM SHALL NOT modify the response shape, status codes, or
field names of `/api/calls/today`, `/api/calls/range`, or the SSE `init`/
`update` events — `dispositions` retains its existing keys (`ANSWERED`, `'NO
ANSWER'`, `BUSY`, `FAILED`), each with `count`, `total_duration`,
`total_billsec`, `avg_billsec`, and `pct`.

**R21.** THE SYSTEM SHALL NOT require any change to
`frontend/src/components/Dashboard.jsx` for the "Perdidas", "Contestadas",
"Ocupado", "Fallidas", and "Total llamadas" KPI cards to reflect the new
"Perdidas" definition, because they already read
`dispositions['NO ANSWER'].count`/`.pct`, `dispositions.ANSWERED.count`/`.pct`,
`dispositions.BUSY.count`/`.pct`, `dispositions.FAILED.count`/`.pct`, and
`stats.total` as defined by `dashboard_kpi_breakdown`.

**R22.** THE SYSTEM SHALL NOT alter `queryQueues`, `extractChannel`,
`passesFilter`, `todayRange`, `toMySQLDate`, or any endpoint, route, or SQLite
table other than the `queryStats` aggregation logic described in R1–R14.

**R23.** THE SYSTEM SHALL use parameterized SQL (`?` placeholders) for any new
or modified query against the CDR database; THE SYSTEM SHALL NOT use `SELECT
*` or string-concatenated SQL.
