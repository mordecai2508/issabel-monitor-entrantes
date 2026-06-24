# Tasks — `busy_as_unanswered` (Feature #37)

> Seguir en orden. Marcar `[x]` al completar cada tarea.
> El implementer NO debe iniciar T(n+1) sin que T(n) esté completa y sin errores de lint.

---

## Backend — Capa de resolución de disposición

- [x] **T1. `backend/server.js` — `resolveDisposition`**
  Agregar la regla BUSY → NO ANSWER inmediatamente después de inicializar
  `targetKey` (línea ~116), antes de la regla #17 (lostDests):
  ```js
  // #37: BUSY se trata como NO ANSWER
  if (targetKey === 'BUSY') targetKey = 'NO ANSWER';
  ```
  Verificar que el orden de precedencia es:
  1. clave inválida → null
  2. BUSY → NO ANSWER (nuevo)
  3. lostDests → NO ANSWER (#17)
  4. ANSWERED sin agente → NO ANSWER (#21)

- [x] **T2. `backend/server.js` — `queryStats`: inicializar BUSY en 0**
  En el objeto `base` de `queryStats` (línea ~191), mantener la clave `BUSY`
  con `count: 0` para que el payload SSE siga incluyendo el campo (R7).
  No acumular en ella (ya no llegará ninguna fila con targetKey === 'BUSY').

- [x] **T3. `backend/server.js` — `queryChannels`: mantener clave BUSY**
  En la inicialización del objeto `map[ch]` (línea ~258), mantener `BUSY: 0`.
  No requiere otra modificación porque `resolveDisposition` ya no devuelve BUSY.

- [x] **T4. `backend/server.js` — `queryHourly`: mantener clave BUSY**
  En la inicialización de `hours` (línea ~296), mantener `BUSY: 0` en cada hora.
  No requiere otra modificación.

---

## Backend — `cdrService.js`

- [x] **T5. `backend/services/cdrService.js` — `resolveDispositionLocal`**
  Agregar la reclasificación BUSY → NO ANSWER al inicio de la función, después
  de calcular `key` y antes de las comprobaciones de `lostDests` y agente:
  ```js
  if (key === 'BUSY') key = 'NO ANSWER';
  ```
  Verificar que `mapRow` y `mapOutboundRow` usan esta función y por tanto
  devolverán `disposition: 'NO ANSWER'` para filas BUSY.

- [x] **T6. `backend/services/cdrService.js` — filtro por disposición en `buildWhereClause` y `buildOutboundWhereClause`**
  Si el usuario filtra por `disposition='BUSY'`, el WHERE SQL actual usa
  `UPPER(disposition) = UPPER(?)` que devolvería filas reales de la BD.
  Modificar ambas funciones para que cuando `d === 'BUSY'` se sustituya
  internamente por `d === 'NO ANSWER'` antes de construir la condición SQL.
  Esto alinea el filtro con la disposición efectiva.
  Alternativamente (opción más limpia): en el router `inbound.js` y `outbound.js`,
  normalizar el parámetro `disposition` antes de pasarlo al servicio. Elegir
  la opción que mantenga la lógica centralizada; documentar la elección con
  un comentario `// #37`.

---

## Backend — `statsService.js`

- [x] **T7. `backend/services/statsService.js` — `reclassifyCaseExprs`: rama sin lostDests**
  Cambiar:
  ```js
  noAnswerExpr: "SUM(disposition = 'NO ANSWER')",
  ```
  a:
  ```js
  noAnswerExpr: "SUM(disposition = 'NO ANSWER' OR UPPER(disposition) = 'BUSY')",
  ```

- [x] **T8. `backend/services/statsService.js` — `reclassifyCaseExprs`: rama con lostDests**
  Añadir al inicio del `noAnswerExpr` (antes del bloque `WHEN dst IN`):
  ```sql
  WHEN UPPER(disposition) = 'BUSY' THEN 1
  ```
  El resultado completo de `noAnswerExpr` para la rama con lostDests debe ser:
  ```sql
  SUM(CASE
    WHEN UPPER(disposition) = 'BUSY' THEN 1
    WHEN dst IN (${lp}) THEN 1
    WHEN UPPER(disposition) = 'ANSWERED' AND (dstchannel IS NULL OR dstchannel = '' OR dstchannel NOT REGEXP ?) THEN 1
    WHEN UPPER(disposition) = 'NO ANSWER' THEN 1
    ELSE 0
  END)
  ```
  Verificar que `answeredExpr` ya cubre BUSY con `ELSE 0` (no se acumula en answered).

- [x] **T9. `backend/services/statsService.js` — `queryHistorical`, `queryCompare`, `queryRankings`**
  Los campos `busy` en los objetos de respuesta pueden quedarse en la respuesta
  con valor 0 (compatibilidad). No eliminarlos.

---

## Backend — `reportService.js`

- [x] **T10. `backend/services/reportService.js` — `summarizeByDisposition`**
  Agregar normalización defensiva en el loop:
  ```js
  const d = (row.disposition || '').toUpperCase();
  const effectiveD = d === 'BUSY' ? 'NO ANSWER' : d;
  if (DISPOSITIONS.includes(effectiveD)) summary[effectiveD] += 1;
  ```
  Mantener `'BUSY'` en el array `DISPOSITIONS` (para no romper estructura del
  objeto summary), pero su contador quedará siempre en 0.

---

## Tests backend

- [x] **T11. `backend/tests/busyAsUnanswered.test.js` — crear archivo**
  Crear suite de tests con Jest + mocks de MySQL. No hacer requests reales a BD.

- [x] **T12. Tests de `resolveDisposition` (R1)**
  ```js
  it('R1 - BUSY se reclasifica a NO ANSWER en resolveDisposition', () => { ... });
  it('R1 - busy (minúsculas) se reclasifica a NO ANSWER', () => { ... });
  it('R1 - BUSY en lostDest sigue siendo NO ANSWER (no double-count)', () => { ... });
  ```

- [x] **T13. Tests de `resolveDispositionLocal` (R4)**
  ```js
  it('R4 - mapRow devuelve disposition NO ANSWER para fila BUSY', () => { ... });
  it('R4 - mapOutboundRow devuelve disposition NO ANSWER para fila BUSY', () => { ... });
  ```

- [x] **T14. Tests de `reclassifyCaseExprs` (R3)**
  ```js
  it('R3 - noAnswerExpr sin lostDests incluye BUSY', () => { ... });
  it('R3 - noAnswerExpr con lostDests incluye WHEN BUSY THEN 1', () => { ... });
  ```

- [x] **T15. Tests de `summarizeByDisposition` (R5)**
  ```js
  it('R5 - BUSY se suma a NO ANSWER en summarizeByDisposition', () => { ... });
  it('R5 - bucket BUSY queda en 0 cuando solo hay filas BUSY', () => { ... });
  ```

- [x] **T16. Test de identidad aritmética (R6)**
  ```js
  it('R6 - total === answered + no_answer + failed cuando hay filas BUSY', () => { ... });
  ```

- [x] **T17. Test de payload SSE (R7)**
  ```js
  it('R7 - el payload incluye dispositions.BUSY con valor 0', () => { ... });
  ```

---

## Frontend

- [x] **T18. `frontend/src/components/InboundTable.jsx` — eliminar opción BUSY del filtro**
  Eliminar `{ value: 'BUSY', label: 'Ocupado' }` del array de opciones de
  disposición. El filtro pasa de 4 opciones a 3: ANSWERED, NO ANSWER, FAILED.

- [x] **T19. `frontend/src/components/OutboundTable.jsx` — eliminar opción BUSY del filtro**
  Mismo cambio que T18 para la tabla de salientes.

- [x] **T20. `frontend/src/components/HistoricalAnalytics.jsx` — revisar uso de `busy`**
  Revisar si el componente renderiza una barra/columna explícita para `busy` en
  el gráfico. Si existe, eliminar esa serie del BarChart (el valor será 0 pero
  la leyenda confunde). Si solo usa el valor numérico de forma implícita (Recharts
  lo omite al ser 0), no se requiere cambio.
  Acción tomada: eliminado `{ key: 'busy', label: 'Ocupado' }` de `KPI_LABELS` en
  `CompareSection` para evitar mostrar una fila siempre en 0 en la tabla comparativa.

---

## Verificación final

- [x] **T21. Verificación integral**
  - `npx jest tests/busyAsUnanswered.test.js` → 22 tests pasados.
  - Tests relacionados (reclassification_consistency, dashboard_lost_destinations,
    disposition_agent_answered_fix, dashboard_unanswered_breakdown, stats, inbound,
    outbound) → 133 tests pasados, sin regresiones.
  - Los 3 test suites fallidos (alerts, config, reports) son pre-existentes y no
    relacionados con esta feature (errores de infraestructura: AMI mock, DB connection,
    HTTP parser).
  - `npm run build` no ejecutado (sin DB de prueba disponible).
  - El campo `dispositions.BUSY` permanece en los payloads con `count: 0` (R7 cumplido).
