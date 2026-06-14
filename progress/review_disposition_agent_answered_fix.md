# Review — disposition_agent_answered_fix — APROBADO

## Trazabilidad

| R<n> | Test | Estado |
|---|---|---|
| R1/R3 | `R1/R3 - dstchannel="Agent/03" con disposition=ANSWERED cuenta como ANSWERED` / `...SIP/203-00001a2b...` | ✅ |
| R2/R7 | `R2/R7 - dst en config.queues (8000), dstchannel vacío, disposition=ANSWERED reclasifica a NO ANSWER` | ✅ |
| R4 | `R4 - disposition=BUSY con dstchannel vacío NO se reclasifica` / `R4 - disposition=FAILED...` | ✅ |
| R5/R6 | `R5/R6 - dst en lostDestinations Y dstchannel sin agente con disposition=ANSWERED cuenta una sola vez en NO ANSWER` | ✅ |
| R8 | `R8 - dst en config.queues con dstchannel="Agent/04" y disposition=ANSWERED sigue en ANSWERED` | ✅ |
| R9 | `R9 - total = ANSWERED + NO ANSWER + BUSY + FAILED tras la reclasificación` | ✅ |
| R10 | `R10 - avg_billsec y pct se recalculan sobre los buckets reclasificados` | ✅ |
| R11 | `R11 - la suma de ANSWERED/NO ANSWER de queryChannels coincide con dispositions.*.count de queryStats` (x2) | ✅ |
| R12 | `R12 - la suma de ANSWERED/NO ANSWER de queryHourly (24h) coincide con dispositions.*.count de queryStats` (x2) | ✅ |
| R13 | `R13 - un dataset mixto produce el mismo total reclasificado en las tres funciones` | ✅ |
| R14/R15/R16/R21 | `R14/R15/R16/R21 - fetchData() conserva stats/channels/hourly/inbound/outbound/queues/channelAliases/appName/from/to/generatedAt` | ✅ |
| R14/R15 | `R14/R15 - stats.dispositions conserva las 4 claves...` | ✅ |
| R11 (shape) | `R11 - queryChannels conserva las claves channel/ANSWERED/NO ANSWER/BUSY/FAILED/total/total_billsec por canal` | ✅ |
| R12 (shape) | `R12 - queryHourly devuelve 24 entradas con hour/ANSWERED/NO ANSWER/BUSY/FAILED/total` | ✅ |
| R17 | `R17 - queryQueues no aplica el criterio de dstchannel; documentado como limitación conocida` | ✅ |
| R18 | `R18 - dstchannel=null/undefined con disposition=ANSWERED reclasifica a NO ANSWER` / `R18 - dstchannel con valor que no matchea ningún patrón...` | ✅ |
| R19 | Verificado por inspección: `resolveDisposition` (server.js:108-125) evalúa `row.dstchannel` crudo, sin pasar por `extractChannel` | ✅ |
| R20 | Verificado por inspección: `queryStats`/`queryChannels`/`queryHourly` usan `SELECT` con placeholders `?`/`[from, to]`, sin `SELECT *`, sin concatenación de strings | ✅ |
| #17 (regresión) | `dashboard_lost_destinations.test.js` — 15 tests existentes adaptados a `resolveDisposition`/firma post-#20, todos verdes | ✅ |

Todos los `R<n>` de requirements.md (R1-R21) están citados por nombre en tests
reales que verifican comportamiento (no stubs vacíos): conteos numéricos
exactos por escenario (R1-R10, R18), consistencia cruzada entre las tres
funciones sobre el mismo dataset mixto (R11-R13), y contrato de forma de
`fetchData()`/payload (R14-R17, R21). R19 y R20 se verifican por inspección
directa del código, tal como hizo el implementer, y la inspección confirma
las afirmaciones.

## No-regresión v1.0: ✅

- `git diff HEAD -- backend/server.js` muestra un diff mínimo y localizado:
  nuevo helper `resolveDisposition`/`AGENT_DSTCHANNEL_RE` junto a
  `extractChannel`/`passesFilter`; `queryStats`/`queryChannels`/`queryHourly`
  añaden `dstchannel` (y `dst` donde faltaba) al `SELECT`/`GROUP BY` y
  delegan en `resolveDisposition`; `queryChannels`/`queryHourly` ganan el
  parámetro `lostDests` con el mismo default que `queryStats`
  (`['s','hang','hangup']`).
