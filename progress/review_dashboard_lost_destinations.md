# Review — dashboard_lost_destinations (Feature #17) — APROBADO

## 0. Tasks (`specs/dashboard_lost_destinations/tasks.md`)

T1-T7 todas marcadas `[x]`. Verificado.

## 1. Trazabilidad R1-R19 (lógica de reclasificación, copia local vs. `server.js`)

### Equivalencia copia local vs. implementación real

Se comparó carácter por carácter `backend/server.js` (líneas 84-133, función
`queryStats`) contra la copia local en
`backend/tests/dashboard_lost_destinations.test.js` (líneas 36-85). Son
**idénticas**:

- Misma firma: `async function queryStats(pool, from, to, allowedChannels, direction = 'in', lostDests = ['s', 'hang', 'hangup'])`.
- Mismo SQL: `SELECT channel, dst, disposition, COUNT(*) AS count, COALESCE(SUM(duration),0) AS total_duration, COALESCE(SUM(billsec),0) AS total_billsec FROM cdr WHERE calldate >= ? AND calldate < ? GROUP BY channel, dst, disposition`, parámetros `[from, to]`.
- Mismo objeto `base` inicial (4 claves, mismos campos).
- Mismo bucle: `passesFilter` → `d = r.disposition.toUpperCase()` →
  `isLostDst = lostDests.includes(r.dst)` → `targetKey = base[d] ? d : null`
  → reasignación `targetKey = 'NO ANSWER'` si `isLostDst && targetKey &&
  targetKey !== 'NO ANSWER'` → acumulación condicional en `base[targetKey]`
  → `total += Number(r.count)` (fuera del `if`, sin condición).
- Mismo cálculo posterior de `avg_billsec` (solo para `ANSWERED`, igual que
  antes de esta feature) y de `pct` por clave.
- `passesFilter`/`extractChannel` mirror también idénticos a `server.js`
  (líneas 65-82 de `server.js` vs. 18-33 del test).

No hay divergencia de orden de condiciones, manejo de `total`, ni manejo de
`targetKey === null`. El test mirror **no miente** sobre el comportamiento
real.

### Tabla de trazabilidad

| R<n> | Test (`it()`) | Verificación | Estado |
|---|---|---|---|
| R1 | `R2 - ANSWERED con dst en lostDestinations...`, `R3 - NO ANSWER con dst en lostDestinations...` | `isLostDst = lostDests.includes(r.dst)` decide reclasificación independientemente de `disposition` | ✅ |
| R2 | `R2 - ANSWERED con dst en lostDestinations se resta de Contestadas y se suma a Perdidas`, `R2 - BUSY ...`, `R2 - FAILED ...` | Cada test verifica `X.count===0` y `'NO ANSWER'.count===1` (y `total_duration`/`total_billsec` movidos en el caso ANSWERED) | ✅ |
| R3 | `R3 - NO ANSWER con dst en lostDestinations cuenta una sola vez en Perdidas (sin doble conteo)` | `'NO ANSWER'.count === 1`, no `2` | ✅ |
| R4 | `R4 - NO ANSWER con dst fuera de lostDestinations no cambia (comportamiento de #16)` | `dst:'1234'` no en `lostDests`; `'NO ANSWER'.count===1`, resto en 0 | ✅ |
| R5 | `R5 - ANSWERED/BUSY/FAILED con dst fuera de lostDestinations no se reclasifican` | 3 filas, cada una permanece en su categoría original, `total===3` | ✅ |
| R6 | `R6 - con lostDestinations personalizado, reclasifica según la lista configurada` | `lostDests=['9999']`, `dst:'9999'`, `disposition:'ANSWERED'` → reclasificado a `'NO ANSWER'` | ✅ |
| R7 | `R7 - sin config.lostDestinations definido, usa el default ['s','hang','hangup']` | Invoca `queryStats` sin 6º argumento; `dst:'hangup'` reclasifica `BUSY`→`'NO ANSWER'` (default activo) | ✅ |
| R8 | `R8 - con lostDestinations vacío, Perdidas = NO ANSWER.count sin reclasificación (comportamiento de #16)` | `lostDests=[]`; `ANSWERED`+`dst='hang'` permanece en `ANSWERED`, `'NO ANSWER'.count` solo refleja los `NO ANSWER` originales | ✅ |
| R9 | `R9 - Total = Contestadas + Perdidas + Ocupado + Fallidas tras la reclasificación` | Mezcla R2/R3/R4/R5; `total === sum(4 buckets)` | ✅ |
| R10 | `R10 - el total no cambia respecto al cálculo sin reclasificación` | `total` igual a la suma directa de `count` de todas las filas | ✅ |
| R11 | `R11 - pct se recalcula correctamente tras la reclasificación` | `pct` de `ANSWERED`/`'NO ANSWER'` calculados sobre `count` ya reclasificados / `total` | ✅ |
| R12 | (verificación de código, no test unitario directo — ver §2) | `fetchData` pasa `lostDests` a `queryStats(..., null, lostDests)` (línea 378), usado por `/api/calls/today` | ✅ |
| R13 | (verificación de código — ver §2) | `fetchData` pasa `lostDests` a las 3 invocaciones (`null`/`'in'`/`'out'`, líneas 378/381/384), usadas por `/api/calls/range` para general/inbound/outbound | ✅ |
| R14 | (verificación de código — ver §2) | `fetchData` alimenta `/api/events` SSE `init` (líneas 456-464) y el poll periódico que emite `update` (líneas 472-483) | ✅ |
| R15 | (verificación por diff — ver §3) | `queryQueues` (server.js:198-227) sin diff; `dashboard_lost_destinations.test.js` no la toca | ✅ |
| R16 | (verificación de código — ver §2) | `queryQueues` sigue calculando `__lost__` independientemente con el mismo `lostDests`; ambos cálculos coexisten en el mismo `Promise.all` sin interferencia | ✅ |
| R17 | `R17 - sin filas (sin llamadas), todos los contadores y total son 0` | `pool.query` → `[[]]`; todos los `count`/`total_duration`/`total_billsec`/`avg_billsec`/`pct` son `0`, sin `NaN` | ✅ |
| R18 | `R18 - disposition no reconocida no se reclasifica ni se suma a ningún bucket, pero sí a total` | `disposition:'CONGESTION'`, `dst:'hang'` (en lostDests) → `targetKey=null` (porque `base['CONGESTION']` es `undefined`, y la reasignación a `'NO ANSWER'` solo ocurre si `targetKey` ya es truthy) → ningún `base[key].count` cambia, `total===1` | ✅ |
| R19 | `R19 - ningún contador de disposición resulta negativo` | Combinación de filas R2-R18; `Object.values(dispositions).every(d => d.count >= 0)` | ✅ |

