# tasks.md — reports_module

> Feature ID: 12 | Orden de implementación | Revisión: 2026-06-10

El implementer sigue estas tareas en orden. Marca `[x]` al completar cada una.

---

- [x] **T1. Sin nuevas dependencias npm**
  - Confirmar que `exceljs` (^4.4.0) y `pdfkit` (^0.19.0) ya están en `backend/package.json` (ver `design.md §4`). No ejecutar `npm install` adicional.

- [x] **T2. Sin cambios de tablas SQLite**
  - No crear ni modificar tablas en `backend/db/setup.js`. `reportService.getBranding(db, fallbackAppName)` debe verificar la existencia de `system_config` vía `sqlite_master` antes de consultarla (ver `design.md §2`), y devolver `{ companyName: null, logoPath: null }` si la tabla no existe o no hay filas.

- [x] **T3. (Opcional) Extraer constantes de columnas compartidas**
  - Si se decide reutilizar las cabeceras de `inbound`/`outbound` (R21/R23), extraer `OUTBOUND_XLSX_HEADERS`, `OUTBOUND_PDF_HEADERS`, `OUTBOUND_ROW_KEYS` de `backend/routes/outbound.js` (y los defaults equivalentes de `inbound`) a un módulo compartido (p.ej. `backend/services/reportConstants.js`), re-exportándolas desde `routes/outbound.js`/`routes/inbound.js` sin cambiar su comportamiento (`design.md §6.2` y `§8`).

- [x] **T4. Crear `backend/services/reportService.js`**
  - `'use strict'` al inicio.
  - Exportar `REPORT_TYPES = ['executive', 'inbound', 'outbound', 'extensions', 'trunks']`.
  - Implementar `async function collectReportData(pool, type, from, to, { allowedChannels, extractChannel })` que ramifica por `type` según `design.md §5.1`:
    - `executive`: `statsService.queryHistorical(pool, 'custom', from, to)` (overall), `statsService.queryHistorical(pool, 'day', from, to)` (trend), `cdrService.queryInboundExport`/`queryOutboundExport` agregados por `disposition` en JS, `statsService.queryRankings(..., 'extension', 5)`, `statsService.queryRankings(..., 'trunk', 5)`.
    - `inbound`: `cdrService.queryInboundExport(pool, { from, to }, extractChannel)` + resumen por `disposition` agregado en JS + flag `truncated`.
    - `outbound`: `cdrService.queryOutboundExport(pool, { from, to }, allowedChannels, extractChannel)` + resumen por `disposition` + `truncated`.
    - `extensions`: `statsService.queryRankings(pool, from, to, 'extension', 10)`.
    - `trunks`: `statsService.queryRankings(pool, from, to, 'trunk', 10)`.
  - Implementar `function getBranding(db, fallbackAppName)` según `design.md §2`: verifica `system_config` en `sqlite_master`, lee `companyName`/`logoPath` si existen, valida `logoPath` con `fs.existsSync`, y aplica fallback a `fallbackAppName` cuando `companyName` es `null`.
  - No ejecutar SQL nuevo sobre `cdr`; solo invocar funciones de `statsService`/`cdrService` (R11, R12).