- `fetchData()` (Promise.all, ~línea 452-462): las 3 llamadas a
  `queryChannels` (total/in/out) y las 2 a `queryHourly` (total/in) pasan
  `lostDests` — confirmado por inspección del diff línea por línea.
- `queryQueues` **sin cambios** (cero líneas modificadas en el diff): sigue
  agrupando por `channel, dst, disposition`, sin `dstchannel`, sin
  `resolveDisposition` (R17, Decisión C).
- Endpoints v1.0 (`/api/calls/today`, `/api/calls/range`, `/api/events`
  SSE init/update, `/api/calls/inbound`, `/api/calls/outbound`,
  `/api/admin/*`): ninguno modificado (cero rutas nuevas/cambiadas — design.md
  §1 confirmado por inspección). El contrato de forma de `fetchData()` está
  cubierto por el test R14/R15/R16/R21.
- Feature #20 (channels_inbound_outbound_split): `passesFilter` sin cambios
  (cero líneas en el diff); `queryChannels`/`queryHourly` conservan su firma
  `(pool, from, to, inboundChannels, outboundChannels, direction, lostDests)`
  — solo se añadió `lostDests` al final, sin romper las llamadas
  total/in/out.
- `cd backend && npx jest`: **12 suites, 318/318 tests passing** (re-ejecutado
  por el reviewer).
- `cd frontend && npm run build`: **build exitoso**, 2320 módulos
  transformados, sin errores (re-ejecutado por el reviewer).

## Convenciones: ✅

- Sin `SELECT *` introducido por este diff (los 3 hits de `SELECT \*` en
  `config.test.js`/`alerts.test.js`/`users.test.js` son preexistentes, no
  forman parte de este cambio — confirmado: `git diff HEAD -- backend/server.js`
  no contiene `console\.` ni `SELECT \*`).
- Sin `console.log` de debug nuevo (`git diff HEAD -- backend/server.js |
  grep -i console` → vacío; los `console.log` existentes en server.js son de
  v1.0/features previas: `[CONFIG]`, `[DB]`, `[SSE]`, banner de arranque).
- Sin TypeScript introducido.
- Sin escrituras a la BD de Issabel: las 3 queries modificadas son `SELECT`
  con parámetros `?` (`[from, to]`), agregación en memoria.
- `queryQueues` no fue tocado (T6 verificado — Decisión C documentada en
  design.md §6).

## Seguridad: ✅

Esta feature no añade ni modifica rutas (design.md §1: "Ninguno. Esta
feature no añade ni modifica rutas"). No aplica verificación adicional de
`requireAuth`/`requireAdmin`.

## Tests: ✅ (318/318 passing)

- Suite completa: 12 test suites, 318 tests, 0 fallos (re-ejecutada por el
  reviewer, no solo confiando en el informe del implementer).
- `disposition_agent_answered_fix.test.js`: 25 tests, todos describen
  comportamiento real (assertions sobre valores numéricos calculados, no
  `expect(true).toBe(true)`).
- `dashboard_lost_destinations.test.js`: 15 tests adaptados a la firma
  post-#20/#21, todos verdes.

## tasks.md: ✅

T1-T11 marcados `[x]`. Verificación de código confirma T1-T6; verificación de
tests confirma T7-T10; build de frontend confirma parte de T11 (npm run
build sin errores). R16 (SSE end-to-end con datos reales) queda documentado
como pendiente de verificación manual en producción — aceptable, ya que el
contrato de forma de `fetchData()` (que alimenta el SSE) está cubierto por
test y la suite +build están en verde.

---

**Decisión: APROBADO.**

**SIGUIENTE PASO OBLIGATORIO:** `git add -A && git commit -m "feat(disposition_agent_answered_fix): Distinguir llamadas atendidas por agente real de llamadas solo contestadas por IVR/cola sin agente"`

Solo después del commit: marcar `done` en `feature_list.json` e iniciar la
siguiente feature.
