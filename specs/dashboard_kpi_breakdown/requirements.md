# requirements.md — dashboard_kpi_breakdown

> Feature ID: 16 | Notación EARS | Revisión: 2026-06-10

---

## Contexto

El dashboard principal (`/`) muestra tres tarjetas de KPI ("Total llamadas",
"Contestadas", "Perdidas") más una tarjeta "Fallidas". Actualmente "Perdidas"
se calcula a partir de un agregado independiente (`__lost__`, derivado de
`queryQueues`/`config.queues`/`config.lostDestinations`) que no guarda relación
aritmética con "Total llamadas". Cuando `config.queues` está vacío (caso
habitual), "Perdidas" siempre vale 0.

Esta feature corrige "Perdidas" para que se derive de las disposiciones reales
del CDR del día (ya presentes en el payload de `/api/calls/today` y de los
eventos SSE `init`/`update`), de modo que el total reconcilie con la suma de
las tarjetas, y añade un desglose visual de "Total llamadas" entre Entrantes
y Salientes.

---

## Tarjeta "Perdidas"

**R1.** THE SYSTEM SHALL calculate the value displayed in the "Perdidas" card
as the count of CDR records with `disposition = 'NO ANSWER'` for the queried
period (`disp['NO ANSWER'].count` from the existing dispositions aggregate),
using data already present in the dashboard payload.

**R2.** THE SYSTEM SHALL calculate "Total llamadas" as the sum of the four
disposition counts (`ANSWERED + 'NO ANSWER' + BUSY + FAILED`) for the queried
period, such that `Total = Contestadas + Perdidas + Ocupado + Fallidas` holds
exactly for any data returned by the backend.

**R3.** WHEN `config.queues` is empty or not configured THE SYSTEM SHALL still
display a non-zero "Perdidas" value whenever there are CDR records with
`disposition = 'NO ANSWER'` in the queried period.

**R4.** THE SYSTEM SHALL display, alongside the "Perdidas" value, the
percentage of "Perdidas" relative to "Total llamadas" (consistent with how
"Contestadas" and "Fallidas" already show their percentage).

**R5.** THE SYSTEM SHALL display "Ocupado" (`disp.BUSY.count` and its
percentage) as its own KPI, separate from "Perdidas", so that the four
disposition categories (Contestadas, Perdidas, Ocupado, Fallidas) are each
visible and individually traceable to `Total`.

**R6.** IF the dispositions aggregate for the queried period is absent or all
counts are zero (e.g. no calls yet today) THEN THE SYSTEM SHALL display `0`
for "Perdidas", "Ocupado", "Contestadas", "Fallidas" and "Total llamadas"
without errors or `NaN`/`undefined` rendering.

---

## Bloque de colas (queues / `__lost__`)

**R7.** WHILE `config.queues` contains one or more queue extensions THE SYSTEM
SHALL continue to render the existing per-queue cards (`QueueCard`) with their
"Contestadas" / "No contest." / "Ocupado" breakdown, unchanged from current
behavior.

**R8.** THE SYSTEM SHALL NOT use the `__lost__` aggregate (from `queryQueues`)
as the source of the general "Perdidas" KPI card; the `__lost__` aggregate, if
present in the payload, MAY continue to be used only for queue-specific
displays (if any) but SHALL NOT be referenced by the general "Perdidas" card
defined in R1.

---

## Desglose Entrantes / Salientes

**R9.** THE SYSTEM SHALL display, alongside or below "Total llamadas", the
breakdown of total calls into "Entrantes" (`inbound.stats.total`) and
"Salientes" (`outbound.stats.total`) for the queried period, using data
already present in the dashboard payload.

**R10.** THE SYSTEM SHALL display each of "Entrantes" and "Salientes" with its
percentage relative to "Total llamadas" (`0%` if `Total = 0`).

**R11.** IF `inbound.stats.total + outbound.stats.total` does not equal
`Total llamadas` (e.g. calls on channels that pass neither the inbound nor the
outbound filter) THEN THE SYSTEM SHALL still display the three figures as
provided by the backend without forcing them to reconcile, and MAY optionally
indicate the difference as "Otros" / unclassified — this discrepancy is a
documented, expected edge case and not an error condition.

**R12.** IF `inbound.stats.total` or `outbound.stats.total` is absent from the
payload (e.g. older cached SSE event) THEN THE SYSTEM SHALL treat the missing
value as `0` and SHALL NOT throw or render `NaN`/`undefined`.

---

## Tiempo real (SSE)

**R13.** WHEN the dashboard receives an `init` or `update` SSE event THE
SYSTEM SHALL recompute and re-render "Perdidas", "Ocupado", "Total llamadas",
and the Entrantes/Salientes breakdown using the new payload, consistent with
the existing behavior for "Contestadas" and "Fallidas".

---

## No regresión

**R14.** THE SYSTEM SHALL NOT modify any backend endpoint response shape,
SQL query, or SSE payload structure; all data required by R1–R13 SHALL be
sourced from fields already present in `data.stats.dispositions`,
`data.stats.total`, `data.inbound.stats.total`, `data.outbound.stats.total`,
and `data.queues` as returned today by `/api/calls/today`, `/api/calls/range`,
and the `init`/`update` SSE events.

**R15.** THE SYSTEM SHALL NOT alter the existing `HourlyChart`,
`DispositionChart`, `ChannelTable`, `InboundView`, `OutboundView`, or
`HistoricalView` components or their props.

**R16.** THE SYSTEM SHALL NOT introduce new npm dependencies, new HTTP
endpoints, new SQLite tables, or new SQL queries against the Issabel CDR
database.
