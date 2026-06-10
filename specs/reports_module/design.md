# design.md — reports_module

> Feature ID: 12 | Revisión: 2026-06-10

---

## 1. Endpoints nuevos

| Método | Ruta | Auth | Query params | Respuesta exitosa | HTTP codes |
|--------|------|------|--------------|--------------------|-----------|
| GET | `/api/reports/:type/pdf` | requireAuth | `type` (path: `executive\|inbound\|outbound\|extensions\|trunks`), `from` (YYYY-MM-DD), `to` (YYYY-MM-DD) | Streamed file: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="reporte_<type>_<from>_<to>.pdf"` | 200, 400, 401, 503, 504, 500 |
| GET | `/api/reports/:type/xlsx` | requireAuth | `type` (path: `executive\|inbound\|outbound\|extensions\|trunks`), `from` (YYYY-MM-DD), `to` (YYYY-MM-DD) | Streamed file: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="reporte_<type>_<from>_<to>.xlsx"` | 200, 400, 401, 503, 504, 500 |

Validation errors (400/401/503/504) follow the standard JSON error shape `{ ok: false, error: '...' }` and MUST be sent **before** any file bytes are written (`res.headersSent === false`). Once streaming has started, errors are not converted to JSON (see R10) — the response is simply ended.

**Note:** these two routes are intentionally generic (`:type` as a path param) rather than five separate routes per type, to avoid duplicating the validation/timeout/error-handling boilerplate. The per-type logic lives entirely in `reportService.js`.

---

## 2. Cambios en BD

**Ninguna tabla SQLite nueva.** `reports_module` no persiste nada propio (no hay configuración de reportes guardada, no hay historial de descargas).

