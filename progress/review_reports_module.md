# Review — reports_module — APROBADO

## Trazabilidad

| R<n> | Test | Estado |
|---|---|---|
| R1 | `R1 - ${type}: /pdf retorna 200, Content-Type pdf y Content-Disposition con filename` (×5 tipos) — reports.test.js:214 | ✅ |
| R2 | `R2 - ${type}: /xlsx retorna 200, Content-Type xlsx y Content-Disposition con filename` (×5 tipos) — reports.test.js:225 | ✅ |
| R3 | `retorna 400 en /pdf con tipo inválido` / `.../xlsx...` — reports.test.js:241,252 | ✅ |
| R4 | `retorna 400 si from y to están ausentes` / `...formato inválido` — reports.test.js:267,278 | ✅ |
| R5 | `retorna 400` (from > to) — reports.test.js:292 | ✅ |
| R6 | `retorna 401 en /pdf` / `/xlsx` — reports.test.js:307,317 | ✅ |
| R7 | suite `R7 - rango sin registros CDR` (5 tipos × pdf/xlsx, 200 + verificación de tamaño) — reports.test.js:330 | ✅ |
| R8 | `retorna 503 en /pdf` / `/xlsx` con `dbOk=false` — reports.test.js:372,383 | ✅ |
| R9 | `retorna 504 si collectReportData no resuelve antes de 10s y no se enviaron headers` — reports.test.js:398 (test real con timers reales, 15s) | ✅ |
| R10 | Implementado en routes/reports.js:97-107 (`if (!res.headersSent) 500 else console.error+res.end()`); sin test directo de streaming parcial, pero el patrón replica el ya existente en `toPdf`/`toXlsx` (sin handler de error de stream) — aceptable, riesgo residual idéntico al preexistente | ✅ (verificado por inspección) |
| R11 | `collectReportData` solo invoca `statsService`/`cdrService`; sin SQL nuevo sobre `cdr` — services/reportService.js:39-99, verificado por mocks de `pool.query` reutilizados | ✅ |
| R12 | Reutiliza `statsService.queryHistorical/queryRankings` y `cdrService.queryInboundExport/queryOutboundExport` — services/reportService.js | ✅ |
| R13 | `R13/R15 - sin system_config (sin logo), el PDF se genera sin error usando appName` — reports.test.js:416 | ✅ |
| R14 | `R14 - con system_config y companyName configurado, el PDF se genera correctamente` — reports.test.js:430 | ✅ |
| R15 | mismo test R13/R15 — reports.test.js:416; degradación implementada en services/reportService.js:113-144 | ✅ |
| R16 | `drawBarChart` embebido en cada tipo (executive/inbound/outbound/extensions/trunks) en exportService.js, ejercitado por R1/R18/R21/R23/R25/R27 (200 OK) | ✅ |
| R17 | `drawTable` en cada PDF, ejercitado por los mismos tests | ✅ |
| R18 | `genera el PDF correctamente con KPIs totales, tendencia diaria y top-5 extensiones/troncales` — reports.test.js:448 | ✅ |
| R19 | mismo test (gráfico de tendencia en `renderExecutiveBody`) — reports.test.js:448 | ✅ |
| R20 | `genera el XLSX con hojas Resumen, Tendencia, Top Extensiones y Top Troncales` — reports.test.js:463 | ✅ |
| R21 | `genera el XLSX con hojas Resumen y Detalle` (inbound) — reports.test.js:486 | ✅ |
| R22 | `genera el PDF correctamente` (inbound, gráfico de distribución) — reports.test.js:506 | ✅ |
| R23 | `genera el XLSX con hojas Resumen y Detalle` (outbound) — reports.test.js:520 | ✅ |
| R24 | `genera el PDF correctamente` (outbound, gráfico de distribución) — reports.test.js:536 | ✅ |
| R25 | `genera el XLSX con hoja Ranking y columnas esperadas` (extensions) — reports.test.js:552 | ✅ |
| R26 | `genera el PDF correctamente` (extensions, top-N chart) — reports.test.js:571 | ✅ |
| R27 | `genera el XLSX con hoja Ranking y columnas esperadas` (trunks) — reports.test.js:585 | ✅ |
| R28 | `genera el PDF correctamente` (trunks, top-N chart) — reports.test.js:603 | ✅ |
| R29 | bloque de cabecera + tablas en cada hoja, verificado en R18/R20/R21/R23/R25/R27 (`writeXlsxHeaderBlock`) | ✅ |
| R30 | `inbound: hoja Detalle muestra "Sin datos..."` / `extensions: hoja Ranking muestra "Sin datos..."` — reports.test.js:619,635 | ✅ |
| R31 | Selector de tipo (5 opciones) — frontend/src/components/ReportsModule.jsx (`REPORT_TYPES`) | ✅ |
| R32 | Date range picker Desde/Hasta — ReportsModule.jsx | ✅ |
| R33 | Botones "Descargar PDF"/"Descargar Excel" → `api.reportDownload` — ReportsModule.jsx + frontend/src/api.js | ✅ |
| R34 | `canDownload` deshabilita botones si falta type/from/to — ReportsModule.jsx | ✅ |
| R35 | `loadingFormat` (spinner) + `ErrorBanner` inline (sin `alert()`) — ReportsModule.jsx | ✅ |
| R36 | NavItem "Reportes" visible para todos los autenticados (no admin-only) — Layout.jsx; ruta `/reports` dentro de `PrivateRoute` — App.jsx | ✅ |
| R37 | `GET /api/calls/inbound`/`outbound`/`stats/historical` siguen respondiendo con su contrato original — reports.test.js:655,670,685 | ✅ |
| R38 | `getBranding` verifica `system_config` vía `sqlite_master` antes de consultar; degrada a `{ companyName: fallbackAppName, logoPath: null }` si no existe — services/reportService.js:113-144, cubierto por reports.test.js:416 | ✅ |
| R39 | Timeout de 10s (`REPORT_TIMEOUT_MS`) en routes/reports.js:75-81, cubierto indirectamente por el test de R9 | ✅ |