- [x] **T5. Extender `backend/services/exportService.js`**
  - Añadir `function drawBarChart(doc, { title, labels, values, x, y, width, height, color })`: dibuja un gráfico de barras simple (ejes, etiquetas, barras proporcionales al valor máximo) usando primitivas de `pdfkit` (`rect`, `text`, `moveTo`/`lineTo`), siguiendo el estilo visual de `drawTable` (colores `#1e3a5f`, `#3b82f6`, etc.).
  - Añadir `function buildReportPdf(res, { type, from, to, branding, data, filenameBase })`:
    - Crea `new PDFDocument({ margin: 40, size: 'A4' })`, pipe a `res`, setea headers `Content-Type: application/pdf` y `Content-Disposition`.
    - Dibuja cabecera: logo (si `branding.logoPath` existe vía `fs.existsSync` → `doc.image`), nombre de empresa (`branding.companyName`), título del reporte según `type`, rango `from`–`to`, timestamp de generación (R13–R15).
    - Cuerpo según `type` (R18–R28): KPIs/tablas vía `drawTable`, al menos un `drawBarChart` por reporte.
    - Si no hay datos para una sección, renderiza "Sin datos para el rango seleccionado" en lugar de tabla/gráfico vacíos (R7).
    - `doc.end()`.
  - Añadir `async function buildReportXlsx(res, { type, from, to, branding, data, filenameBase })`:
    - `new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res })`, setea headers `Content-Type`/`Content-Disposition`.
    - Una o más worksheets por tipo (R29), con bloque de cabecera (título, empresa, rango, timestamp) + tabla(s) de datos.
    - Si una tabla no tiene filas, escribe cabeceras + fila "Sin datos para el rango seleccionado" (R30).
    - `await worksheet.commit()` / `await workbook.commit()`.
  - No modificar la firma ni el comportamiento de `toXlsx`, `toPdf`, `drawTable` existentes (`design.md §8`).

- [x] **T6. Crear `backend/routes/reports.js`**
  - `'use strict'` al inicio.
  - Patrón factory: `module.exports = function reportsRouter(pool, config, db, requireAuth, extractChannel, dbOk) { ... }`.
  - Implementar `GET /reports/:type/pdf` y `GET /reports/:type/xlsx` con un handler compartido parametrizado por `format` (`design.md §5.3`):
    1. Validar `:type` ∈ `reportService.REPORT_TYPES` (R3 → 400).
    2. Validar `from`/`to` formato `YYYY-MM-DD` (R4 → 400) y `from <= to` (R5 → 400).
    3. Si `!dbOk`, devolver 503 `{ ok: false, error: 'Base de datos no disponible' }` (R8).
    4. Iniciar `setTimeout(10000)` para R9 (504 si no hay `res.headersSent` cuando expira).
    5. Llamar `reportService.collectReportData(...)`; al resolver, `clearTimeout`.
    6. Obtener `branding = reportService.getBranding(db, getAppName())` (recibir `getAppName` como parte de `config` o como argumento adicional del factory — documentar elección).
    7. `format === 'pdf'` → `exportService.buildReportPdf(res, {...})`; `format === 'xlsx'` → `await exportService.buildReportXlsx(res, {...})`.
    8. Catch: si `!res.headersSent`, responder 500 `{ ok: false, error: 'Error al generar el reporte' }`; si ya empezó el streaming, solo `console.error` + `res.end()` (R10).
  - Todos los endpoints requieren `requireAuth` (R6).

- [x] **T7. Registrar el router en `backend/server.js`**
  - Dentro de `startServer()`, después de la línea que registra `statsRouter`, añadir:
    ```js
    const reportsRouter = require('./routes/reports');
    app.use('/api', reportsRouter(pool, config, db, requireAuth, extractChannel, dbOk));
    ```
  - Solo esta línea; no modificar ninguna otra parte de `server.js`.

