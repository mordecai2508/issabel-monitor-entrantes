# Review Feature #52 — reports_cleanup

**Fecha:** 2026-06-25
**Reviewer:** agente reviewer

---

## Resultados por requisito

### backend/services/statsService.js — queryHistorical

| Req | Estado | Detalle |
|-----|--------|---------|
| R1 | ✅ PASS | Línea 93: `SUM(CASE WHEN UPPER(disposition) != 'FAILED' THEN 1 ELSE 0 END) AS total` presente en la rama `custom`. |
| R2 | ✅ PASS | Líneas 96 y 107: `ROUND(AVG(billsec) / 60, 1) AS avg_duration` en ambas ramas (custom y period grouping). |
| R3 | ✅ PASS | No existe `SUM(disposition = 'BUSY') AS busy` ni `SUM(disposition = 'FAILED') AS failed` en `queryHistorical`. Sí existen en `queryCompare` y `queryRankings`, que son funciones distintas y no están en scope de esta feature. |
| R4 | ✅ PASS | Los objetos punto (líneas 122-127 y 130-136) solo tienen: `period_label`, `total`, `answered`, `no_answer`, `avg_duration`. Sin campos `busy` ni `failed`. |
| R5 | ✅ PASS | Líneas 127 y 135: `Number(r.avg_duration).toFixed(1)` — usa `.toFixed(1)`. |

### backend/services/reportService.js

| Req | Estado | Detalle |
|-----|--------|---------|
| R6 | ✅ PASS | Línea 17: `const summary = { total: 0, ANSWERED: 0, 'NO ANSWER': 0 };` — sin `BUSY` ni `FAILED`. |
| R7 | ✅ PASS | Línea 20: `if (d === 'FAILED') continue;` — filas FAILED excluidas con `continue` antes de incrementar `total`. |
| R8 | ✅ PASS | No existe constante `DISPOSITIONS` en `reportService.js`. |
| R9 | ✅ PASS | Línea 42: `const opts = { lostDests, configuredTrunks, configuredChannels: configuredTrunks };` — `opts` incluye `configuredChannels: configuredTrunks` en el bloque `type === 'executive'`. |

### backend/services/exportService.js

| Req | Estado | Detalle |
|-----|--------|---------|
| R10 | ✅ PASS | Línea 34: `DISPOSITIONS_ORDER  = ['ANSWERED', 'NO ANSWER']` — sin BUSY ni FAILED. |
| R11 | ✅ PASS | Línea 33: `DISPOSITION_LABELS  = { ANSWERED: 'Contestadas', 'NO ANSWER': 'No contestadas' }` — solo dos entradas. |
| R12 | ✅ PASS | Línea 26: `RANKING_HEADERS_TRUNK = ['Nombre', 'Total', 'Contestadas', 'No contestadas', 'Dur. media (min)']`. |
| R13 | ✅ PASS | Línea 27: `RANKING_HEADERS_EXTENSIONS = ['Nombre', 'Llamadas contestadas', 'Dur. media (min)']`. |
| R14 | ✅ PASS | Líneas 29-30: `RANKING_ROW_KEYS_TRUNK = ['name', 'total', 'answered', 'no_answer', 'avg_duration']` y `RANKING_ROW_KEYS_EXTENSIONS = ['name', 'answered', 'avg_duration']` como constantes separadas. |
| R15 | ✅ PASS | `renderExecutiveBody` (líneas 346-440) no tiene referencias a `busy`, `failed`, 'Ocupado' ni 'Fallidas'. El bloque KPI solo muestra: total, contestadas, no contestadas, duración media. |
| R16 | ✅ PASS | Líneas 376-381: el chart de distribución usa `labels: ['Contestadas', 'No Contestadas']` y `values: [overallTotals.answered, overallTotals.no_answer]`. Solo dos series. |
| R17 | ✅ PASS | `buildExecutiveSummaryRows` (líneas 752-759): filas `Total de llamadas`, `Contestadas`, `No contestadas`, `Duración media (min)`. Sin Ocupado ni Fallidas. Usa `'Duración media (min)'`. |
| R18 | ✅ PASS | Líneas 672-673: `writeXlsxTable(wsTrend, ['Fecha', 'Total', 'Contestadas', 'No contestadas', 'Dur. media (min)'], ...)` — sin Ocupado ni Fallidas. |
| R19 | ✅ PASS | Líneas 571-572: `renderRankingBody` selecciona `RANKING_HEADERS_EXTENSIONS`/`RANKING_ROW_KEYS_EXTENSIONS` para extensions y `RANKING_HEADERS_TRUNK`/`RANKING_ROW_KEYS_TRUNK` para trunks. |

### Build

| Req | Estado | Detalle |
|-----|--------|---------|
| R20 | ✅ PASS | `npm run build` completó sin errores en 14.36s. Solo advertencia de chunk size (>500kB), que no es un error. |

---

## Resumen

**Todos los 20 requisitos verificados: PASS.**

No se encontraron regresiones ni referencias a campos eliminados (`busy`, `failed`, `BUSY`, `FAILED`) en las funciones en scope. Los campos `busy`/`failed` que subsisten en `queryCompare` y `queryRankings` corresponden a otras features y están fuera del scope de `reports_cleanup`.

---

**Veredicto: APROBADO**
