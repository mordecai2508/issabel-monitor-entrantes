# Informe de implementación — dashboard_unanswered_breakdown (feature #22)

## Resumen

Se añadió un desglose por motivo (`no_answer` / `ivr_hangup` / `queue_no_agent`)
dentro de `dispositions['NO ANSWER']`, calculado por `queryStats` mediante la
nueva función pura hermana `classifyUnansweredReason(row, lostDests)` (junto a
`resolveDisposition`, #17/#21). El cálculo es 100% en memoria sobre las mismas
filas que `queryStats` ya recibe (sin cambios de SQL). En el frontend se añadió
el componente local `UnansweredBreakdownCard` en `Dashboard.jsx`, mostrando los
3 conteos y porcentajes junto a la tarjeta "Perdidas".

## Archivos modificados

- `backend/server.js`:
  - Nueva función pura `classifyUnansweredReason(row, lostDests)`, inmediatamente
    después de `resolveDisposition` (~línea 127). Implementa el orden de
    evaluación `ivr_hangup` → `queue_no_agent` → `no_answer` (R1, R4-R7),
    reutilizando `AGENT_DSTCHANNEL_RE`. No modifica `resolveDisposition` ni su
    firma (Decisión A).
  - `queryStats` (~líneas 151-178):
    - `base['NO ANSWER']` gana el campo
      `breakdown: { no_answer: 0, ivr_hangup: 0, queue_no_agent: 0 }` (R8, R9).
    - Dentro del bucle, cuando `targetKey === 'NO ANSWER'`, se llama
      `classifyUnansweredReason(r, lostDests)` y se incrementa
      `base['NO ANSWER'].breakdown[reason] += Number(r.count)` (R8, R3).
    - `SELECT`/`GROUP BY`, `avg_billsec`, `pct`, firma de la función: sin cambios
      (R9, R10, R21).
  - `queryChannels`, `queryHourly`, `queryQueues`, `resolveDisposition`: sin
    cambios (R11, T3 verificado por inspección).

- `frontend/src/components/Dashboard.jsx`:
  - Nuevo componente local `UnansweredBreakdownCard` + constantes
    `UNANSWERED_REASONS` (labels en español: "Sin respuesta", "Colgó en IVR",
    "Cola sin agente") y `REASON_COLOR_CLASS` (mapa estático para evitar clases
    Tailwind interpoladas — `text-amber-400` / `text-slate-400` / `text-red-400`,
    ya presentes en el proyecto).
  - Nueva constante `noAnswerBreakdown = disp?.['NO ANSWER']?.breakdown` (R19)
    junto a las constantes existentes (~línea 123).
  - Nueva fila de grid `<UnansweredBreakdownCard breakdown={noAnswerBreakdown}
    noAnswerTotal={noAnswer} />` justo después del grid de las 3 StatCards
    principales (Total/Contestadas/Perdidas), dentro del bloque `{data && (...)}`
    (R16, R18).

## Archivos creados

- `backend/tests/dashboard_unanswered_breakdown.test.js` — copia local (mirror)
  de `extractChannel`, `passesFilter`, `AGENT_DSTCHANNEL_RE`, `resolveDisposition`,
  `classifyUnansweredReason` y `queryStats` post-#22, con 13 tests cubriendo
  R1-R10, R12-R15, R22.

## Trazabilidad R<n> → test → archivo:línea

| Req | Test | Archivo |
|---|---|---|
| R1/R4 | `R4 - disposition=NO ANSWER con dst fuera de lostDestinations clasifica como no_answer` | `backend/tests/dashboard_unanswered_breakdown.test.js` |
| R1/R5 | `R5 - dst en lostDestinations con disposition original ANSWERED clasifica como ivr_hangup` | `backend/tests/dashboard_unanswered_breakdown.test.js` |
| R1/R5 | `R5 - dst en lostDestinations con disposition original ya NO ANSWER clasifica como ivr_hangup, no como no_answer (sin doble conteo)` | `backend/tests/dashboard_unanswered_breakdown.test.js` |
| R1/R6 | `R6 - disposition=ANSWERED, dst fuera de lostDestinations, dstchannel sin coincidir con AGENT_DSTCHANNEL_RE clasifica como queue_no_agent` | `backend/tests/dashboard_unanswered_breakdown.test.js` |
| R3/R7 | `R3 - la suma breakdown.no_answer + breakdown.ivr_hangup + breakdown.queue_no_agent es igual a dispositions["NO ANSWER"].count para un dataset mixto` | `backend/tests/dashboard_unanswered_breakdown.test.js` |
| R2 | `R2 - registros con disposition ANSWERED/BUSY/FAILED (sin reclasificar a NO ANSWER) no contribuyen al breakdown` | `backend/tests/dashboard_unanswered_breakdown.test.js` |
| R8/R9/R10 | `R9 - dispositions["NO ANSWER"].count, total_duration, total_billsec, avg_billsec y pct no cambian respecto al cálculo de #21; breakdown es additivo` | `backend/tests/dashboard_unanswered_breakdown.test.js` |
| R10 | `R10 - total = ANSWERED + NO ANSWER + BUSY + FAILED sigue cumpliéndose tras añadir breakdown` | `backend/tests/dashboard_unanswered_breakdown.test.js` |
| R12/R13 | `R12/R13 - GET /api/calls/today y /api/calls/range: dispositions["NO ANSWER"] incluye breakdown con las 3 claves no_answer/ivr_hangup/queue_no_agent` | `backend/tests/dashboard_unanswered_breakdown.test.js` |
| R13 | `R13 - breakdown está presente en las 3 invocaciones de queryStats usadas por fetchData() (total/inbound/outbound)` | `backend/tests/dashboard_unanswered_breakdown.test.js` |
| R14 | `R14 - SSE init/update: stats.dispositions["NO ANSWER"] incluye breakdown (mismo fetchData() que /api/calls/today)` | `backend/tests/dashboard_unanswered_breakdown.test.js` |
| R22 | `R22 - dispositions["NO ANSWER"] conserva count/total_duration/total_billsec/avg_billsec/pct además del nuevo breakdown; otros buckets sin breakdown` | `backend/tests/dashboard_unanswered_breakdown.test.js` |
| R22 | `R22 - top-level keys de fetchData() no cambian respecto a #21` | `backend/tests/dashboard_unanswered_breakdown.test.js` |
| R16/R17/R19/R20 | `UnansweredBreakdownCard` (sin test unitario frontend — Vitest no configurado en este proyecto, ver CLAUDE.md) | `frontend/src/components/Dashboard.jsx` |

## Resultado de verificación

```
cd backend && npx jest
Test Suites: 13 passed, 13 total
Tests:       331 passed, 331 total
```

```
cd frontend && npm run build
✓ 2320 modules transformed, built in ~11s, sin errores
```

```
./init.sh
✅ Todo verde: 25/25 checks pasaron
```

## No-regresión

- `disposition_agent_answered_fix.test.js` y `dashboard_lost_destinations.test.js`:
  siguen pasando sin modificación (sus copias locales de `queryStats` no incluyen
  `breakdown`, y la nueva lógica es additiva — no afecta `count`/`total_duration`/
  `total_billsec`/`avg_billsec`/`pct`).
- `GET /api/calls/today`, `GET /api/calls/range`: forma de respuesta sin cambios
  salvo el campo additivo `breakdown` dentro de `dispositions['NO ANSWER']`
  (R12, R13, R22) — verificado vía contrato de claves (`Object.keys`) sobre la
  copia local de `queryStats` post-#22.
- SSE `init`/`update` (R14): mismo `fetchData()` que `/api/calls/today` (sin
  cambios de forma adicionales); sin entorno Issabel/SSE real disponible para
  prueba end-to-end — documentado como pendiente de verificación manual en
  producción, igual que en #21.
- `queryChannels`, `queryHourly`, `queryQueues`: sin cambios (R11, T3
  verificado por inspección de `backend/server.js`).
- Sin nuevas dependencias npm (T7): `backend/package.json` y
  `frontend/package.json` sin diff.

## Verificación manual pendiente (T9, parte visual)

El build de frontend y `./init.sh` están verdes. La comprobación visual en el
Dashboard con datos reales que incluyan al menos un registro de cada
subcategoría (`no_answer`, `ivr_hangup`, `queue_no_agent`) y el caso
`dispositions['NO ANSWER'].count === 0` queda pendiente de verificación manual
en un entorno con acceso a la BD Issabel/SSE real (mismo criterio documentado
para R14 en el informe de #21).
