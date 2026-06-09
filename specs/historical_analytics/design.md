# design.md — historical_analytics

> Feature ID: 11 | Revisión: 2026-06-08

---

## 1. Endpoints nuevos

| Método | Ruta | Auth | Query params | Respuesta exitosa | HTTP codes |
|--------|------|------|--------------|-------------------|-----------|
| GET | `/api/stats/historical` | requireAuth | `period` (day\|week\|month\|year\|custom), `from` (YYYY-MM-DD), `to` (YYYY-MM-DD) | `{ ok: true, data: { period, from, to, points: [{ period_label, total, answered, no_answer, busy, failed, avg_duration }] } }` | 200, 400, 401, 500, 503 |
| GET | `/api/stats/compare` | requireAuth | `period1_from`, `period1_to`, `period2_from`, `period2_to` (all YYYY-MM-DD) | `{ ok: true, data: { period1: { from, to, total, answered, no_answer, busy, failed, avg_duration }, period2: {...}, variation: { total, answered, no_answer, busy, failed, avg_duration } } }` | 200, 400, 401, 500, 503 |
| GET | `/api/stats/rankings` | requireAuth | `from` (YYYY-MM-DD), `to` (YYYY-MM-DD), `type` (extension\|trunk), `limit` (1–50, default 10) | `{ ok: true, data: { type, from, to, limit, rankings: [{ name, total, answered, no_answer, busy, failed, avg_duration }] } }` | 200, 400, 401, 500, 503 |

---

## 2. Lógica de agrupación temporal (queryHistorical)

La query base agrupa el CDR por sub-período usando `DATE_FORMAT` de MySQL. El parámetro `period` determina el formato del GROUP BY:

### period = day
```sql
SELECT
  DATE_FORMAT(calldate, '%Y-%m-%d')  AS period_label,
  COUNT(*)                            AS total,
  SUM(disposition = 'ANSWERED')       AS answered,
  SUM(disposition = 'NO ANSWER')      AS no_answer,
  SUM(disposition = 'BUSY')           AS busy,
  SUM(disposition = 'FAILED')         AS failed,
  ROUND(AVG(duration), 2)             AS avg_duration
FROM cdr
WHERE calldate >= ? AND calldate <= ?
GROUP BY DATE_FORMAT(calldate, '%Y-%m-%d')
ORDER BY period_label ASC
```

### period = week
```sql
SELECT
  DATE_FORMAT(calldate, '%x-W%v')    AS period_label,
  COUNT(*)                            AS total,
  SUM(disposition = 'ANSWERED')       AS answered,
  SUM(disposition = 'NO ANSWER')      AS no_answer,
  SUM(disposition = 'BUSY')           AS busy,
  SUM(disposition = 'FAILED')         AS failed,
  ROUND(AVG(duration), 2)             AS avg_duration
FROM cdr
WHERE calldate >= ? AND calldate <= ?
GROUP BY DATE_FORMAT(calldate, '%x-%v')
ORDER BY DATE_FORMAT(calldate, '%x-%v') ASC
```
(`%x` = ISO year for week, `%v` = ISO week number 01–53)

### period = month
```sql
SELECT
  DATE_FORMAT(calldate, '%Y-%m')     AS period_label,
  COUNT(*)                            AS total,
  SUM(disposition = 'ANSWERED')       AS answered,
  SUM(disposition = 'NO ANSWER')      AS no_answer,
  SUM(disposition = 'BUSY')           AS busy,
  SUM(disposition = 'FAILED')         AS failed,
  ROUND(AVG(duration), 2)             AS avg_duration
FROM cdr
WHERE calldate >= ? AND calldate <= ?
GROUP BY DATE_FORMAT(calldate, '%Y-%m')
ORDER BY period_label ASC
```

