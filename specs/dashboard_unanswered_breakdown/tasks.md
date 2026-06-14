# tasks.md — dashboard_unanswered_breakdown

> Checklist ordenado y ejecutable para el `implementer`. Cada `R<n>` referenciado
> debe aparecer literalmente en el nombre del `it()` del test correspondiente
> (ver `docs/specs.md` — trazabilidad obligatoria).

- [x] T1. **Crear la función pura `classifyUnansweredReason(row, lostDests)`
  en `backend/server.js`**, inmediatamente después de `resolveDisposition`
  (sección 3.2 de `design.md`). Implementa el orden de evaluación
  `ivr_hangup` → `queue_no_agent` → `no_answer` reutilizando
  `AGENT_DSTCHANNEL_RE` ya existente. No modifica `resolveDisposition` ni su
  firma (R1, R4-R7, Decisión A).

- [x] T2. **Actualizar `queryStats` (`backend/server.js`)**:
  - Añadir el campo `breakdown: { no_answer: 0, ivr_hangup: 0, queue_no_agent: 0 }`
    a la inicialización de `base['NO ANSWER']` (R8, R9).
  - Dentro del bucle principal, cuando `targetKey === 'NO ANSWER'`, llamar
    `classifyUnansweredReason(r, lostDests)` e incrementar
    `base['NO ANSWER'].breakdown[reason] += Number(r.count)` (R8, R3).
  - No modificar el `SELECT`/`GROUP BY` (sin cambios, ya tiene `dst`/`dstchannel`
    desde #17/#21) ni la firma de la función (R21).
  - No modificar el cálculo de `avg_billsec` ni `pct` (R9, R10).

- [x] T3. **No modificar `queryChannels`, `queryHourly`, `queryQueues`,
  `resolveDisposition`** (R11, Decisión A/C de `design.md`): verificar
  explícitamente que ninguna de estas funciones cambia de firma, cuerpo, o
  forma de retorno.

- [x] T4. **Tests backend — `backend/tests/dashboard_unanswered_breakdown.test.js`**
  (nuevo archivo, siguiendo el patrón de "copia local" usado en
  `disposition_agent_answered_fix.test.js` / `dashboard_lost_destinations.test.js`:
  define copias locales de `extractChannel`, `passesFilter`,
  `AGENT_DSTCHANNEL_RE`, `resolveDisposition`, `classifyUnansweredReason` y
  `queryStats` idénticas a las de `server.js`, y mockea `pool.query`):
  - `it('R4 - disposition=NO ANSWER con dst fuera de lostDestinations clasifica como no_answer')`
  - `it('R5 - dst en lostDestinations con disposition original ANSWERED clasifica como ivr_hangup')`
  - `it('R5 - dst en lostDestinations con disposition original ya NO ANSWER clasifica como ivr_hangup, no como no_answer (sin doble conteo)')`
  - `it('R6 - disposition=ANSWERED, dst fuera de lostDestinations, dstchannel sin coincidir con AGENT_DSTCHANNEL_RE clasifica como queue_no_agent')`
  - `it('R3 - la suma breakdown.no_answer + breakdown.ivr_hangup + breakdown.queue_no_agent es igual a dispositions["NO ANSWER"].count para un dataset mixto')`
  - `it('R2 - registros con disposition ANSWERED/BUSY/FAILED (sin reclasificar a NO ANSWER) no contribuyen al breakdown')`
  - `it('R9 - dispositions["NO ANSWER"].count, total_duration, total_billsec, avg_billsec y pct no cambian respecto al cálculo de #21; breakdown es additivo')`
  - `it('R10 - total = ANSWERED + NO ANSWER + BUSY + FAILED sigue cumpliéndose tras añadir breakdown')`

- [x] T5. **Tests backend — regresión de endpoints existentes**: añadir casos
  en `backend/tests/stats.test.js` (o archivo equivalente usado por #21 para
  estos endpoints):
  - `it('R12 - GET /api/calls/today incluye dispositions["NO ANSWER"].breakdown con las 3 claves no_answer/ivr_hangup/queue_no_agent')`
  - `it('R13 - GET /api/calls/range incluye breakdown en dispositions["NO ANSWER"] para total/inbound/outbound')`
  - `it('R14 - SSE init/update incluyen breakdown en stats.dispositions["NO ANSWER"]')` (verificación manual si no hay cobertura SSE existente, anotarlo en T8)
  - `it('R22 - ningún otro campo de la respuesta de /api/calls/today cambia de forma respecto a #21')`

- [x] T6. **Frontend — `frontend/src/components/Dashboard.jsx`**:
  - Añadir el componente local `UnansweredBreakdownCard` (sección 5.1 de
    `design.md`), con el array `UNANSWERED_REASONS` (labels en español: "Sin
    respuesta", "Colgó en IVR", "Cola sin agente") y el mapa
    `REASON_COLOR_CLASS` para evitar interpolación de clases Tailwind
    dinámicas (R16, R17).
  - Leer `noAnswerBreakdown = disp?.['NO ANSWER']?.breakdown` (R19) junto a las
    constantes existentes (~línea 107-122).
  - Renderizar `<UnansweredBreakdownCard breakdown={noAnswerBreakdown}
    noAnswerTotal={noAnswer} />` en una nueva fila de grid, dentro del bloque
    `{data && ( ... )}` existente, inmediatamente después del grid de las 3
    StatCards principales (R16, R18).
  - Manejar `breakdown` ausente/`undefined` con default `{ no_answer: 0,
    ivr_hangup: 0, queue_no_agent: 0 }` (R19) y porcentaje `0` cuando
    `noAnswerTotal === 0` (R17).

- [x] T7. **No introducir dependencias nuevas** (R23): verificar que no se
  añade ninguna entrada a `package.json` (backend ni frontend) y que no se
  importa ninguna librería de gráficos distinta de Recharts (que de hecho no
  se usa en esta feature según Decisión B, salvo que el reviewer pida la
  alternativa con gráfico).

- [x] T8. **Ejecutar `cd backend && npm test`**: toda la suite debe quedar en
  verde, incluyendo T4 y T5. Verificar que los archivos de #17/#21
  (`dashboard_lost_destinations.test.js`,
  `disposition_agent_answered_fix.test.js`) siguen pasando sin necesidad de
  actualizar sus copias locales de `queryStats` (la nueva lógica de
  `breakdown` es additiva y no afecta `count`/`total_duration`/
  `total_billsec`/`avg_billsec`/`pct` que esos tests verifican).

- [x] T9. **Verificación manual** (`cd frontend && npm run build` sin errores +
  `./init.sh` verde): con datos reales o de prueba que incluyan al menos un
  registro de cada subcategoría (`no_answer`, `ivr_hangup`, `queue_no_agent`),
  comprobar en el Dashboard que:
  - la nueva sección "Detalle de Perdidas" aparece junto a la tarjeta
    "Perdidas" (R16),
  - los 3 conteos y porcentajes mostrados suman exactamente el valor de la
    tarjeta "Perdidas" (R3, R17),
  - si `dispositions['NO ANSWER'].count === 0` (día sin llamadas perdidas), la
    sección se muestra con los 3 valores en `0` sin error (R17, R19),
  - si no hay acceso al SSE en el entorno de verificación, documentar R14 como
    pendiente de verificación manual en producción (igual que T11 de #21).