- [x] **T8. Escribir tests `backend/tests/reports.test.js`**
  - Framework: Jest + Supertest, mock de `pool.query` (sin BD real de Issabel) y SQLite `:memory:` o `db` mockeado para `getBranding`.
  - Cubrir, nombrando cada `it` con el `R<n>` correspondiente:
    - `R1`/`R2` — generación exitosa de PDF y XLSX para cada uno de los 5 tipos (`executive`, `inbound`, `outbound`, `extensions`, `trunks`): status 200, `Content-Type` correcto, `Content-Disposition` con el filename esperado.
    - `R3` — `:type` inválido retorna 400 en `/pdf` y `/xlsx`.
    - `R4` — `from`/`to` ausentes o con formato inválido retornan 400.
    - `R5` — `from > to` retorna 400.
    - `R6` — sin sesión retorna 401 en ambas rutas.
    - `R7` — rango sin registros CDR genera igualmente un archivo válido (200) con mensaje "Sin datos...".
    - `R8` — `dbOk = false` retorna 503.
    - `R9` — (test con timeout simulado, p.ej. mockeando `collectReportData` para que tarde más del límite con un timer falso de Jest) retorna 504 si no se han enviado headers.
    - `R13`–`R15` — el PDF incluye nombre de empresa/app; con `getBranding` devolviendo `logoPath: null`, el PDF se genera sin error (degradación elegante).
    - `R18`–`R20` — reporte `executive` incluye KPIs totales, tendencia y top-5 de extensiones/troncales en los datos recolectados.
    - `R21`–`R22`, `R23`–`R24` — reportes `inbound`/`outbound` incluyen resumen por disposición y tabla de detalle.
    - `R25`–`R28` — reportes `extensions`/`trunks` incluyen ranking con las columnas esperadas.
    - `R29`–`R30` — el XLSX de cada tipo contiene las hojas/columnas esperadas y la fila "Sin datos" cuando corresponde.
    - `R37` — verificar (smoke test) que `/api/calls/inbound`, `/api/calls/outbound`, `/api/stats/historical` siguen respondiendo sin cambios (no-regresión, reutilizando los mocks existentes de `inbound.test.js`/`outbound.test.js`/`stats.test.js` si aplica).
  - No hacer requests reales a la BD de Issabel; usar mocks/fixtures de `pool.query` siguiendo el patrón de `stats.test.js`/`inbound.test.js`.

- [x] **T9. Añadir `reportDownload` en `frontend/src/api.js`**
  - Implementar `reportDownload: async ({ type, from, to, format }) => {...}` según `design.md §6.1`: hace `fetch` con `credentials: 'include'`, maneja errores JSON (`!res.ok`), y devuelve `{ blob, filename }` extraído de `Content-Disposition`.

- [x] **T10. Crear `frontend/src/components/ReportsModule.jsx`**
  - Selector de tipo de reporte (5 opciones: Resumen ejecutivo, Llamadas entrantes, Llamadas salientes, Actividad de extensiones, Actividad de troncales) — R31.
  - Date range picker (Desde/Hasta) compartido — R32.
  - Botones "Descargar PDF" / "Descargar Excel": deshabilitados si falta `type`/`from`/`to` (R34); al hacer click, llaman `api.reportDownload(...)`, muestran spinner mientras se resuelve (R35), y disparan la descarga del `blob` vía `URL.createObjectURL` + `<a download>` temporal.
  - `ErrorBanner` inline (no `alert()`) si `api.reportDownload` lanza error (R35).
  - Tailwind para estilos, siguiendo el patrón visual de `HistoricalAnalytics.jsx`/`InboundTable.jsx`.

- [x] **T11. Añadir ruta en `frontend/src/App.jsx` y entrada en sidebar de `frontend/src/components/Layout.jsx`**
  - En `App.jsx`: importar `ReportsModule` y añadir `<Route path="reports" element={<PrivateRoute><ReportsModule /></PrivateRoute>} />` dentro del bloque de rutas protegidas (no admin-only — R36).
  - En `Layout.jsx`: añadir un ítem de navegación "Reportes" (icono Recharts/lucide apropiado, p.ej. `FileText`) con enlace a `/reports`, visible para todos los usuarios autenticados.

- [x] **T12. Verificación final**
  - Ejecutar `npm test` desde `backend/`: todos los tests deben pasar en verde, incluyendo `reports.test.js` y los existentes (no-regresión de `inbound.test.js`, `outbound.test.js`, `stats.test.js`, `users.test.js`).
  - Ejecutar `npm run build` en `frontend/`: build de Vite sin errores.
  - Ejecutar `./init.sh`: debe terminar en verde.
  - Confirmar manualmente que `/api/calls/inbound`, `/api/calls/outbound`, `/api/stats/*` siguen respondiendo igual que antes (R37).
  - Confirmar que la pantalla `/reports` permite seleccionar cada uno de los 5 tipos, elegir rango de fechas, y descargar PDF/Excel correctamente (incluyendo el caso sin logo configurado).
