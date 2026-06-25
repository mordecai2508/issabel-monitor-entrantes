# Requirements — reports_cleanup (#52)

## RF1 — Excluir FAILED de todos los reportes

R1. Los reportes NO deben incluir llamadas con `disposition = 'FAILED'` en ningún
    contador: ni en total, ni en ninguna categoría de resumen, ni en las tablas
    de detalle de entrantes/salientes.

R2. La función `summarizeByDisposition` en `reportService.js` debe excluir filas
    FAILED del total y no contarlas en ningún bucket.

R3. `queryHistorical` en `statsService.js` debe excluir FAILED del `total` y
    eliminar el campo `failed` del resultado. La condición SQL debe añadir
    `AND UPPER(disposition) != 'FAILED'` al WHERE (o equivalente).

R4. `exportService.js` debe eliminar todas las referencias a FAILED/Fallidas de:
    - `DISPOSITIONS_ORDER`
    - `DISPOSITION_LABELS`
    - `buildExecutiveSummaryRows` (fila 'Fallidas')
    - `renderExecutiveBody` (texto `Fallidas:` y barra del chart)
    - Hoja Tendencia XLSX (columna 'Fallidas')
    - `RANKING_HEADERS_TRUNK` y `RANKING_HEADERS_EXTENSIONS` (columna 'Fallidas')
    - `RANKING_ROW_KEYS` (clave 'failed')

## RF2 — BUSY → NO ANSWER (consistencia con otros módulos)

R5. BUSY debe seguir reclasificándose como NO ANSWER en `summarizeByDisposition`
    (ya implementado en #37). No debe aparecer como categoría separada en ningún
    reporte.

R6. `queryHistorical` actualmente cuenta `SUM(disposition = 'BUSY') AS busy`
    como campo separado. Este campo debe eliminarse del resultado (BUSY ya queda
    absorbido por `noAnswerExpr` vía `reclassifyCaseExprs`).

R7. `exportService.js` debe eliminar todas las referencias a BUSY/Ocupado de las
    mismas zonas que R4 (DISPOSITIONS_ORDER, DISPOSITION_LABELS,
    buildExecutiveSummaryRows, renderExecutiveBody, Tendencia XLSX,
    RANKING_HEADERS_TRUNK, RANKING_HEADERS_EXTENSIONS, RANKING_ROW_KEYS).

## RF3 — Excluir llamadas internas

R8. En `collectReportData` para el tipo 'executive', las dos llamadas a
    `queryHistorical` (overall y trend) deben pasar `configuredChannels: configuredTrunks`
    dentro de `opts` para que `queryHistorical` aplique el filtro de canales y
    excluya llamadas internas.

    Cambio en `reportService.js`, función `collectReportData`, tipo 'executive':
    ```js
    // Antes
    const opts = { lostDests, configuredTrunks };
    // Después
    const opts = { lostDests, configuredTrunks, configuredChannels: configuredTrunks };
    ```

R9. Las llamadas `queryInboundExport` y `queryOutboundExport` ya filtran por
    `inboundChannels` / `outboundChannels` respectivamente; no requieren cambio.

R10. Los rankings (`queryRankings`) ya filtran por `configuredTrunks`; no
     requieren cambio.

## RF4 — Duración en minutos

R11. En `queryHistorical` (`statsService.js`), cambiar:
     ```sql
     ROUND(AVG(duration), 2) AS avg_duration
     ```
     por:
     ```sql
     ROUND(AVG(billsec) / 60, 1) AS avg_duration
     ```
     en ambas ramas (custom y periódica). Actualizar la serialización JS de
     `.toFixed(2)` a `.toFixed(1)`.

R12. En `exportService.js`, actualizar todas las etiquetas de duración:
     - `'Dur. media (s)'` → `'Dur. media (min)'` en `RANKING_HEADERS_TRUNK`
     - `'Duración media (s)'` → `'Duración media (min)'` en hoja Tendencia XLSX
     - `'Duración media (s):'` → `'Duración media (min):'` en `renderExecutiveBody`
     - `{ metric: 'Duración media (s)', ... }` → `{ metric: 'Duración media (min)', ... }`
       en `buildExecutiveSummaryRows`

R13. Las tablas de detalle (entrantes/salientes) ya usan `duration_fmt` (mm:ss);
     no requieren cambio.
