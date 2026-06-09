# requirements.md — historical_analytics

> Feature ID: 11 | Notación EARS | Revisión: 2026-06-08

---

## Endpoint /api/stats/historical

**R1.** WHEN a client sends `GET /api/stats/historical` with `period`, `from`, and `to` query parameters
THE SYSTEM SHALL return HTTP 200 with `{ ok: true, data: { period, from, to, points: [...] } }` where `points` is an array of time-grouped aggregates.

**R2.** WHEN `period` is `day` THE SYSTEM SHALL group results by calendar day (`YYYY-MM-DD`), returning one point per day within the range.

**R3.** WHEN `period` is `week` THE SYSTEM SHALL group results by ISO week (`YYYY-Www`), returning one point per week within the range.

**R4.** WHEN `period` is `month` THE SYSTEM SHALL group results by calendar month (`YYYY-MM`), returning one point per month within the range.

**R5.** WHEN `period` is `year` THE SYSTEM SHALL group results by calendar year (`YYYY`), returning one point per year within the range.

**R6.** WHEN `period` is `custom` THE SYSTEM SHALL return a single aggregate point covering the entire `from`–`to` range (equivalent behavior to a total-only query but in the `points` array structure).

**R7.** THE SYSTEM SHALL include in each `points` element the fields: `period_label` (string), `total` (integer), `answered` (integer), `no_answer` (integer), `busy` (integer), `failed` (integer), `avg_duration` (number, seconds, 2 decimal places).

**R8.** IF `period` is absent or not one of `day|week|month|year|custom` THEN THE SYSTEM SHALL return HTTP 400 `{ ok: false, error: 'El parámetro period debe ser day, week, month, year o custom' }`.

**R9.** IF `from` or `to` is absent or not a valid date string (`YYYY-MM-DD`) THEN THE SYSTEM SHALL return HTTP 400 `{ ok: false, error: 'Los parámetros from y to son requeridos y deben ser fechas válidas (YYYY-MM-DD)' }`.

**R10.** IF `from` is after `to` THEN THE SYSTEM SHALL return HTTP 400 `{ ok: false, error: 'La fecha from no puede ser posterior a to' }`.

**R11.** IF the queried range contains no CDR records THE SYSTEM SHALL return HTTP 200 with `data.points` as an empty array `[]`.

**R12.** THE SYSTEM SHALL require an authenticated session (requireAuth); an unauthenticated request SHALL return HTTP 401.

**R13.** THE SYSTEM SHALL respond to `/api/stats/historical` in under 10 seconds for date ranges up to 2 years.

---

## Endpoint /api/stats/compare

**R14.** WHEN a client sends `GET /api/stats/compare` with `period1_from`, `period1_to`, `period2_from`, `period2_to` query parameters
THE SYSTEM SHALL return HTTP 200 with `{ ok: true, data: { period1: {...}, period2: {...}, variation: {...} } }`.

**R15.** THE SYSTEM SHALL include in each `period1` and `period2` object the fields: `from`, `to`, `total`, `answered`, `no_answer`, `busy`, `failed`, `avg_duration`.

**R16.** THE SYSTEM SHALL include in `variation` the fields: `total`, `answered`, `no_answer`, `busy`, `failed`, `avg_duration`. Each field SHALL be the percentage change `((period2_value - period1_value) / period1_value) * 100`, rounded to 1 decimal place.

**R17.** IF `period1_value` is `0` for a given KPI THEN THE SYSTEM SHALL set that KPI's variation to `null` (division by zero is undefined, not infinity).

**R18.** IF any of `period1_from`, `period1_to`, `period2_from`, `period2_to` is absent or not a valid `YYYY-MM-DD` date THEN THE SYSTEM SHALL return HTTP 400 with a descriptive error message.

**R19.** IF `period1_from` is after `period1_to`, or `period2_from` is after `period2_to` THEN THE SYSTEM SHALL return HTTP 400 `{ ok: false, error: 'Las fechas de inicio no pueden ser posteriores a las fechas de fin' }`.

**R20.** THE SYSTEM SHALL require an authenticated session; an unauthenticated request SHALL return HTTP 401.

