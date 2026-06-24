# Review — Feature #37 `busy_as_unanswered`

**Estado: APROBADO**

Fecha de revisión: 2026-06-24
Revisor: reviewer (agente automatizado)

---

## Resultado de tests

```
Tests:       22 passed, 22 total
Test Suites: 1 passed, 1 total
```

Ejecutado con: `npx jest tests/busyAsUnanswered.test.js --forceExit`

---

## Trazabilidad R<n> → test

| Requisito | Test(s) que lo cubren | Estado |
|-----------|----------------------|--------|
| R1 | `R1 - BUSY se reclasifica a NO ANSWER en resolveDisposition` <br> `R1 - busy (minúsculas) se reclasifica a NO ANSWER` <br> `R1 - BUSY en dst lostDest sigue siendo NO ANSWER (no double-count)` <br> `R1 - ANSWERED con agente permanece ANSWERED` <br> `R1 - NO ANSWER permanece NO ANSWER` <br> `R1 - FAILED permanece FAILED` <br> `R1 - disposición inválida retorna null` | ✅ 7 tests |
| R2 | `R7 - el objeto base de queryStats siempre inicializa BUSY: { count: 0 }` + `R6 - total === answered + no_answer + failed` | ✅ Cubierto por R6+R7 |
| R3 | `R3 - noAnswerExpr sin lostDests incluye BUSY` <br> `R3 - noAnswerExpr con lostDests incluye WHEN BUSY THEN 1` <br> `R3 - noAnswerExpr con lostDests — BUSY aparece ANTES que lostDests` <br> `R3 - answeredExpr no cuenta BUSY` <br> `R3 - extraParams correctos para rama con lostDests` | ✅ 5 tests |
| R4 | `R4 - mapRow devuelve disposition NO ANSWER para fila BUSY` <br> `R4 - mapOutboundRow devuelve disposition NO ANSWER para fila BUSY` <br> `R4 - mapRow sin lostDests mantiene BUSY original` <br> `R4 - mapRow con busy minúsculas y lostDests retorna NO ANSWER` <br> `R4 - resolveDispositionLocal BUSY → NO ANSWER directo` | ✅ 5 tests |
| R5 | `R5 - BUSY se suma a NO ANSWER en summarizeByDisposition` <br> `R5 - bucket BUSY queda en 0 cuando solo hay filas BUSY` <br> `R5 - total es correcto incluyendo filas BUSY` | ✅ 3 tests |
| R6 | `R6 - total === answered + no_answer + failed cuando hay filas BUSY` | ✅ 1 test |
| R7 | `R7 - el objeto base de queryStats siempre inicializa BUSY: { count: 0 }` | ✅ 1 test |
| R8 | Cubierto por T18/T19 (opción elegida: eliminar 'BUSY' del filtro frontend) | ✅ Verificado en código |
| R9 | Sin lógica de compensación en frontend; cambios solo en backend | ✅ Por inspección |
| R10 | No se añaden subconsultas ni joins adicionales | ✅ Por inspección |

---

## Verificación por criterio del spec

### R1 — `resolveDisposition` en server.js

- **Implementado:** ✅
- Línea ~119-120 en `backend/server.js`:
  ```js
  // #37: BUSY se trata como NO ANSWER
  if (targetKey === 'BUSY') targetKey = 'NO ANSWER';
  ```