Los 15 `it()` ejercitan comportamiento real (assertions sobre valores
calculados), no solo existencia de funciones.

## 2. R12-R14 — Alcance (3 invocaciones de `queryStats`, `fetchData` alimenta REST + SSE)

Verificado en `backend/server.js`:

- Línea 366: `const lostDests = config.lostDestinations || ['s', 'hang', 'hangup'];` (ya existía, scope de `startServer`).
- `fetchData` (línea 371) está definida dentro de `startServer`, por lo que
  `lostDests` está en su closure — no requiere parámetro adicional.
- Líneas 378, 381, 384: las 3 invocaciones de `queryStats` (`null`/`'in'`/`'out'`)
  reciben `lostDests` como sexto argumento.
- `/api/calls/today` (línea 401) llama `fetchData(from, to)` (línea 405) — R12 ✅.
- `/api/calls/range` (línea 414) llama `fetchData(...)` (línea 427) — R13 ✅
  (general/inbound/outbound, mismo objeto `data` con `stats`/`inbound.stats`/`outbound.stats`).
- `/api/events` SSE: evento `init` llama `fetchData(from, to)` (línea 459); el
  `setInterval` de poll (línea 474) llama `fetchData(from, to)` y hace
  `broadcast('update', data)` (línea 478-479) — R14 ✅.

Las 3 invocaciones reciben `lostDests`; `fetchData` es efectivamente la única
función que alimenta ambos endpoints REST y el broadcaster SSE.

## 3. R15-R16 — No interferencia con `queryQueues`/`__lost__`

`git diff HEAD -- backend/server.js` muestra que la función `queryQueues`
(líneas 198-227) **no tiene ningún cambio**. Su invocación
(`queryQueues(pool, from, to, allowedChannels, configQueues, lostDests)`,
línea 386) tampoco cambió — ya recibía `lostDests` desde antes de esta
feature. R15/R16 confirmados.

## 4. R20-R23 — No regresión / forma de payload / SQL parametrizado

- **R20**: `queryStats` retorna `{ dispositions: base, total }` (línea 132,
  sin cambios estructurales). `base` mantiene exactamente las 4 claves
  (`ANSWERED`, `'NO ANSWER'`, `BUSY`, `FAILED`), cada una con `count`,
  `total_duration`, `total_billsec`, `avg_billsec`, `pct`. No se añadió
  ningún campo nuevo (`dispositions.LOST`, `stats.lostByDestination`, etc.).
  El objeto `data` retornado por `fetchData` tampoco cambió de forma. ✅