**R21.** THE SYSTEM SHALL respond to `/api/stats/compare` in under 10 seconds.

---

## Endpoint /api/stats/rankings

**R22.** WHEN a client sends `GET /api/stats/rankings` with `from`, `to`, `type`, and optionally `limit` THE SYSTEM SHALL return HTTP 200 with `{ ok: true, data: { type, from, to, limit, rankings: [...] } }`.

**R23.** WHEN `type` is `extension` THE SYSTEM SHALL group CDR records by the `src` field and return the most-used source extensions ordered by total calls DESC.

**R24.** WHEN `type` is `trunk` THE SYSTEM SHALL group CDR records by the normalized channel name (stripping the per-call hex/numeric suffix from `channel`) and return the most-used trunks ordered by total calls DESC.

**R25.** THE SYSTEM SHALL include in each rankings element the fields: `name` (string), `total` (integer), `answered` (integer), `no_answer` (integer), `busy` (integer), `failed` (integer), `avg_duration` (number, seconds, 2 decimal places).

**R26.** WHEN `limit` is provided THE SYSTEM SHALL return at most that many entries. IF `limit` is absent THE SYSTEM SHALL default to `10`.

**R27.** IF `limit` is not an integer between 1 and 50 (inclusive) THEN THE SYSTEM SHALL return HTTP 400 `{ ok: false, error: 'El parámetro limit debe ser un entero entre 1 y 50' }`.

**R28.** IF `type` is absent or not `extension` or `trunk` THEN THE SYSTEM SHALL return HTTP 400 `{ ok: false, error: 'El parámetro type debe ser extension o trunk' }`.

**R29.** IF `from` or `to` is absent or invalid THEN THE SYSTEM SHALL return HTTP 400 with a descriptive error message.

**R30.** IF the queried range contains no CDR records THE SYSTEM SHALL return HTTP 200 with `data.rankings` as an empty array `[]`.

**R31.** THE SYSTEM SHALL require an authenticated session; an unauthenticated request SHALL return HTTP 401.

**R32.** THE SYSTEM SHALL respond to `/api/stats/rankings` in under 10 seconds.

---

## Frontend — HistoricalAnalytics component

**R33.** THE SYSTEM SHALL provide a new page at `/historical/analytics` accessible to authenticated users.

**R34.** THE SYSTEM SHALL display a period selector with options: Día, Semana, Mes, Año, Personalizado. Selecting any option other than Personalizado SHALL auto-fill the `from`/`to` date range accordingly (today for Día, current week for Semana, etc.).

**R35.** WHEN period is `Personalizado` THE SYSTEM SHALL display two date-picker inputs (Fecha desde, Fecha hasta) that the user can set freely.

**R36.** THE SYSTEM SHALL display a trend chart (Recharts `LineChart` or `BarChart`) showing the `total` calls per point in the `points` array from `/api/stats/historical`.

**R37.** THE SYSTEM SHALL display a comparison table with two columns (período anterior vs período actual), showing all six KPIs (`total`, `answered`, `no_answer`, `busy`, `failed`, `avg_duration`) along with the percentage variation; positive variations SHALL be styled green, negative variations red, and `null` variations as `—`.

**R38.** THE SYSTEM SHALL display a rankings table with a toggle to switch between extensions and trunks, showing `name`, `total`, `answered`, `no_answer`, `avg_duration` for each entry.

**R39.** WHILE data is loading THE SYSTEM SHALL display a loading indicator; IF an API error occurs THE SYSTEM SHALL display an inline error banner (no `alert()`).

**R40.** THE SYSTEM SHALL add a navigation entry for "Analytics" in the sidebar (`Layout.jsx`) linking to `/historical/analytics`.

---

## Compatibilidad y seguridad

**R41.** THE SYSTEM SHALL NOT modify or break the existing `GET /api/calls/range` endpoint or the `HistoricalView.jsx` component.

**R42.** THE SYSTEM SHALL NOT write any data to the Issabel CDR database; all queries SHALL be read-only `SELECT` statements.

**R43.** IF the MySQL database is unavailable THE SYSTEM SHALL return HTTP 503 with `{ ok: false, error: 'Base de datos no disponible' }` for all three new endpoints.