**Lectura opcional y defensiva de `system_config` (feature #13, aún no existe):**

`reportService.js` exposes a small helper, `getBranding(db)`, that:
1. Checks whether the `system_config` table exists, using:
   ```sql
   SELECT name FROM sqlite_master WHERE type='table' AND name='system_config'
   ```
2. If the table exists, reads `key IN ('companyName', 'logoPath')` rows via a prepared statement:
   ```sql
   SELECT key, value FROM system_config WHERE key IN ('companyName', 'logoPath')
   ```
3. If the table does not exist, or a row is missing, or `logoPath` points to a file that does not exist on disk, the corresponding value is treated as absent (`null`).
4. Returns `{ companyName: string|null, logoPath: string|null }`.

This means `reportService.js` has **zero hard dependency** on feature #13: when it ships, reports automatically pick up `companyName`/logo without any change to `reports_module`. Until then, `getBranding()` always returns `{ companyName: null, logoPath: null }` and the report falls back to `config.app?.name` (existing `getAppName()` logic in `server.js`, replicated here as a parameter passed into the service — see §4).

---

## 3. Queries CDR reutilizadas (sin queries SQL nuevas sobre `cdr`)

`reportService.js` does **not** write any new SQL against `asteriskcdrdb.cdr`. It composes existing, already-tested service functions:

| Función reutilizada | Origen | Uso en reportes |
|---|---|---|
| `statsService.queryHistorical(pool, 'day', from, to)` | `backend/services/statsService.js` | Tendencia diaria para `executive` (R19) y para los charts de `inbound`/`outbound` (agregados por disposición se derivan sumando `points`). |
| `statsService.queryRankings(pool, from, to, 'extension', limit)` | `backend/services/statsService.js` | Ranking de extensiones para `executive` (top 5, R20) y `extensions` (top N, R25–R26). |
| `statsService.queryRankings(pool, from, to, 'trunk', limit)` | `backend/services/statsService.js` | Ranking de troncales para `executive` (top 5, R20) y `trunks` (top N, R27–R28). |
| `cdrService.queryInboundExport(pool, filters, extractChannel)` | `backend/services/cdrService.js` | Tabla de detalle del reporte `inbound` (R21), capada a `MAX_EXPORT_ROWS` (10,000) igual que la exportación existente. |
| `cdrService.queryOutboundExport(pool, filters, allowedChannels, extractChannel)` | `backend/services/cdrService.js` | Tabla de detalle del reporte `outbound` (R23), capada a `MAX_EXPORT_ROWS`. |

For `executive`, the totals by disposition (R18) are obtained via `statsService.queryHistorical(pool, 'custom', from, to)`, which already returns a single aggregate point `{ total, answered, no_answer, busy, failed, avg_duration }` for the whole range — reused for both the overall total and, called twice more with inbound/outbound-specific filters... **however**, `queryHistorical` has no direction filter (it aggregates the whole `cdr` table, by design — see `historical_analytics design.md §5`). Therefore:

- The **overall** total/answered/no_answer/busy/failed/avg_duration for `executive` come from `statsService.queryHistorical(pool, 'custom', from, to)`.
- The **inbound vs outbound breakdown** required by R18 is obtained by reusing the row-level export queries already used for the `inbound`/`outbound` reports (`cdrService.queryInboundExport` / `queryOutboundExport`) and aggregating the returned rows by `disposition` in JavaScript. Because these export queries are capped at `MAX_EXPORT_ROWS`, `reportService.js` documents this as an accepted approximation for very high-volume ranges (consistent with the existing export behavior, which already shows a "truncated" warning) — see §6 Decisión técnica for the alternative considered and rejected.

No new parameterized SQL strings are introduced; everything flows through the existing `?`-parameterized functions.

---

## 4. Dependencias npm

**Ninguna dependencia nueva.**

| Paquete | Estado | Uso |
|---|---|---|
| `exceljs` | Ya instalado (`^4.4.0`) | Generación de los workbooks `.xlsx` para los 5 tipos de reporte. |
| `pdfkit` | Ya instalado (`^0.19.0`) | Generación de los PDFs: cabecera con logo/nombre, tablas (reutilizando el helper `drawTable` de `exportService.js`), y gráficos embebidos. |

**Gráficos embebidos sin librería de charts:** `pdfkit` 0.19 expone primitivas vectoriales (`rect`, `moveTo`/`lineTo`, `circle`, `text`, `fillColor`) suficientes para dibujar barras y líneas simples directamente sobre el `PDFDocument` — exactamente el mismo enfoque que `exportService.drawTable()` ya usa para dibujar tablas. Se añade un nuevo helper `drawBarChart(doc, { title, labels, series, x, y, width, height })` en `exportService.js` que dibuja un gráfico de barras agrupado/simple usando solo estas primitivas. Esto cumple R16/R22/R24/R26/R28 sin instalar `chart.js`, `canvas`, `chartjs-node-canvas` ni librerías SVG — ninguna de las cuales está justificada dado que pdfkit ya cubre el caso de uso.

---

## 5. Lógica no obvia de generación por tipo de reporte

### 5.1 Servicio nuevo — `backend/services/reportService.js`

```js
'use strict';

module.exports = {
  REPORT_TYPES: ['executive', 'inbound', 'outbound', 'extensions', 'trunks'],

  // Recolecta todos los datos crudos necesarios para un tipo de reporte.
  // No genera el archivo — eso lo hacen buildReportPdf / buildReportXlsx.
  async collectReportData(pool, type, from, to, { allowedChannels, extractChannel }) -> Promise<object>,

  // Lee branding opcional desde SQLite (system_config) con fallback a appName.
  getBranding(db, fallbackAppName) -> { companyName: string, logoPath: string|null },
};
```

`collectReportData` ramifica por `type`:

- **executive**:
  - `overall = statsService.queryHistorical(pool, 'custom', from, to)` → KPIs totales.
  - `trend = statsService.queryHistorical(pool, 'day', from, to)` → puntos diarios (R19).
  - `inboundRows = cdrService.queryInboundExport(...)`, `outboundRows = cdrService.queryOutboundExport(...)` → se agregan en JS por `disposition` para obtener `inboundTotals` / `outboundTotals` (R18).
  - `topExtensions = statsService.queryRankings(pool, from, to, 'extension', 5)`.
  - `topTrunks = statsService.queryRankings(pool, from, to, 'trunk', 5)`.

- **inbound**:
  - `rows = cdrService.queryInboundExport(pool, { from, to }, extractChannel)`.
  - `summary` = conteo por `disposition` agregado en JS a partir de `rows` (R21).
  - `truncated = rows.length >= MAX_EXPORT_ROWS`.

- **outbound**: análogo a `inbound`, usando `cdrService.queryOutboundExport`.

- **extensions**:
  - `rankings = statsService.queryRankings(pool, from, to, 'extension', 10)` (R25–R26; N=10 por defecto, mismo límite que `historical_analytics`).

- **trunks**:
  - `rankings = statsService.queryRankings(pool, from, to, 'trunk', 10)`.

`collectReportData` returns a plain object whose shape depends on `type`; `buildReportPdf`/`buildReportXlsx` (in `exportService.js`, see below) destructure the relevant fields per type.

### 5.2 Extensión de `backend/services/exportService.js`

Two new exported functions are added alongside the existing `toXlsx`/`toPdf`/`drawTable`:

```js
// Renders a full multi-section report PDF and pipes it to res.
function buildReportPdf(res, { type, from, to, branding, data, filenameBase }) { ... }

// Renders a full multi-section report workbook and streams it to res.
async function buildReportXlsx(res, { type, from, to, branding, data, filenameBase }) { ... }

// New low-level chart helper, reused by buildReportPdf for all 5 report types.
function drawBarChart(doc, { title, labels, values, x, y, width, height, color }) { ... }
```

`buildReportPdf` flow (shared header/footer for all 5 types):
1. Create `new PDFDocument({ margin: 40, size: 'A4' })` (portrait — reports favor vertical layout vs. the landscape used for raw CDR exports), pipe to `res`.
2. **Header**: if `branding.logoPath` is set and the file exists (`fs.existsSync`), `doc.image(branding.logoPath, 40, 40, { width: 80 })`; draw `branding.companyName` (or fallback app name) as title text next to/below the logo. If no logo, just draw the company name as the title (R14/R15).
3. Draw report title (per type, e.g. "Resumen Ejecutivo", "Llamadas Entrantes") and the date range `from – to` plus generation timestamp — same style as `exportService.toPdf`'s existing title block.
4. **Body** — per type:
   - `executive`: KPI summary block (text/grid of numbers), `drawBarChart` for the daily trend (R19), then two small ranking tables (top 5 extensions, top 5 trunks) using `drawTable`.
   - `inbound`/`outbound`: disposition summary as a small table, `drawBarChart` showing counts per disposition (R22/R24), then `drawTable` with the detail rows (reusing existing headers/row-keys constants from `inbound.js`/`outbound.js`, exported for reuse — see §6).
   - `extensions`/`trunks`: `drawBarChart` for top-N by total calls, then `drawTable` with the full ranking (columns per R25/R27).
5. If `data` indicates no records for the relevant table (R7), render a centered "Sin datos para el rango seleccionado" message instead of an empty table/chart, but still render the header/branding section.
6. `doc.end()`.

`buildReportXlsx` flow:
1. `new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res })` (same streaming pattern as `toXlsx`).
2. One worksheet per logical section (e.g. `executive` → sheets "Resumen", "Tendencia", "Top Extensiones", "Top Troncales"; `inbound`/`outbound` → sheets "Resumen", "Detalle"; `extensions`/`trunks` → sheet "Ranking").
3. Each worksheet's first rows are a small header block (report title, company name, date range, generated-at) written as plain rows, followed by a blank row, then the column-header row and data rows (R29).
4. If a table has zero rows, write the header row plus one row with the literal text "Sin datos para el rango seleccionado" (R30).
5. `await worksheet.commit()` per sheet, then `await workbook.commit()`.

### 5.3 Router — `backend/routes/reports.js`

```js
'use strict';
module.exports = function reportsRouter(pool, config, db, requireAuth, extractChannel) {
  const router = express.Router();

  router.get('/reports/:type/pdf',  requireAuth, handler('pdf'));
  router.get('/reports/:type/xlsx', requireAuth, handler('xlsx'));

  function handler(format) {
    return async (req, res) => {
      // 1. validate :type (R3), from/to (R4), from <= to (R5)
      // 2. if (!dbOk) return 503 (R8)
      // 3. start a 10s timer (R9): if it fires before any data is collected /
      //    before res.headersSent, respond 504 and abort
      // 4. collect data via reportService.collectReportData(...)
      // 5. clear the timer
      // 6. branding = reportService.getBranding(db, getAppName())
      // 7. format === 'pdf'  -> exportService.buildReportPdf(res, {...})
      //    format === 'xlsx' -> await exportService.buildReportXlsx(res, {...})
      // 8. catch: if (!res.headersSent) respond 500 JSON; else res.end() + console.error (R10)
    };
  }

  return router;
};
```

`dbOk` is passed in the same way as `statsRouter` is wired (see `historical_analytics` design §9 for precedent — `app.use('/api', statsRouter(pool, config, requireAuth, dbOk))`); `reportsRouter` follows the same `(pool, config, db, requireAuth, extractChannel, dbOk)` factory signature, consistent with `docs/architecture.md`'s `(pool, config, db)` base pattern plus the extra params already used by `inboundRouter`/`outboundRouter`/`statsRouter`.

### 5.4 Timeout handling (R9)

A `setTimeout(10000)` is started when the request handler begins. If `collectReportData` (the slow, DB-bound part) has not resolved by then, the timeout callback checks `res.headersSent`; if `false`, it responds `504 { ok: false, error: 'La generación del reporte tardó demasiado' }` and marks a local `timedOut` flag so the late-resolving promise's `.then()` is a no-op. If `collectReportData` resolves first, `clearTimeout` is called before any streaming begins — streaming itself (PDF/XLSX generation) is CPU-bound and fast (capped row counts), so the 10s budget is dominated by the SQL queries, matching the rationale in `docs/architecture.md` RNF-02.

---

## 6. Componentes frontend

### 6.1 `frontend/src/components/ReportsModule.jsx` (nuevo)

**Ruta:** `/reports` (nueva entrada de sidebar "Reportes", visible para `admin` y `monitor`/operador — R36).

**Estructura:**
```
<ReportsModule>
  ├── Header ("Reportes")
  ├── Selector de tipo (5 botones u <select>):
  │     Resumen ejecutivo | Llamadas entrantes | Llamadas salientes |
  │     Actividad de extensiones | Actividad de troncales
  ├── Date range picker (Desde / Hasta) — mismo patrón que InboundTable/HistoricalAnalytics
  ├── Botones "Descargar PDF" / "Descargar Excel"
  │     - disabled si falta type/from/to (R34)
  │     - loading spinner en el botón mientras se genera (R35)
  └── ErrorBanner inline si la descarga falla (R35)
```

**Descarga de archivos:** dado que `/api/reports/:type/pdf|xlsx` requiere sesión (cookie `httpOnly`), no se puede usar un simple `<a href>` con `fetch` cross-origin sin cookies — pero como el navegador adjunta cookies automáticamente en navegación normal (`window.location` / `<a>` con `credentials` del mismo origen), se reutiliza el **mismo patrón ya usado en `InboundTable.jsx`/`OutboundTable.jsx`** (`triggerDownload`): crear un `<a>` temporal con `href` apuntando a la URL del endpoint y `click()` programático. Esto evita `fetch()` directo en el componente (regla de `docs/conventions.md`) para la *construcción de la URL*, pero la descarga en sí no pasa por `src/api.js` porque es una navegación de archivo, no una llamada JSON — exactamente el precedente ya establecido por `InboundTable.buildExportUrl`/`triggerDownload`.

To surface server-side errors (400/503/504) that occur *before* any bytes are sent — which a plain `<a>` download cannot detect — `ReportsModule.jsx` first calls a lightweight HEAD-equivalent check via `src/api.js` (a new helper `api.checkReport({ type, from, to, format })` issuing `fetch` with `method: 'HEAD'`... 

**Decisión final (ver §7):** en lugar de un HEAD especial, se opta por un enfoque más simple y consistente: el botón de descarga llama a `api.reportDownload({ type, from, to, format })`, una función en `src/api.js` que hace `fetch(url, { credentials: 'include' })`, inspecciona `res.ok`; si falla, lee el JSON de error y lo muestra en el banner; si tiene éxito, convierte la respuesta a `Blob` y dispara la descarga vía `URL.createObjectURL` + `<a download>`. This keeps **all** HTTP calls behind `src/api.js` (per `docs/conventions.md` — "Nunca fetch() directo en componentes"), while still surfacing JSON error bodies to the UI.

**Nuevas funciones en `src/api.js`:**
```js
reportDownload: async ({ type, from, to, format }) => {
  const params = new URLSearchParams({ from, to });
  const res = await fetch(`/api/reports/${type}/${format}?${params}`, { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename="(.+)"/);
  return { blob, filename: match ? match[1] : `reporte.${format}` };
}
```
`ReportsModule.jsx` then creates an object URL from `blob` and triggers the download via a temporary `<a>`, mirroring the existing pattern but going through `api.js`.

### 6.2 Reutilización de constantes de columnas

`OUTBOUND_XLSX_HEADERS`, `OUTBOUND_PDF_HEADERS`, `OUTBOUND_ROW_KEYS` (currently private to `routes/outbound.js`) and the equivalent inbound defaults (currently inline defaults inside `exportService.toXlsx`/`toPdf`) are extracted to a small shared module `backend/services/reportConstants.js` (or kept inline and re-exported from `cdrService.js`/`outbound.js` — implementer's choice, documented in code comments) so `reportService`/`exportService` can reuse the exact same header labels for the `inbound`/`outbound` report tables without duplicating string literals. **No behavior change** to `routes/inbound.js` / `routes/outbound.js` — only an extraction/re-export.

---

## 7. Decisión técnica clave

**Opción elegida:** generar gráficos embebidos en el PDF mediante primitivas vectoriales nativas de `pdfkit` (`drawBarChart` helper en `exportService.js`), y reutilizar `statsService`/`cdrService` para todos los datos, sin SQL nuevo.

**Alternativas descartadas:**

1. **`chartjs-node-canvas` / `canvas` + renderizar PNG e incrustarlo con `doc.image()`.**
   Descartada porque: (a) `canvas` requiere binarios nativos (compilación con `node-gyp`, dependencias de sistema como `cairo`/`pango`) que complican el despliegue Docker de un solo contenedor descrito en `docs/architecture.md`; (b) `docs/conventions.md` exige justificar cualquier dependencia nueva, y pdfkit ya es suficiente para barras simples; (c) introduce una superficie de fallo adicional (renderizado headless) para un requisito que solo pide "al menos un gráfico".

2. **Generar los reportes completamente en el frontend (Recharts → `toDataURL` → enviar imagen al backend para incrustarla en el PDF).**
   Descartada porque invierte el flujo de descarga (el backend ya no podría generar el archivo bajo demanda de forma autocontenida vía `GET`), complica la cancelación/timeout (R9), y rompe el patrón "click en `<a>` para descargar" usado por `InboundTable`/`OutboundTable`.

3. **Una query SQL "todo en uno" por tipo de reporte directamente sobre `cdr`.**
   Descartada porque duplicaría lógica ya probada en `statsService`/`cdrService` (violando R12 y la regla "no reimplementar lo que ya existe" de `docs/existing_code.md`), y porque las queries de agregación por disposición/ranking ya están optimizadas y testeadas en `historical_analytics`.

4. **Endpoints separados por tipo (`/api/reports/executive/pdf`, `/api/reports/inbound/pdf`, ...) como rutas Express literales.**
   Descartada en favor de `/api/reports/:type/pdf` con validación de `:type` en el router — reduce duplicación de boilerplate (validación de fechas, manejo de timeout/503/504) a una sola implementación por formato, mientras el `feature_list.json` y los tests siguen pudiendo referirse a cada `type` individualmente.

---

## 8. Compatibilidad con v1.0

- No se modifica ningún endpoint existente: `/api/calls/today`, `/api/calls/range`, `/api/calls/inbound`, `/api/calls/inbound/export`, `/api/calls/outbound`, `/api/calls/outbound/export`, `/api/stats/historical`, `/api/stats/compare`, `/api/stats/rankings`, `/api/auth/*`, `/api/admin/*`, `/api/events` (SSE) permanecen sin cambios (R37).
- `exportService.js` recibe **dos funciones nuevas exportadas** (`buildReportPdf`, `buildReportXlsx`) y un helper (`drawBarChart`); las funciones existentes `toXlsx`, `toPdf`, `drawTable` no cambian su firma ni comportamiento.
- `cdrService.js` y `statsService.js` no se modifican (solo se invocan).
- `routes/outbound.js` solo se toca si el implementer decide extraer las constantes `OUTBOUND_*_HEADERS`/`OUTBOUND_ROW_KEYS` a un módulo compartido — en ese caso, `routes/outbound.js` simplemente importa las mismas constantes desde el nuevo módulo en lugar de declararlas localmente; el comportamiento del endpoint `/api/calls/outbound/export` es idéntico.
- `server.js` recibe **una sola línea nueva** dentro de `startServer()`, después del registro de `statsRouter`:
  ```js
  const reportsRouter = require('./routes/reports');
  app.use('/api', reportsRouter(pool, config, db, requireAuth, extractChannel, dbOk));
  ```
- No se crean ni modifican tablas SQLite. La lectura opcional de `system_config` (§2) usa `sqlite_master` para verificar existencia antes de consultar, por lo que es segura incluso si la tabla no existe (feature #13 pendiente).
- Frontend: un componente nuevo (`ReportsModule.jsx`), una ruta nueva (`/reports`) en `App.jsx`, una entrada nueva en el sidebar de `Layout.jsx`, y un método nuevo (`reportDownload`) en `src/api.js`. Ningún componente existente (`InboundTable.jsx`, `OutboundTable.jsx`, `HistoricalAnalytics.jsx`, `Dashboard.jsx`, etc.) se modifica.
