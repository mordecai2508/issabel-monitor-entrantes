# Implementación — dashboard_lost_destinations (Feature #17)

## Archivos modificados/creados

- `backend/server.js` — única modificación de lógica:
  - **T1+T2**: `queryStats` (línea ~84) cambia de firma a
    `async function queryStats(pool, from, to, allowedChannels, direction = 'in', lostDests = ['s', 'hang', 'hangup'])`
    y su SQL pasa de `GROUP BY channel, disposition` a
    `GROUP BY channel, dst, disposition`, añadiendo `dst` al `SELECT`
    (líneas ~84-97). Parámetros preparados `[from, to]` sin cambios; sin
    `SELECT *`.
  - **T3**: el bucle `for (const r of rows)` (líneas ~106-123) implementa el
    algoritmo de reclasificación de `design.md §3.2`: calcula `isLostDst =
    lostDests.includes(r.dst)`, determina `targetKey` (la disposición original
    si está reconocida en `base`, o `null` si no — R18), y si `isLostDst &&
    targetKey && targetKey !== 'NO ANSWER'` reasigna `targetKey = 'NO ANSWER'`
    (R2). Acumula `count`/`total_duration`/`total_billsec` en
    `base[targetKey]` solo si `targetKey` no es `null`. `total +=
    Number(r.count)` se mantiene fuera del `if`, sin cambios (R10). El cálculo
    de `avg_billsec` (línea ~125-126) y `pct` (línea ~128-130) permanece
    intacto, ejecutándose después del bucle sobre `base`/`total` ya
    reclasificados.
  - **T4**: las tres invocaciones de `queryStats` dentro del `Promise.all` de
    `fetchData` (líneas ~370-378) ahora pasan `lostDests` como sexto argumento:
    `queryStats(pool, from, to, allowedChannels, null, lostDests)`,
    `..., 'in', lostDests)`, `..., 'out', lostDests)`. `lostDests` ya existía
    en `startServer` (línea ~358, `config.lostDestinations || ['s', 'hang',
    'hangup']`) y está en scope por closure de `fetchData` — no se necesitó
    parámetro adicional. `queryChannels`, `queryHourly` y `queryQueues` no se
    tocaron (R15, R22).

- `frontend/src/components/Dashboard.jsx` — **T5 (opcional) aplicado**:
  cambio cosmético de una línea en la StatCard "Perdidas":
  `sub="sin atender, del total"` → `sub="no efectivas, del total"` (línea
  ~139), siguiendo la sugerencia de `design.md §5.1`. Sin cambios de lógica,
  props ni estructura.

- `backend/tests/dashboard_lost_destinations.test.js` (**nuevo**, T6):
  copia local de `extractChannel`, `passesFilter`, `base` y la `queryStats`
  modificada (idéntica en lógica a `server.js`), mockeando `pool.query` con
  `jest.fn().mockResolvedValue([rows])`. 15 `it()` cubriendo R2 (×3, una por
  ANSWERED/BUSY/FAILED), R3, R4, R5, R6, R7, R8, R9, R10, R11, R17, R18, R19.

- `specs/dashboard_lost_destinations/tasks.md` — T1-T7 marcadas `[x]`.

No se añadieron dependencias npm, tablas SQLite ni endpoints. No se modificó
`queryQueues`, `extractChannel`, `passesFilter`, `todayRange`, `toMySQLDate`,
`queryChannels` ni `queryHourly`.

## Trazabilidad R<n> → test/verificación → archivo:línea

