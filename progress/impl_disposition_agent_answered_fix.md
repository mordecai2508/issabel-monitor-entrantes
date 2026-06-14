# Informe de implementación — disposition_agent_answered_fix (feature #21)

## Resumen

Se introdujo el criterio "atendida por agente" basado en `dstchannel`
(`/^(Agent\/\d+|SIP\/\d+-)/`) mediante un helper puro compartido
`resolveDisposition(row, lostDests)`, que combina la reclasificación de
`lostDestinations` (#17) con la nueva reclasificación por `dstchannel` (#21)
sin doble conteo. `queryStats`, `queryChannels` y `queryHourly` ahora
seleccionan `dstchannel` (y `dst` donde faltaba) en su `SELECT`/`GROUP BY` y
delegan en `resolveDisposition` para decidir el bucket
(`ANSWERED`/`'NO ANSWER'`/`BUSY`/`FAILED`). `queryQueues` no se modificó
(Decisión C del design, R17 — limitación conocida documentada).

## Archivos modificados

- `backend/server.js`:
  - Nuevo helper `resolveDisposition(row, lostDests)` y constante
    `AGENT_DSTCHANNEL_RE = /^(Agent\/\d+|SIP\/\d+-)/` (junto a
    `extractChannel`/`passesFilter`, ~líneas 100-128).
  - `queryStats` (~líneas 130-180): `SELECT`/`GROUP BY` añade `dstchannel`;
    cuerpo reemplaza el bloque inline de reclasificación (#17) por
    `resolveDisposition(r, lostDests)`. Firma sin cambios.
  - `queryChannels` (~líneas 182-212): `SELECT`/`GROUP BY` añade `dst` y
    `dstchannel`; nueva firma con `lostDests = ['s','hang','hangup']`; usa
    `resolveDisposition(r, lostDests)` para incrementar `map[ch][targetKey]`.
  - `queryHourly` (~líneas 214-246): `SELECT`/`GROUP BY` añade `dst` y
    `dstchannel`; nueva firma con `lostDests = ['s','hang','hangup']`; usa
    `resolveDisposition(r, lostDests)` para incrementar `hours[h][targetKey]`.
  - `fetchData()` / `Promise.all` (~líneas 452-470): las 3 invocaciones de
    `queryChannels` (total/in/out) y las 2 de `queryHourly` (total/in) pasan
    `lostDests` como último argumento (reutilizando la constante existente).
  - `queryQueues` (~línea 242): sin cambios — sigue agrupando por
    `channel, dst, disposition`, sin `dstchannel`, sin `resolveDisposition`
    (R17, Decisión C).

## Archivos creados

- `backend/tests/disposition_agent_answered_fix.test.js` — copia local
  (mirror) de `extractChannel`, `passesFilter`, `AGENT_DSTCHANNEL_RE`,
  `resolveDisposition`, `queryStats`, `queryChannels` y `queryHourly`
  post-#20/#21, con 25 tests cubriendo R1-R21.

## Archivos actualizados (tests)

- `backend/tests/dashboard_lost_destinations.test.js`: copia local
  actualizada a la firma post-#20 (`inboundChannels, outboundChannels,
  direction, lostDests`), `passesFilter`/`queryStats` reemplazados por las
  versiones que delegan en `resolveDisposition` (#21); `makeRow` ahora incluye
  `dstchannel: 'Agent/01'` por defecto (mantiene ANSWERED salvo que el test lo
  sobrescriba); 15 tests existentes (#17) adaptados y verdes.

## Trazabilidad R<n> → test → archivo:línea

| Req | Test | Archivo |
|---|---|---|
| R1/R3 | `R1/R3 - dstchannel="Agent/03" con disposition=ANSWERED cuenta como ANSWERED` / `...SIP/203-00001a2b...` | `backend/tests/disposition_agent_answered_fix.test.js` (describe `resolveDisposition`) |
| R2/R7 | `R2/R7 - dst en config.queues (8000), dstchannel vacío, disposition=ANSWERED reclasifica a NO ANSWER` | `backend/tests/disposition_agent_answered_fix.test.js` |
| R4 | `R4 - disposition=BUSY con dstchannel vacío NO se reclasifica` / `R4 - disposition=FAILED...` | `backend/tests/disposition_agent_answered_fix.test.js` |
| R5/R6 | `R5/R6 - dst en lostDestinations Y dstchannel sin agente con disposition=ANSWERED cuenta una sola vez en NO ANSWER` | `backend/tests/disposition_agent_answered_fix.test.js` |
| R8 | `R8 - dst en config.queues con dstchannel="Agent/04" y disposition=ANSWERED sigue en ANSWERED` | `backend/tests/disposition_agent_answered_fix.test.js` |
| R9 | `R9 - total = ANSWERED + NO ANSWER + BUSY + FAILED tras la reclasificación` | `backend/tests/disposition_agent_answered_fix.test.js` |
| R10 | `R10 - avg_billsec y pct se recalculan sobre los buckets reclasificados` | `backend/tests/disposition_agent_answered_fix.test.js` |
| R11 | `R11 - la suma de ANSWERED/NO ANSWER de queryChannels coincide con dispositions.*.count de queryStats` | `backend/tests/disposition_agent_answered_fix.test.js` |
| R12 | `R12 - la suma de ANSWERED/NO ANSWER de queryHourly (24h) coincide con dispositions.*.count de queryStats` | `backend/tests/disposition_agent_answered_fix.test.js` |
| R13 | `R13 - un dataset mixto produce el mismo total reclasificado en las tres funciones` | `backend/tests/disposition_agent_answered_fix.test.js` |
| R14/R15/R16/R21 | `R14/R15/R16/R21 - fetchData() conserva stats/channels/hourly/inbound/outbound/queues/channelAliases/appName/from/to/generatedAt` | `backend/tests/disposition_agent_answered_fix.test.js` |
| R14/R15 | `R14/R15 - stats.dispositions conserva las 4 claves...` / `R11 - queryChannels conserva las claves...` / `R12 - queryHourly devuelve 24 entradas...` | `backend/tests/disposition_agent_answered_fix.test.js` |
| R17 | `R17 - queryQueues no aplica el criterio de dstchannel; documentado como limitación conocida` | `backend/tests/disposition_agent_answered_fix.test.js` |
| R18 | `R18 - dstchannel=null/undefined con disposition=ANSWERED reclasifica a NO ANSWER` / `R18 - dstchannel con valor que no matchea ningún patrón...` | `backend/tests/disposition_agent_answered_fix.test.js` |
| R19 | Verificado por inspección: `resolveDisposition` evalúa `row.dstchannel` crudo (sin `extractChannel`) | `backend/server.js` (`resolveDisposition`) |
| R20 | Verificado por inspección: las 3 queries modificadas usan `SELECT` con `?`/`[from, to]`, sin `SELECT *`, sin concatenación | `backend/server.js` (`queryStats`/`queryChannels`/`queryHourly`) |
| #17 (regresión) | 15 tests existentes adaptados a la firma post-#20 y al cuerpo basado en `resolveDisposition` | `backend/tests/dashboard_lost_destinations.test.js` |

## Resultado de verificación

```
cd backend && npx jest
Test Suites: 12 passed, 12 total
Tests:       318 passed, 318 total
```

```
cd frontend && npm run build
✓ 2320 modules transformed, built in ~12s, sin errores
```

```
./init.sh
✅ Todo verde: 25/25 checks pasaron
```

## No-regresión

- `GET /api/calls/today`, `GET /api/calls/range`, SSE `init`/`update`:
  forma de respuesta sin cambios (R14-R16, R21) — verificado por el contrato
  documentado en `disposition_agent_answered_fix.test.js` y por la suite
  completa en verde (incluye `passesFilter.test.js`, `outbound.test.js`,
  `config.test.js`, `alerts.test.js` de #20, todos verdes).
- Filtrado in/out (`channels.inbound`/`channels.outbound`, feature #20):
  sin cambios — `passesFilter` no se tocó; `queryChannels`/`queryHourly`
  conservan su firma `(pool, from, to, inboundChannels, outboundChannels,
  direction, lostDests)` (solo se añadió `lostDests` al final).
- `queryQueues`: sin cambios de SQL ni de criterio (R17, Decisión C) —
  verificado por inspección del código y test dedicado.
- R16 (SSE init/update): verificado por la invariancia de forma de
  `fetchData()` (R14/R15/R21) más `npm start`/`./init.sh` en verde, igual
  que la verificación manual documentada en la feature #20; sin entorno
  Issabel real disponible para una prueba SSE end-to-end con datos reales.