### period = year
```sql
SELECT
  DATE_FORMAT(calldate, '%Y')        AS period_label,
  COUNT(*)                            AS total,
  SUM(disposition = 'ANSWERED')       AS answered,
  SUM(disposition = 'NO ANSWER')      AS no_answer,
  SUM(disposition = 'BUSY')           AS busy,
  SUM(disposition = 'FAILED')         AS failed,
  ROUND(AVG(duration), 2)             AS avg_duration
FROM cdr
WHERE calldate >= ? AND calldate <= ?
GROUP BY DATE_FORMAT(calldate, '%Y')
ORDER BY period_label ASC
```

### period = custom
Returns a single aggregate point for the entire range. `period_label` is set in JS as `"${from} / ${to}"`.
```sql
SELECT
  COUNT(*)                            AS total,
  SUM(disposition = 'ANSWERED')       AS answered,
  SUM(disposition = 'NO ANSWER')      AS no_answer,
  SUM(disposition = 'BUSY')           AS busy,
  SUM(disposition = 'FAILED')         AS failed,
  ROUND(AVG(duration), 2)             AS avg_duration
FROM cdr
WHERE calldate >= ? AND calldate <= ?
```

### Date binding
The `from` param is bound as `from + ' 00:00:00'` and `to` as `to + ' 23:59:59'` (matching the convention in `cdrService.js`).

---

## 3. Lógica de rankings (queryRankings)

### type = extension (GROUP BY src)
```sql
SELECT
  src                                    AS name,
  COUNT(*)                               AS total,
  SUM(disposition = 'ANSWERED')          AS answered,
  SUM(disposition = 'NO ANSWER')         AS no_answer,
  SUM(disposition = 'BUSY')              AS busy,
  SUM(disposition = 'FAILED')            AS failed,
  ROUND(AVG(duration), 2)                AS avg_duration
FROM cdr
WHERE calldate >= ? AND calldate <= ?
  AND src IS NOT NULL AND src != ''
GROUP BY src
ORDER BY total DESC
LIMIT ?
```

### type = trunk (GROUP BY normalized channel)
MySQL does not have a regex replace built-in that handles both hex and numeric suffixes cleanly in all versions, so we use a two-step `SUBSTRING_INDEX` approach: strip from the last `-` if it looks like a suffix. In practice, Asterisk always appends exactly one `-<hex or numeric>` segment as the last part of the channel name, so `SUBSTRING_INDEX(channel, '-', -1)` gives the suffix. We compute the normalized name as `LEFT(channel, CHAR_LENGTH(channel) - CHAR_LENGTH(SUBSTRING_INDEX(channel, '-', -1)) - 1)` aliased as `name`:

```sql
SELECT
  LEFT(channel,
    CHAR_LENGTH(channel)
    - CHAR_LENGTH(SUBSTRING_INDEX(channel, '-', -1))
    - 1
  )                                       AS name,
  COUNT(*)                                AS total,
  SUM(disposition = 'ANSWERED')           AS answered,
  SUM(disposition = 'NO ANSWER')          AS no_answer,
  SUM(disposition = 'BUSY')               AS busy,
  SUM(disposition = 'FAILED')             AS failed,
  ROUND(AVG(duration), 2)                 AS avg_duration
FROM cdr
WHERE calldate >= ? AND calldate <= ?
  AND channel IS NOT NULL AND channel != ''
  AND channel NOT LIKE 'Local/%'
GROUP BY name
ORDER BY total DESC
LIMIT ?
```

**Defensive limit:** the service enforces `Math.min(limit, 50)` before passing to the query; the router also validates the raw parameter.

---

## 4. Lógica de comparativa (queryCompare)

The service executes two identical total-stats queries (one per period) in parallel with `Promise.all`, then calculates percentage variations in JavaScript:

```js
function calcVariation(v1, v2) {
  if (v1 === 0) return null;
  return Math.round(((v2 - v1) / v1) * 100 * 10) / 10; // 1 decimal
}
```

Applied to each KPI: `total`, `answered`, `no_answer`, `busy`, `failed`, `avg_duration`.