| Req. | Verificación | Ubicación |
|---|---|---|
| R1 | `it('R2 - ANSWERED con dst en lostDestinations...')`, `it('R3 - NO ANSWER con dst en lostDestinations...')` — `isLostDst = lostDests.includes(r.dst)` decide reclasificación sin importar `disposition` | `backend/server.js:110` (`isLostDst`); `dashboard_lost_destinations.test.js` (R2/R3 tests) |
| R2 | `it('R2 - ANSWERED con dst en lostDestinations se resta de Contestadas y se suma a Perdidas')`, `it('R2 - BUSY ...')`, `it('R2 - FAILED ...')` — verifican `ANSWERED.count===0`/`BUSY.count===0`/`FAILED.count===0` y `'NO ANSWER'.count===1` | `backend/server.js:112-115` (reasignación `targetKey = 'NO ANSWER'`); test líneas con `disposition: 'ANSWERED'/'BUSY'/'FAILED', dst: 'hang'/'hangup'` |
| R3 | `it('R3 - NO ANSWER con dst en lostDestinations cuenta una sola vez en Perdidas (sin doble conteo)')` — `'NO ANSWER'.count === 1`, no `2` | `backend/server.js:112-115` (`targetKey !== 'NO ANSWER'` evita doble reclasificación cuando `d === 'NO ANSWER'`) |
| R4 | `it('R4 - NO ANSWER con dst fuera de lostDestinations no cambia (comportamiento de #16)')` | `backend/server.js:108-115`; test con `dst: '1234'`, `disposition: 'NO ANSWER'` |
| R5 | `it('R5 - ANSWERED/BUSY/FAILED con dst fuera de lostDestinations no se reclasifican')` | `backend/server.js:110,113` (`isLostDst === false` → sin reasignación); test con tres filas `dst` fuera de `lostDests` |
| R6 | `it('R6 - con lostDestinations personalizado, reclasifica según la lista configurada')` — `lostDests=['9999']`, `dst:'9999'` → reclasificado | `backend/server.js:84` (parámetro `lostDests`); test |
| R7 | `it("R7 - sin config.lostDestinations definido, usa el default ['s','hang','hangup']")` — invoca `queryStats` sin 6º argumento | `backend/server.js:84` (`lostDests = ['s','hang','hangup']` default) |
| R8 | `it('R8 - con lostDestinations vacío, Perdidas = NO ANSWER.count sin reclasificación (comportamiento de #16)')` — `lostDests=[]` | `backend/server.js:110` (`[].includes(...)` siempre `false`) |
| R9 | `it('R9 - Total = Contestadas + Perdidas + Ocupado + Fallidas tras la reclasificación')` — `total === sum(4 buckets)` con mezcla R2/R3/R4/R5 | `backend/server.js:106-123` |
| R10 | `it('R10 - el total no cambia respecto al cálculo sin reclasificación')` — compara `total` con suma directa de `count` de todas las filas | `backend/server.js:122` (`total += Number(r.count)` fuera del `if(targetKey)`) |
| R11 | `it('R11 - pct se recalcula correctamente tras la reclasificación')` — `pct` de `ANSWERED`/`'NO ANSWER'` reflejan `count` reclasificados sobre `total` | `backend/server.js:128-130` (sin cambios, ejecuta tras el bucle) |
| R12 | `fetchData` (T4) pasa `lostDests` a `queryStats(..., null, lostDests)` para `totalStats`, usado por `/api/calls/today` | `backend/server.js:370,397-398` |
| R13 | `fetchData` pasa `lostDests` a las 3 invocaciones (`null`/`'in'`/`'out'`), usadas por `/api/calls/range` para general/inbound/outbound | `backend/server.js:370,373,376,419-420` |
| R14 | Mismo `fetchData` alimenta el broadcaster SSE `init`/`update` (sin cambios en esa parte de `startServer`, fuera de alcance T1-T4) | `backend/server.js:363-390` |
| R15 | `queryQueues` (línea ~190) y su invocación (línea ~378, sin 6º argumento extra) no se modificaron; `dashboard_lost_destinations.test.js` no toca `queryQueues` | `backend/server.js:190-219, 378` |
| R16 | `queryQueues` sigue calculando `__lost__` de forma independiente con el mismo `lostDests`; `queryStats` reclasificado y `queryQueues`/`__lost__` coexisten en el mismo `Promise.all` sin interferencia (ambos reciben `lostDests` pero producen agregados distintos) | `backend/server.js:363-390` |
| R17 | `it('R17 - sin filas (sin llamadas), todos los contadores y total son 0')` — `pool.query` devuelve `[[]]`, todos los `count`/`total`/`pct`/`avg_billsec` son `0`, sin `NaN` | `backend/server.js:106-130` (bucle vacío + defaults de `base`) |
| R18 | `it('R18 - disposition no reconocida no se reclasifica ni se suma a ningún bucket, pero sí a total')` — `disposition: 'CONGESTION'` → `targetKey = null`, ningún `base[key].count` cambia, `total` incluye la fila | `backend/server.js:112,117` (`targetKey = base[d] ? d : null`; `if (targetKey)`) |
| R19 | `it('R19 - ningún contador de disposición resulta negativo')` — combinación de casos R2-R18, `Object.values(dispositions).every(d => d.count >= 0)` | `backend/server.js:106-123` (solo sumas, nunca restas post-hoc) |
| R20 | No se cambió la forma del payload (`{ dispositions: {...}, total }`); `queryStats` retorna el mismo `{ dispositions, total }` con las mismas 4 claves y mismos campos por clave | `backend/server.js:99-104,132` (objeto `base`/retorno sin cambios estructurales) |
| R21 | `Dashboard.jsx` no requirió cambios de lógica (T5 fue puramente cosmético, una línea de texto); sigue leyendo `dispositions['NO ANSWER'].count`/`.pct`, `ANSWERED`/`BUSY`/`FAILED`/`stats.total` sin modificación | `frontend/src/components/Dashboard.jsx` (sin diff de lógica; única línea cambiada es `sub=`) |
| R22 | Confirmado por diff: `queryQueues`, `extractChannel`, `passesFilter`, `todayRange`, `toMySQLDate`, `queryChannels`, `queryHourly` sin cambios — único cambio en `server.js` es `queryStats` (SQL+firma+bucle) y las 3 líneas de `fetchData` que pasan `lostDests` | `backend/server.js` (diff acotado a líneas ~84-130 y ~370-378) |
| R23 | SQL de `queryStats` usa `?`/`[from, to]` (parametrizado), sin `SELECT *`, sin concatenación de strings | `backend/server.js:85-97` |