## No-regresión v1.0: ✅
- `cd backend && npx jest --forceExit` → **130/130 passing** (5 suites), incluye `reports.test.js` (47 tests) e `inbound.test.js`/`outbound.test.js`/`stats.test.js`/`users.test.js` sin cambios y en verde.
- `cd frontend && npm run build` → sin errores (warning preexistente de chunk size por Recharts, no introducido por esta feature).
- `bash init.sh` desde la raíz → **25/25 checks ✅**.
- Registro en `server.js` es una sola línea: `app.use('/api', reportsRouter(pool, config, db, requireAuth, extractChannel, dbOk));`, precedida por `const reportsRouter = require('./routes/reports');` junto a los otros `require` de routers — sin otros cambios en `server.js`.
- Suite `R37` confirma que `/api/calls/inbound`, `/api/calls/outbound` y `/api/stats/historical` mantienen su contrato (`ok`, `data`, `meta.total`/`points`); `/api/calls/inbound/export`, `/api/calls/outbound/export`, `/api/stats/compare`, `/api/stats/rankings` no fueron modificados (verificado por `git diff` — solo se tocó `routes/outbound.js` para extraer constantes, sin cambio de comportamiento, y `outbound.test.js`/`inbound.test.js`/`stats.test.js` siguen en verde sin modificaciones).
- `/api/auth/*`, `/api/admin/*`, `/api/events` (SSE) no fueron tocados.

## Convenciones: ✅
- `backend/routes/reports.js` usa el patrón factory `(pool, config, db, requireAuth, extractChannel, dbOk) => router`, consistente con el precedente documentado en `design.md §5.3`/§9 de `historical_analytics`.
- Sin `SELECT *` en ningún archivo nuevo/modificado; todas las queries SQL provienen de `statsService`/`cdrService` (ya parametrizadas con `?`); `getBranding` usa `db.prepare(...).get()/.all()` con literales fijos (`sqlite_master`, `system_config`), sin concatenación de input de usuario.
- Sin `console.log` de debug — único `console.error` en catch (`reportService.getBranding`, `routes/reports.js`, `drawReportHeader`).
- Sin `fetch()` directo en `ReportsModule.jsx` — toda la descarga pasa por `api.reportDownload` en `src/api.js`.
- Sin TypeScript introducido (todos los archivos nuevos son `.js`/`.jsx`).
- `cdr` (Issabel) solo se lee; no se crean ni modifican tablas SQLite (T2 cumplido — `getBranding` chequea `sqlite_master` antes de tocar `system_config`).
- `exportService.js`: `toXlsx`, `toPdf`, `drawTable` **no cambiaron de firma ni comportamiento** (confirmado por `git diff` — solo se añadieron imports, constantes y las funciones nuevas `drawBarChart`, `buildReportPdf`, `buildReportXlsx`, `drawReportHeader`, `drawNoDataMessage`, `renderExecutiveBody`, `renderCallsBody`, `renderRankingBody`, `writeXlsxHeaderBlock`, `writeXlsxTable`, `buildExecutiveSummaryRows`); `module.exports` ahora exporta también `drawBarChart`, `buildReportPdf`, `buildReportXlsx` además de `toXlsx`/`toPdf`/`drawTable`.
- `routes/outbound.js` solo importa `OUTBOUND_*_HEADERS`/`OUTBOUND_ROW_KEYS` desde el nuevo `reportConstants.js` en lugar de declararlas localmente — sin cambio de comportamiento de `/api/calls/outbound/export` (confirmado por `outbound.test.js` en verde).
- T1 (sin nuevas dependencias): `exceljs@^4.4.0` y `pdfkit@^0.19.0` ya estaban en `backend/package.json`; sin diff en `package.json`.

## Seguridad: ✅
- `GET /api/reports/:type/pdf` y `GET /api/reports/:type/xlsx` usan `requireAuth` (R6, verificado por R6 tests → 401 sin sesión).
- Validación de inputs antes de tocar la BD: `:type` ∈ `REPORT_TYPES` (R3 → 400), `from`/`to` con regex `YYYY-MM-DD` + `Date` válida (R4 → 400), `from <= to` (R5 → 400) — todo antes de `collectReportData`.
- `dbOk=false` → 503 antes de cualquier query (R8).
- Timeout de 10s (R9) → 504 si no se enviaron headers; flag `timedOut` evita doble respuesta cuando `collectReportData` resuelve tarde.
- Manejo de error post-streaming (R10): `if (!res.headersSent) 500 else console.error + res.end()`.
- `getBranding`: `logoPath` validado con `fs.existsSync` antes de `doc.image()`; sin escritura a `cdr`.

## Tests: ✅ (130/130 passing, 47/47 en reports.test.js)

**Decisión: APROBADO.**
**SIGUIENTE PASO OBLIGATORIO:** git add -A && git commit -m "feat(reports_module): Generación de reportes PDF y Excel"
Solo después del commit: marcar done en feature_list.json e iniciar la siguiente feature.
