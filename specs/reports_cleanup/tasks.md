# Tasks — reports_cleanup (#52)

---

## T1 — `backend/services/statsService.js`: `queryHistorical`

- [x] En la rama `period === 'custom'`, cambiar la query SQL:
  - `COUNT(*) AS total` → `SUM(CASE WHEN UPPER(disposition) != 'FAILED' THEN 1 ELSE 0 END) AS total`
  - `ROUND(AVG(duration), 2) AS avg_duration` → `ROUND(AVG(billsec) / 60, 1) AS avg_duration`
  - Eliminar `SUM(disposition = 'BUSY') AS busy,`
  - Eliminar `SUM(disposition = 'FAILED') AS failed,`

- [x] En la rama `else` (periódica), aplicar los mismos 4 cambios.

- [x] En la serialización de puntos (ambas ramas), eliminar los campos `busy` y `failed`
  del objeto retornado, y cambiar `.toFixed(2)` a `.toFixed(1)` en `avg_duration`.

---

## T2 — `backend/services/reportService.js`: `summarizeByDisposition` y `collectReportData`

- [x] En `summarizeByDisposition`:
  - Cambiar `const summary = { total: rows.length, ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0 };`
    a `const summary = { total: 0, ANSWERED: 0, 'NO ANSWER': 0 };`
  - En el bucle, excluir filas FAILED con `if (d === 'FAILED') continue;` antes de la
    reclasificación.
  - Incrementar `summary.total` dentro del bucle (solo para filas no-FAILED).
  - Mantener `const effectiveD = d === 'BUSY' ? 'NO ANSWER' : d;` para BUSY→NO ANSWER.
  - Eliminar el bloque `if (DISPOSITIONS.includes(effectiveD)) { summary[effectiveD] += 1; }`
    y reemplazar por `if (effectiveD === 'ANSWERED' || effectiveD === 'NO ANSWER') summary[effectiveD] += 1;`

- [x] En `collectReportData`, tipo `'executive'`:
  - Cambiar `const opts = { lostDests, configuredTrunks };`
    a `const opts = { lostDests, configuredTrunks, configuredChannels: configuredTrunks };`

- [x] Eliminar la constante `DISPOSITIONS` al inicio del archivo (ya no se usa).

---

## T3 — `backend/services/exportService.js`: constantes y headers

- [x] `RANKING_HEADERS_TRUNK`: eliminar `'Ocupado'`, `'Fallidas'`; cambiar `'Dur. media (s)'`
  a `'Dur. media (min)'`. Resultado: `['Nombre', 'Total', 'Contestadas', 'No contestadas', 'Dur. media (min)']`

- [x] `RANKING_HEADERS_EXTENSIONS`: eliminar `'Contestadas'` (duplicado), `'No contestadas'`,
  `'Ocupado'`, `'Fallidas'`. Cambiar `'Dur. media (min)'` queda igual.
  Resultado: `['Nombre', 'Llamadas contestadas', 'Dur. media (min)']`

- [x] `RANKING_ROW_KEYS`: eliminar `'busy'` y `'failed'`.
  Resultado: `['name', 'total', 'answered', 'no_answer', 'avg_duration']`
  (Para extensiones, 'total' y 'no_answer' se ignoran visualmente con el encabezado, pero la clave
  no causa problema si hay columnas de menos que keys; o bien mantener alineado con los headers.)

  > Nota: dado que extensions y trunks usan headers distintos, los RANKING_ROW_KEYS deben alinearse
  > con el encabezado más largo (trunks). Para extensiones el renderer usa los primeros N keys = columnas.
  > Simplificar a: `['name', 'answered', 'avg_duration']` para extensiones y `['name', 'total', 'answered', 'no_answer', 'avg_duration']` para trunks.
  > Implementar como dos constantes separadas: `RANKING_ROW_KEYS_TRUNK` y `RANKING_ROW_KEYS_EXTENSIONS`.

- [x] `DISPOSITION_LABELS`: eliminar entradas `BUSY` y `FAILED`.
  Resultado: `{ ANSWERED: 'Contestadas', 'NO ANSWER': 'No contestadas' }`

- [x] `DISPOSITIONS_ORDER`: eliminar `'BUSY'` y `'FAILED'`.
  Resultado: `['ANSWERED', 'NO ANSWER']`

---

## T4 — `backend/services/exportService.js`: `renderExecutiveBody`

- [x] En el bloque de texto de resumen general, eliminar las líneas:
  ```js
  doc.text(`Ocupado: ${overallTotals.busy}`);
  doc.text(`Fallidas: ${overallTotals.failed}`);
  ```
  y cambiar `Duración media (s):` a `Duración media (min):`.

- [x] En el bloque de texto de Entrantes, eliminar `| Ocupado: ${inboundTotals.BUSY} | Fallidas: ${inboundTotals.FAILED}`.

- [x] En el bloque de texto de Salientes, ídem.

- [x] En el chart de distribución, cambiar:
  ```js
  labels: ['Contestadas', 'No Contestadas', 'Ocupado', 'Fallidas'],
  values: [overallTotals.answered, overallTotals.no_answer, overallTotals.busy, overallTotals.failed],
  ```
  por:
  ```js
  labels: ['Contestadas', 'No Contestadas'],
  values: [overallTotals.answered, overallTotals.no_answer],
  ```

---

## T5 — `backend/services/exportService.js`: `buildExecutiveSummaryRows`

- [x] Eliminar las filas de 'Ocupado' y 'Fallidas'.
- [x] Cambiar `{ metric: 'Duración media (s)', ... }` a `{ metric: 'Duración media (min)', ... }`.
- [x] Eliminar los campos `inbound: inboundTotals.BUSY`, `outbound: outboundTotals.BUSY`, etc.

---

## T6 — `backend/services/exportService.js`: XLSX Tendencia y Rankings

- [x] Hoja Tendencia XLSX: cambiar headers de:
  ```js
  ['Fecha', 'Total', 'Contestadas', 'No contestadas', 'Ocupado', 'Fallidas', 'Dur. media (s)']
  ```
  a:
  ```js
  ['Fecha', 'Total', 'Contestadas', 'No contestadas', 'Dur. media (min)']
  ```
  y los rowKeys de `['period_label', 'total', 'answered', 'no_answer', 'busy', 'failed', 'avg_duration']`
  a `['period_label', 'total', 'answered', 'no_answer', 'avg_duration']`.

- [x] En los `writeXlsxTable` de ranking extensions y trunks, usar
  `RANKING_ROW_KEYS_EXTENSIONS` y `RANKING_ROW_KEYS_TRUNK` respectivamente
  en vez de `RANKING_ROW_KEYS`.

---

## T7 — Build

- [x] Ejecutar `npm run build` desde la raíz y confirmar 0 errores.

---

## T8 — Trazabilidad

- R1, R2 → T2 (summarizeByDisposition excluyendo FAILED)
- R3, R6 → T1 (queryHistorical sin busy/failed, sin FAILED en total)
- R4, R7 → T3, T4, T5, T6 (exportService sin BUSY/FAILED)
- R5 → T2 (BUSY→NO ANSWER en summarizeByDisposition, ya implementado)
- R8 → T2 (configuredChannels en opts)
- R9, R10 → sin cambios (ya correcto)
- R11 → T1 (billsec/60 en queryHistorical)
- R12 → T4, T5, T6 (etiquetas min)
- R13 → sin cambios