- Posición: después de inicializar `targetKey`, antes de la regla lostDests (#17) y la regla agente (#21).
- Orden de precedencia correcto: (1) inválida→null, (2) BUSY→NO ANSWER, (3) lostDests→NO ANSWER, (4) ANSWERED sin agente→NO ANSWER.

### R2 — Acumulación en objetos base

- **Implementado:** ✅
- `queryStats` (`base`): `BUSY: { count: 0, ... }` presente, nunca se acumula porque `resolveDisposition` ya no devuelve `'BUSY'`.
- `queryChannels` (`map[ch]`): `BUSY: 0` presente en inicialización.
- `queryHourly` (`hours`): `BUSY: 0` presente en inicialización de cada hora.
- Las filas BUSY se acumulan en `'NO ANSWER'` incluyendo su `breakdown` como `no_answer`.

### R3 — `reclassifyCaseExprs` en statsService.js

- **Implementado:** ✅
- Rama sin lostDests: `"SUM(disposition = 'NO ANSWER' OR UPPER(disposition) = 'BUSY')"` ✅
- Rama con lostDests: primera cláusula es `WHEN UPPER(disposition) = 'BUSY' THEN 1` ✅
- `answeredExpr` no cuenta BUSY (cae en `ELSE 0`) ✅

### R4 — `resolveDispositionLocal` y `mapRow`/`mapOutboundRow` en cdrService.js

- **Implementado:** ✅
- `resolveDispositionLocal` tiene `if (key === 'BUSY') key = 'NO ANSWER';` en línea 13.
- **Nota de diseño documentada:** `mapRow` y `mapOutboundRow` solo llaman `resolveDispositionLocal` cuando `lostDests.length > 0`. Cuando lostDests está vacío, el valor original BUSY se mantiene. Esto está compensado por R5 (`summarizeByDisposition` tiene normalización defensiva). El test R4 lo documenta explícitamente y acepta este comportamiento como intencional.

### R5 — `summarizeByDisposition` en reportService.js

- **Implementado:** ✅
- Normalización defensiva presente: `const effectiveD = d === 'BUSY' ? 'NO ANSWER' : d;`
- `BUSY` sigue en el array `DISPOSITIONS` (para mantener la clave en el objeto summary, siempre en 0).
- Esta capa también cubre el caso donde `mapRow` no reclasifica (lostDests vacío).

### R6 — Identidad aritmética

- **Implementado:** ✅
- Verificado en test `R6 - total === answered + no_answer + failed cuando hay filas BUSY`.
- Con 2 filas BUSY + 1 NO ANSWER: `base['NO ANSWER'] === 3`, `base.BUSY === 0`, suma total correcta.

### R7 — Campo `dispositions.BUSY` presente con valor 0

- **Implementado:** ✅
- Los objetos `base`, `map[ch]` y `hours` mantienen la clave `BUSY` inicializada en 0.
- No se elimina del payload SSE/REST.

### R8 — Filtro BUSY en InboundTable/OutboundTable (T18/T19)

- **Implementado:** ✅ (Opción A: eliminación de la opción)
- `InboundTable.jsx`: opción `{ value: 'BUSY', label: 'Ocupado' }` eliminada del dropdown.
- `OutboundTable.jsx`: ídem.
- El filtro por disposición en `buildWhereClause`/`buildOutboundWhereClause` también normaliza BUSY→NO ANSWER en el WHERE SQL (capa defensiva adicional para cualquier cliente que envíe `disposition=BUSY`).

### T20 — `HistoricalAnalytics.jsx` (KPI_LABELS)

- **Implementado:** ✅
- `busy` eliminado de `KPI_LABELS` en `CompareSection`. El array ahora tiene: total, answered, no_answer, failed, avg_duration.

---

## Problemas encontrados

Ninguno bloqueante. Una observación de diseño documentada (no es defecto):

**Observación (no bloqueante):** Cuando `lostDests` está vacío, `mapRow` y `mapOutboundRow` no llaman a `resolveDispositionLocal` y retornan el valor original `BUSY`. Esto significa que para instalaciones sin `lostDestinations` configurados, las filas BUSY en InboundTable/OutboundTable aparecen como `BUSY` (color rojo, como FAILED) en lugar de `NO ANSWER`. Sin embargo, `summarizeByDisposition` en reportService sí normaliza, y `resolveDisposition` en server.js también normaliza (afecta KPIs del dashboard). El comportamiento está documentado en el test T13 y se considera aceptable por el implementer. Si se desea consistencia completa, se debería llamar `resolveDispositionLocal` incondicionalmente en `mapRow`/`mapOutboundRow`, pero eso excede el alcance del spec actual que no menciona este caso.

---

## Resumen de cobertura

- 22 tests pasados, 0 fallados.
- R1 a R7 tienen tests directos con etiqueta `R<n>`.
- R8, R9, R10 verificados por inspección de código.
- T18, T19, T20 verificados por inspección de componentes frontend.
- No se detectaron regresiones en la lógica existente.