The per-period total-stats query:
```sql
SELECT
  COUNT(*)                            AS total,
  SUM(disposition = 'ANSWERED')       AS answered,
  SUM(disposition = 'NO ANSWER')      AS no_answer,
  SUM(disposition = 'BUSY')           AS busy,
  SUM(disposition = 'FAILED')         AS failed,
  ROUND(AVG(duration), 2)             AS avg_duration
FROM cdr
WHERE calldate >= ? AND calldate <= ?
```

---

## 5. Servicio nuevo — backend/services/statsService.js

```
'use strict';

module.exports = {
  queryHistorical(pool, period, from, to)  -> Promise<{ period, from, to, points: [...] }>
  queryCompare(pool, p1from, p1to, p2from, p2to) -> Promise<{ period1, period2, variation }>
  queryRankings(pool, from, to, type, limit)     -> Promise<{ type, from, to, limit, rankings: [...] }>
}
```

The service does **not** receive `allowedChannels` or direction filters — the analytics endpoints aggregate all CDR data regardless of trunk direction, consistent with the historical analytics use-case (traffic analysis, not operational filtering). This also keeps the API simpler and the queries faster.

---

## 6. Dependencias nuevas

None. All required packages (`mysql2`, `express`) are already present.

---

## 7. Componente frontend — HistoricalAnalytics.jsx

**Ruta:** `/historical/analytics`

**Estructura de secciones:**

```
<HistoricalAnalytics>
  ├── Header ("Analytics histórico")
  ├── PeriodSelector
  │     ├── Botones: Día | Semana | Mes | Año | Personalizado
  │     ├── (if custom) DatePicker from + DatePicker to
  │     └── Botón "Consultar"
  ├── Section: Tendencia
  │     └── Recharts <ResponsiveContainer><BarChart> o <LineChart>
  │           dataKey="total" + opcionalmente answered
  ├── Section: Comparativa períodos
  │     ├── Sub-header con date pickers para período 1 y período 2
  │     └── Tabla: KPI | P1 valor | P2 valor | Variación %
  └── Section: Rankings
        ├── Toggle "Extensiones" / "Troncales" + input limit
        └── Tabla: # | Nombre | Total | Contestadas | No contestadas | Duración media
```

**API calls (via `src/api.js`):**
- `api.statsHistorical({ period, from, to })` → `GET /api/stats/historical`
- `api.statsCompare({ period1_from, period1_to, period2_from, period2_to })` → `GET /api/stats/compare`
- `api.statsRankings({ from, to, type, limit })` → `GET /api/stats/rankings`

Three new helper functions are added to `src/api.js`.

**State management:** Each section manages its own loading/error state via `useState` + `useEffect` (triggered by a "Consultar" button, not auto-fetch on mount) to avoid firing three requests on page load.

**Auto date-fill logic for PeriodSelector:**
| Option | from | to |
|--------|------|----|
| Día | today | today |
| Semana | Monday of current week | Sunday of current week |
| Mes | 1st of current month | last day of current month |
| Año | Jan 1 of current year | Dec 31 of current year |
| Personalizado | (user-controlled) | (user-controlled) |

---

## 8. Decisión técnica — statsService.js separado de cdrService.js

`cdrService.js` is purpose-built for paginated row-level CDR queries with rich filter support (trunk, origin, disposition, extension). Its `buildWhereClause` pattern and row-level `mapRow` shape are not reusable for aggregation queries.

`statsService.js` deals exclusively with GROUP BY aggregations across different temporal granularities and ranking dimensions. Mixing both concerns in `cdrService.js` would blur the module's single responsibility, making it harder to test and extend independently. A separate service also avoids passing unnecessary `allowedChannels`/direction parameters that are not relevant to analytics endpoints.

---

## 9. Compatibilidad con v1.0

- `GET /api/calls/range` — unchanged; `fetchData()` in `server.js` is not modified.
- `HistoricalView.jsx` at `/historical` — unchanged; the new component lives at `/historical/analytics`.
- `GET /api/calls/today`, SSE, auth, admin endpoints — all unaffected.
- `server.js` receives one new `require` line at its integration point (inside `startServer()`) to mount `statsRouter`.
- No existing database tables or schemas are altered.