- **R21**: `git diff HEAD -- frontend/src/components/Dashboard.jsx` muestra
  **un único cambio de una línea**: `sub="sin atender, del total"` →
  `sub="no efectivas, del total"` en la StatCard "Perdidas" (T5, opcional,
  aplicado). Sin cambios de lógica, props ni estructura — `noAnswer`,
  `answered`, `busy`, `failed`, `total` siguen leyéndose igual que en
  `dashboard_kpi_breakdown`. ✅
- **R22**: `git diff --stat HEAD` muestra cambios solo en:
  - `backend/server.js` (+26/-16 líneas)
  - `frontend/src/components/Dashboard.jsx` (1 línea de texto)
  - `feature_list.json` (nueva entrada feature #17, sin marcar `done`)
  - `progress/current.md` (progreso, fuera de alcance de revisión de código)
  - `backend/db/monitor.sqlite-shm`/`-wal` (artefactos binarios de SQLite del
    entorno de desarrollo, no esquema; no son tablas nuevas)

  El diff de `backend/server.js` (`git diff HEAD -- backend/server.js`)
  confirma que el único cambio funcional es: (a) `queryStats` — nueva firma
  con `lostDests`, SQL con `dst` añadido a `SELECT`/`GROUP BY`, y el bucle de
  reclasificación; (b) las 3 líneas de `fetchData` que ahora pasan `lostDests`
  como sexto argumento a `queryStats`. `queryQueues`, `extractChannel`,
  `passesFilter`, `todayRange`, `toMySQLDate`, `queryChannels`, `queryHourly`
  no aparecen en el diff. ✅
- **R23**: El SQL modificado usa `?`/`[from, to]` (parametrizado), sin
  `SELECT *`, sin concatenación de strings. ✅

## 5. No-regresión (Paso 3, ejecutado por el reviewer)

- `cd backend && npm test` → **195/195 tests passing, 7 suites**
  (`config`, `inbound`, `outbound`, `reports`, `stats`, `users`,
  `dashboard_lost_destinations`). Sin decrementos respecto al baseline previo
  (180/180, 6 suites): +15 tests nuevos, 0 regresiones. ✅
- `cd frontend && npm run build` → compiló sin errores (`vite build`, 2316
  módulos, `dist/` generado en ~16s). Warning preexistente de chunk >500kB
  (`index-DZQ9YH9E.js`, 684.80 kB), no relacionado con este cambio. ✅
- `./init.sh` (raíz del repo) → **25/25 checks verdes**, incluye tests
  backend y build frontend embebidos. ✅

## 6. Convenciones (Paso 4)

- Sin `console.log` de debug añadido (`git diff HEAD -- backend/server.js |
  grep -i console.log` → sin coincidencias). ✅
- Sin `SELECT *`, sin concatenación de strings en SQL (SQL modificado usa
  `?`/`[from, to]`). ✅
- Sin TypeScript introducido. ✅
- Sin nuevas dependencias: `git diff HEAD --stat -- backend/package.json
  backend/package-lock.json frontend/package.json frontend/package-lock.json`
  → sin cambios. ✅
- `git diff --stat HEAD` no muestra nuevos endpoints/rutas/tablas SQLite
  (solo `backend/server.js`, `frontend/src/components/Dashboard.jsx`,
  `feature_list.json`, `progress/current.md`, y artefactos binarios
  `.sqlite-shm`/`-wal`). ✅

## 7. Seguridad (Paso 5)

No aplica cambio de superficie de seguridad: no hay nuevos
endpoints/rutas/auth. El único cambio de SQL es la adición de la columna
`dst` al `SELECT`/`GROUP BY` de una query ya existente y de solo lectura
sobre `cdr`, manteniendo parámetros preparados (`?`). `requireAuth` en
`/api/calls/today`, `/api/calls/range` y `/api/events` no se modificó. ✅

## Resumen

- Trazabilidad R1-R23: ✅ completa (15 tests para R1-R19 lógica de
  reclasificación + verificación de código/diff para R12-R16, R20-R23).
- Equivalencia copia local de `queryStats` (test) vs. implementación real
  (`server.js`): ✅ idénticas, sin divergencias.
- No-regresión: ✅ 195/195 tests (7 suites), build frontend ✅, `init.sh`
  25/25 ✅.
- Convenciones: ✅ sin `console.log`, sin `SELECT *`, sin TS, sin nuevas
  dependencias, sin nuevos endpoints/rutas/tablas.
- Seguridad: ✅ sin cambio de superficie.
- Tasks T1-T7: ✅ todas `[x]`.

**Decisión: APROBADO.**

**SIGUIENTE PASO OBLIGATORIO:** `git add -A && git commit -m "feat(dashboard_lost_destinations): Ampliar 'Perdidas' para incluir llamadas con destino en lostDestinations"`
Solo después del commit: marcar `done` en `feature_list.json` e iniciar la siguiente feature.
