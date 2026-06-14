# Review — dashboard_unanswered_breakdown (feature #22) — APROBADO

## Trazabilidad

| R<n> | Test | Estado |
|---|---|---|
| R1/R4 | `R4 - disposition=NO ANSWER con dst fuera de lostDestinations clasifica como no_answer` | ✅ |
| R1/R5 | `R5 - dst en lostDestinations con disposition original ANSWERED clasifica como ivr_hangup` | ✅ |
| R1/R5 | `R5 - dst en lostDestinations con disposition original ya NO ANSWER clasifica como ivr_hangup, no como no_answer (sin doble conteo)` | ✅ |
| R1/R6 | `R6 - disposition=ANSWERED, dst fuera de lostDestinations, dstchannel sin coincidir con AGENT_DSTCHANNEL_RE clasifica como queue_no_agent` | ✅ |
| R2 | `R2 - registros con disposition ANSWERED/BUSY/FAILED (sin reclasificar a NO ANSWER) no contribuyen al breakdown` | ✅ |
| R3/R7 | `R3 - la suma breakdown.no_answer + breakdown.ivr_hangup + breakdown.queue_no_agent es igual a dispositions["NO ANSWER"].count para un dataset mixto` | ✅ |
| R8/R9 | `R9 - dispositions["NO ANSWER"].count, total_duration, total_billsec, avg_billsec y pct no cambian respecto al cálculo de #21; breakdown es additivo` | ✅ |
| R10 | `R10 - total = ANSWERED + NO ANSWER + BUSY + FAILED sigue cumpliéndose tras añadir breakdown` | ✅ |
| R11 | Verificado por inspección: `queryChannels`, `queryHourly`, `queryQueues` sin cambios de firma/cuerpo (T3) | ✅ |
| R12/R13 | `R12/R13 - GET /api/calls/today y /api/calls/range: dispositions["NO ANSWER"] incluye breakdown con las 3 claves no_answer/ivr_hangup/queue_no_agent` | ✅ |
| R13 | `R13 - breakdown está presente en las 3 invocaciones de queryStats usadas por fetchData() (total/inbound/outbound)` | ✅ |
| R14 | `R14 - SSE init/update: stats.dispositions["NO ANSWER"] incluye breakdown (mismo fetchData() que /api/calls/today)` (verificación vía mismo fetchData(); E2E manual pendiente en producción, documentado, igual criterio que #21) | ✅ |
| R15 | Additivo, no rompe consumidores existentes (verificado por R9/R22) | ✅ |
| R16/R17/R18/R19/R20 | `UnansweredBreakdownCard` en `Dashboard.jsx` — sin test unitario (Vitest no configurado, según CLAUDE.md); verificado por inspección de código (ver detalle abajo) | ✅ |
| R21 | Sin nueva query SQL; cálculo 100% en memoria sobre `rows` de `queryStats` (T2 verificado por inspección) | ✅ |
| R22 | `R22 - dispositions["NO ANSWER"] conserva count/total_duration/total_billsec/avg_billsec/pct además del nuevo breakdown; otros buckets sin breakdown` + `R22 - top-level keys de fetchData() no cambian respecto a #21` | ✅ |
| R23 | `git diff backend/package.json frontend/package.json` sin cambios (T7) | ✅ |

## Detalle de verificación de inspección (R16-R20)

- `UnansweredBreakdownCard` se renderiza dentro de `{data && (...)}`, inmediatamente
  después del grid de las 3 StatCards principales (Total/Contestadas/Perdidas) → R16, R18.
- Lee `noAnswerBreakdown = disp?.['NO ANSWER']?.breakdown` (puede ser `undefined`)
  y aplica default `breakdown ?? { no_answer: 0, ivr_hangup: 0, queue_no_agent: 0 }`
  dentro del componente → R19.
- Porcentaje: `noAnswerTotal > 0 ? Math.round((count / noAnswerTotal) * 1000) / 10 : 0`
  → consistente con el patrón existente, evita división por cero → R17.
- Labels en español correctos: "Sin respuesta", "Colgó en IVR", "Cola sin agente" → R16.
- No se introduce ninguna librería de gráficos; presentación numérica/card-based,
  sin Recharts adicional necesario (Decisión B) → R20.

## Orden de evaluación y exclusividad mutua (foco especial del encargo)

`classifyUnansweredReason` (backend/server.js ~línea 130) implementa el orden
`ivr_hangup` → `queue_no_agent` → `no_answer` (first-match-wins) exactamente como
especifica R1:
1. `if (lostDests.includes(row.dst)) return 'ivr_hangup'` — tiene prioridad incluso
   si `disposition` original ya era `'NO ANSWER'` (test R5 "sin doble conteo" lo
   verifica explícitamente).
2. `else if (d === 'ANSWERED' && !AGENT_DSTCHANNEL_RE.test(...)) return 'queue_no_agent'`.
3. `else return 'no_answer'`.

El test `R3` con dataset mixto confirma
`breakdown.no_answer + breakdown.ivr_hangup + breakdown.queue_no_agent === dispositions['NO ANSWER'].count`
(3 + 3 + 4 = 10), y `R9`/`R22` confirman lo mismo de forma genérica.

## No-regresión v1.0/#20/#21: ✅

- `queryChannels`, `queryHourly`, `queryQueues`, `resolveDisposition`: sin diff
  (confirmado vía `git diff backend/server.js` — únicas adiciones son
  `classifyUnansweredReason` y los 4 puntos de T2 dentro de `queryStats`).
- `disposition_agent_answered_fix.test.js` y `dashboard_lost_destinations.test.js`
  (features #17/#21) siguen pasando sin modificación — incluidos en los 331/331.
- `/api/calls/today`, `/api/calls/range`, SSE `init`/`update`: forma de respuesta
  sin cambios salvo el campo additivo `breakdown` (R12-R15, R22).
- `cd frontend && npm run build` → sin errores (2320 módulos, ~11.6s).
- `cd backend && npx jest` → **331/331 passing** (13 suites).

## Convenciones: ✅

- Sin `SELECT *` ni concatenación SQL; sin nuevas queries (cálculo en memoria
  sobre `rows` ya devueltas por `queryStats`).
- Sin `console.log` de debug (grep sobre el diff sin resultados).
- Sin TypeScript introducido.
- Sin nuevas dependencias npm (backend ni frontend); sin librerías de gráficos
  distintas de Recharts (de hecho no se usa ninguna en esta feature).
- Sin `fetch()` directo en componentes React (no se tocó `src/api.js`, no aplica
  para esta feature ya que no hay endpoints nuevos).

## Seguridad: ✅

- No se introdujeron endpoints nuevos. El campo `breakdown` viaja dentro de la
  respuesta existente de endpoints ya protegidos por `requireAuth`.

## Tests: ✅ (331/331 passing)

## feature_list.json

- `status: "in_progress"` (no marcado `done` por el implementer/reviewer, correcto
  — corresponde al leader tras el commit).

---

**Decisión: APROBADO.**

**SIGUIENTE PASO OBLIGATORIO:**
```
git add -A && git commit -m "feat(dashboard_unanswered_breakdown): Desglose por motivo de llamadas no contestadas en el dashboard"
```
Solo después del commit: marcar `done` en `feature_list.json` e iniciar la
siguiente feature.

Nota: hay archivos no relacionados en el working tree (`CDRReport-2026Jun13.180725.csv`,
`backend/db/monitor.sqlite-shm`/`-wal`) — el leader debe decidir si se incluyen en
el commit de esta feature o se excluyen/gitignoran.
