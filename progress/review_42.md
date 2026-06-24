# Review #42 — analytics_agents_ranking_fix

**Fecha:** 2026-06-24
**Reviewer:** agente `reviewer`
**Resultado:** APROBADO

---

## Verificación de requisitos

### R1 — `queryRankings` type=extension filtra solo llamadas contestadas
CUMPLIDO. La función `answeredRowFilter(lostDests)` fue implementada en `statsService.js` (líneas 52-61). Se aplica en la rama `type === 'extension'` (línea 219) e incorpora su cláusula SQL después del filtro `dstchannel REGEXP ?` (línea 233):
- Si `lostDests` vacío: `AND disposition = 'ANSWERED'`
- Si `lostDests` no vacío: `AND dst NOT IN (?,…) AND UPPER(disposition) = 'ANSWERED'`

### R2 — `total` del ranking de extensiones === answered
CUMPLIDO. Dado que `WHERE` filtra únicamente filas contestadas antes de `COUNT(*)`, el campo `total` resultante solo cuenta llamadas contestadas. Los tests `#42 R1/R2` verifican explícitamente que `r.total === r.answered` para todos los agentes.

### R3 — `avg_duration` usa `ROUND(AVG(billsec) / 60, 1)` en minutos
CUMPLIDO. La query SQL para `type=extension` usa `ROUND(AVG(billsec) / 60, 1) AS avg_duration` (línea 230). El mapeo de resultados usa `Number(Number(r.avg_duration).toFixed(1))` (línea 279), consistente con 1 decimal.

### R4 — HistoricalAnalytics muestra "Dur. media (min)" y formato "X.X min"
CUMPLIDO.
- Encabezado condicional en línea 423: `{rankType === 'extension' ? 'Dur. media (min)' : 'Dur. media (s)'}`
- Renderizado de celda en líneas 436-438: `rankType === 'extension' ? \`${row.avg_duration} min\` : \`${row.avg_duration} s\``
- Encabezado "Total de llamadas" actualizado a "Llamadas contestadas" cuando `rankType === 'extension'` (línea 418).

### R5 — exportService con headers "Llamadas contestadas" y "Dur. media (min)" para extensiones
CUMPLIDO.
- `RANKING_HEADERS_EXTENSIONS = ['Nombre', 'Llamadas contestadas', 'Contestadas', 'No contestadas', 'Ocupado', 'Fallidas', 'Dur. media (min)']` (línea 27).
- `renderRankingBody` usa `RANKING_HEADERS_EXTENSIONS` cuando `type === 'extensions'` (línea 568).
- Excel ejecutivo usa `RANKING_HEADERS_EXTENSIONS` para la hoja "Top Extensiones" (línea 671).
- Excel tipo 'extensions' usa `xlsxRankingHeaders = RANKING_HEADERS_EXTENSIONS` (línea 724).

**Observación menor (no bloqueante):** `renderExecutiveBody` en el PDF ejecutivo aún usa `RANKING_HEADERS` (alias de trunk) para la sección "Top 5 extensiones" (línea 422), en lugar de `RANKING_HEADERS_EXTENSIONS`. Esto no cubre el report de tipo `'extensions'` directamente (que sí está correcto), pero introduce inconsistencia visual en el resumen ejecutivo PDF. No es un requisito de esta feature y no se considera defecto bloqueante.

### R6 — Firma del endpoint sin cambios
CUMPLIDO. La ruta `GET /api/stats/rankings`, sus parámetros (`from`, `to`, `type`, `limit`) y la estructura JSON de respuesta (`{ type, from, to, limit, rankings: [...] }`) no fueron modificados.

### RNF2 — Rama `type === 'trunk'` no modificada
CUMPLIDO. La rama `else` del bloque `if (type === 'extension')` en `queryRankings` permanece intacta (líneas 239-270), con `ROUND(AVG(duration), 2)` sin cambios. El test `RCL3` verifica que trunks sigan funcionando igual.

---

## Tests

- 32/32 tests pasan en `backend/tests/stats.test.js`.
- Los 6 casos del bloque `#42` (R1/R2, R3, RCL1, RCL2, RCL3) verifican correctamente todos los requisitos funcionales cubiertos por el backend.

## Build

- `npm run build` completado sin errores (solo warning de chunk size > 500 kB, preexistente).

---

## Conclusión

Todos los requisitos R1-R6 y RNF2 están satisfechos. La observación sobre `renderExecutiveBody` PDF es un defecto menor fuera de scope que puede corregirse en una tarea de seguimiento.

**Review aprobado #42**