## Resultado de verificación T7

- `cd backend && npm test` → ✅ **195/195** tests passing, **7 suites**
  (`config`, `inbound`, `outbound`, `reports`, `stats`, `users`, y el nuevo
  `dashboard_lost_destinations`), sin regresiones (suite previa estaba en
  180/180 sobre 6 archivos; +15 tests nuevos = 195/195 sobre 7 archivos).
- `cd frontend && npm run build` → ✅ compiló sin errores (`vite build`, 2316
  módulos, `dist/` generado, ~16s). Warning preexistente de chunk >500kB
  (`index-DZQ9YH9E.js`, 684.80 kB), no relacionado con este cambio.
- `./init.sh` → ✅ **25/25 checks** verdes (incluye build frontend y tests
  backend embebidos).

### Verificación manual (punto 4 de T7)

No se realizó verificación contra una BD Issabel/MySQL real (no disponible en
este entorno de implementación). Se validó la lógica mediante los 15 tests
unitarios de `dashboard_lost_destinations.test.js`, que cubren
aritméticamente:
- Forma del payload retornado por `queryStats` (mismas 4 claves de
  `dispositions`, cada una con `count`, `total_duration`, `total_billsec`,
  `avg_billsec`, `pct`) — R20.
- Identidad `total === ANSWERED.count + 'NO ANSWER'.count + BUSY.count +
  FAILED.count` tras la reclasificación — R9.
- El bloque `queryQueues`/`__lost__` no se tocó (sin diff en esa función ni en
  su invocación) — R15/R16.
- "Perdidas" (`'NO ANSWER'.count`) solo puede ser `>=` su valor previo a esta
  feature, dado que la reclasificación únicamente añade registros
  (`ANSWERED`/`BUSY`/`FAILED` con `dst ∈ lostDestinations`) — comportamiento
  garantizado por el algoritmo (solo suma, nunca resta de `'NO ANSWER'`).

## T5 — Ajuste cosmético opcional

**Aplicado.** Se cambió `sub="sin atender, del total"` →
`sub="no efectivas, del total"` en la StatCard "Perdidas" de
`frontend/src/components/Dashboard.jsx`, siguiendo la recomendación de
`design.md §5.1` (el texto "sin atender" podía ser impreciso para llamadas
`ANSWERED`/`BUSY`/`FAILED` reclasificadas por `dst ∈ lostDestinations`). Es un
cambio de **una línea de texto**, sin tocar lógica, props ni estructura.

## Resumen

- Tests backend: **195/195** (incluye 15 nuevos de
  `dashboard_lost_destinations.test.js`, 0 regresiones)
- Build frontend: ✅
- `./init.sh`: ✅ 25/25
- T5 (opcional): **aplicado**
- Todas las tasks T1-T7 marcadas `[x]` en
  `specs/dashboard_lost_destinations/tasks.md`
