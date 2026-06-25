# Implementación #52 — reports_cleanup

**Fecha:** 2026-06-25
**Estado:** completada

## Cambios realizados

### T1 — `backend/services/statsService.js`
- `queryHistorical` (rama `custom` y rama periódica): `COUNT(*)` → `SUM(CASE WHEN UPPER(disposition) != 'FAILED' THEN 1 ELSE 0 END)`, eliminadas columnas `busy` y `failed`, cambiado `ROUND(AVG(duration), 2)` → `ROUND(AVG(billsec) / 60, 1)`.
- Serialización de puntos: eliminados campos `busy` y `failed`, `.toFixed(2)` → `.toFixed(1)`.

### T2 — `backend/services/reportService.js`
- `summarizeByDisposition`: excluye FAILED, contabiliza total solo para no-FAILED, elimina BUSY/FAILED del summary.
- `collectReportData` (executive): añadido `configuredChannels: configuredTrunks` en `opts`.
- Eliminada constante `DISPOSITIONS`.
- Actualizado fallback de `overallTotals` sin `busy`/`failed`.

### T3 — `backend/services/exportService.js` (constantes)
- `RANKING_HEADERS_TRUNK`: → `['Nombre', 'Total', 'Contestadas', 'No contestadas', 'Dur. media (min)']`
- `RANKING_HEADERS_EXTENSIONS`: → `['Nombre', 'Llamadas contestadas', 'Dur. media (min)']`
- Añadidas `RANKING_ROW_KEYS_TRUNK` y `RANKING_ROW_KEYS_EXTENSIONS` separadas.
- `DISPOSITION_LABELS` y `DISPOSITIONS_ORDER`: eliminados BUSY y FAILED.

### T4 — `renderExecutiveBody`
- Eliminadas líneas Ocupado/Fallidas del KPI summary.
- Cambiado "Duración media (s)" → "Duración media (min)".
- Simplificadas strings de Entrantes/Salientes.
- Chart de distribución: solo Contestadas / No Contestadas.
- Top-5 extensiones/troncales usan `RANKING_HEADERS_EXTENSIONS`/`RANKING_ROW_KEYS_EXTENSIONS` y `RANKING_HEADERS_TRUNK`/`RANKING_ROW_KEYS_TRUNK` respectivamente.

### T5 — `buildExecutiveSummaryRows`
- Eliminadas filas Ocupado y Fallidas; "Duración media (min)".

### T6 — XLSX
- Hoja Tendencia: sin Ocupado/Fallidas, "Dur. media (min)".
- Rankings XLSX usan `RANKING_ROW_KEYS_EXTENSIONS` y `RANKING_ROW_KEYS_TRUNK`.
- `renderRankingBody`: usa `rankingRowKeys` dinámico por tipo.

### T7 — Build
- `npm run build` completado sin errores (solo warning de chunk size pre-existente).
