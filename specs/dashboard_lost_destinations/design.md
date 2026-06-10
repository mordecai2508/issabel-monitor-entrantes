# design.md — dashboard_lost_destinations

> Feature ID: 17 | Revisión: 2026-06-10

---

## 1. Endpoints nuevos

Ninguno. Esta feature **no añade ni modifica rutas**. Los endpoints existentes
`GET /api/calls/today`, `GET /api/calls/range` y el evento SSE `init`/`update`
mantienen exactamente su forma de payload (R20):

```js
{
  ok: true,
  stats:    { dispositions: { ANSWERED, 'NO ANSWER', BUSY, FAILED }, total },
  channels: [...],
  hourly:   [...],
  inbound:  { stats: { dispositions, total }, channels, hourly },
  outbound: { stats: { dispositions, total }, channels },
  queues:   [...],
  channelAliases: {...},
  appName: "...",
  from, to, generatedAt,
}
```

Lo único que cambia son los **valores numéricos** dentro de
`stats.dispositions` (y de `inbound.stats.dispositions` /
`outbound.stats.dispositions`), por la reclasificación de R1–R5.

---

## 2. Cambios BD SQLite

Ninguno. No se requiere persistencia adicional (ni nuevas tablas ni columnas).

---

## 3. Queries CDR nuevas

### 3.1 `queryStats` — SELECT modificado

`queryStats(pool, from, to, allowedChannels, direction, lostDests)` (nueva
firma — ver §3.3) modifica el `SELECT`/`GROUP BY` existente para incluir `dst`:

```sql
SELECT
  channel,
  dst,
  disposition,
  COUNT(*)                    AS count,
  COALESCE(SUM(duration), 0)  AS total_duration,
  COALESCE(SUM(billsec), 0)   AS total_billsec
FROM cdr
WHERE calldate >= ? AND calldate < ?
GROUP BY channel, dst, disposition
```

Cambios respecto al SQL actual (`backend/server.js` línea ~85):
- Se añade `dst` al `SELECT` y al `GROUP BY`.
- Los parámetros preparados (`?`, `[from, to]`) no cambian.
- No se usa `SELECT *` (regla dura del proyecto).

**Impacto de cardinalidad**: `GROUP BY channel, dst, disposition` puede
producir más filas que `GROUP BY channel, disposition` (más combinaciones),
pero el rango de filas sigue acotado por `(canales × destinos distintos ×
4 disposiciones)` para el período consultado — en la práctica, el número de
`dst` distintos por canal en un día es pequeño comparado con el volumen total
de registros CDR, por lo que el agregado en MySQL sigue siendo eficiente
(`GROUP BY` con índice en `calldate` para el filtro `WHERE`). No se requiere
`LIMIT` adicional: `queryStats` ya opera sobre agregados, no sobre filas
individuales.

### 3.2 Algoritmo de reclasificación (en JS, tras la query)

Tras obtener `rows` (cada una con `channel, dst, disposition, count,
total_duration, total_billsec`), para cada fila que pasa `passesFilter`:

```js
const d = r.disposition.toUpperCase();
const isLostDst = lostDests.includes(r.dst);

// Determinar el bucket destino tras reclasificación
let targetKey = base[d] ? d : null; // null = disposición no reconocida (R18)

if (isLostDst && targetKey && targetKey !== 'NO ANSWER') {
  targetKey = 'NO ANSWER'; // R2: reclasifica ANSWERED/BUSY/FAILED → Perdidas
}
// Si d === 'NO ANSWER' (con o sin dst en lostDests), targetKey ya es
// 'NO ANSWER' — sin doble conteo (R3, R4).

if (targetKey) {
  base[targetKey].count          += Number(r.count);
  base[targetKey].total_duration += Number(r.total_duration);
  base[targetKey].total_billsec  += Number(r.total_billsec);
}
total += Number(r.count); // sin cambios — el total no se ve afectado (R10)
```

Notas:
- `total` sigue siendo la suma de `Number(r.count)` de **todas** las filas que
  pasan `passesFilter`, exactamente como hoy (línea 114 actual) — la
  reclasificación solo decide en qué `base[key]` se acumula cada fila, nunca
  cuántas filas hay en total. Esto garantiza R9/R10 automáticamente: la suma
  de los cuatro `base[key].count` sigue siendo `total` (cada fila reconocida
  aporta a exactamente un `base[key]`, igual que antes; las no reconocidas
  —R18— no aportan a ningún `base[key]` pero sí a `total`, igual que hoy).
- R19 (no negativos): cada fila suma a un único bucket; nunca se resta un
  valor que no se haya sumado primero del mismo conjunto de filas — no hay
  riesgo de contadores negativos porque no es una resta post-hoc sobre
  agregados ya cerrados, sino una decisión de bucket-destino por fila durante
  la agregación.
- `avg_billsec` y `pct` se recalculan exactamente igual que hoy (líneas
  117–122 actuales), después de la agregación con reclasificación ya
  aplicada.

### 3.3 Firma de `queryStats` — nuevo parámetro `lostDests`

```js
// Antes:
async function queryStats(pool, from, to, allowedChannels, direction = 'in')

// Después:
async function queryStats(pool, from, to, allowedChannels, direction = 'in', lostDests = ['s', 'hang', 'hangup'])
```

Mismo patrón ya usado por `queryQueues(pool, from, to, allowedChannels, queues,
lostDests)` (línea ~190), que recibe `lostDests` como argumento explícito en
vez de leer `config` directamente — `queryStats` permanece agnóstica de
`config`, solo recibe los valores ya resueltos.

**`fetchData()`** (línea ~363) pasa `lostDests` a las tres invocaciones de
`queryStats`:

```js
const lostDests = config.lostDestinations || ['s', 'hang', 'hangup']; // ya existe en línea 358

const [
  totalStats, totalChannels, totalHourly,
  inStats, inChannels, inHourly,
  outStats, outChannels,
  queues,
] = await Promise.all([
  queryStats(pool, from, to, allowedChannels, null,  lostDests),
  queryChannels(pool, from, to, allowedChannels, null),
  queryHourly(pool, from, to, allowedChannels, null),
  queryStats(pool, from, to, allowedChannels, 'in',  lostDests),
  queryChannels(pool, from, to, allowedChannels, 'in'),
  queryHourly(pool, from, to, allowedChannels, 'in'),
  queryStats(pool, from, to, allowedChannels, 'out', lostDests),
  queryChannels(pool, from, to, allowedChannels, 'out'),
  queryQueues(pool, from, to, allowedChannels, configQueues, lostDests),
]);
```

`lostDests` ya está definido en `startServer()` (línea 358:
`config.lostDestinations || ['s', 'hang', 'hangup']`) y ya se usa para
`queryQueues` — se reutiliza la misma constante, sin duplicar el default
(R7).

---

## 4. Dependencias npm

Ninguna nueva (R-ninguno explícito, pero confirmado: no se requiere ninguna
librería para este cambio — es agregación en memoria sobre filas ya
devueltas por `mysql2`).

---

## 5. Componentes frontend

### 5.1 `frontend/src/components/Dashboard.jsx`

**Sin cambios de código requeridos** (R21, ver §6 Decisión A). Las tarjetas
"Perdidas", "Contestadas", "Ocupado", "Fallidas" y "Total llamadas" ya leen:

```js
const answered = disp?.ANSWERED?.count   ?? 0;
const noAnswer = disp?.['NO ANSWER']?.count ?? 0;
const busy     = disp?.BUSY?.count       ?? 0;
const failed   = disp?.FAILED?.count     ?? 0;
const total    = data?.stats?.total ?? 0;
```

Tras esta feature, `noAnswer` (= `dispositions['NO ANSWER'].count`) refleja
automáticamente la definición ampliada de "Perdidas" (NO ANSWER ∪ dst ∈
lostDestinations), porque el backend ya hizo la reclasificación antes de
devolver `dispositions`.

**Ajuste textual opcional (no bloqueante):** la tarjeta "Perdidas" usa hoy
`sub="sin atender, del total"` (de `dashboard_kpi_breakdown` T3). Dado que
ahora "Perdidas" puede incluir llamadas `ANSWERED`/`BUSY`/`FAILED` cuyo `dst`
cayó en `lostDestinations` (p.ej. transferencias a una cola que colgó, buzón de
voz, etc.), el texto "sin atender" podría ser ligeramente impreciso en esos
casos. Se sugiere (no obligatorio, no forma parte de los criterios de
aceptación) cambiar el `sub` a algo como `"no efectivas, del total"` o
`"sin atender / con destino perdido"`. Si el implementer decide aplicar este
cambio cosmético, es una edición de **una línea de texto** en
`Dashboard.jsx` (el atributo `sub=` de la StatCard "Perdidas"), sin tocar
lógica, props, ni estructura — y debe documentarse en el commit como ajuste
menor de copy, no como nueva lógica.

### 5.2 `DispositionChart.jsx`, `ChannelTable.jsx`, `HourlyChart.jsx`

Ver §6 Decisión B — quedan **sin cambios** (limitación conocida y documentada,
no bloqueante para el acceptance).

---

## 6. Decisión técnica clave

### Decisión A — Reclasificación dentro de `dispositions['NO ANSWER']` (payload sin nuevo campo)

**Opción elegida:** Aplicar la reclasificación de R1–R5 **directamente** sobre
los buckets existentes de `dispositions` dentro de `queryStats` — es decir,
una llamada `ANSWERED` con `dst ∈ lostDestinations` se resta de
`dispositions.ANSWERED.count` y se suma a `dispositions['NO ANSWER'].count`.
El payload de salida **no añade ningún campo nuevo** (no hay
`dispositions.LOST`, ni `stats.lostByDestination`, ni similar).

Razones:
1. **R21 / no rehacer frontend**: `Dashboard.jsx` (feature #16, ya commiteada)
   ya lee `dispositions['NO ANSWER'].count` como fuente de "Perdidas" — con
   esta opción, el frontend obtiene automáticamente la definición ampliada sin
   ningún cambio de código.
2. **Preserva R9 (Total = suma de las 4 categorías) trivialmente**: como la
   reclasificación es un movimiento entre los mismos 4 buckets que ya suman
   `total`, la identidad se mantiene sin lógica adicional de reconciliación.
3. **Coherente con la semántica de "Perdidas" ya establecida** por
   `dashboard_kpi_breakdown`: "Perdidas" = "llamadas que no llegaron a buen
   destino", y `dispositions['NO ANSWER']` es exactamente el campo que el
   dashboard ya etiqueta como tal.

**Opción descartada — campo nuevo separado `dispositions.LOST` (o
`stats.lostTotal`) calculado independientemente:**

Descartada porque:
1. **Rompería R9 implícitamente o requeriría redefinir `total`**: si se añade
   un quinto campo `LOST` que se superpone parcialmente con `ANSWERED` /
   `BUSY` / `FAILED` / `'NO ANSWER'` (las llamadas reclasificadas seguirían
   contadas en su categoría original *y* en `LOST`), entonces `Total !=
   ANSWERED + 'NO ANSWER' + BUSY + FAILED + LOST` (doble conteo) — violaría R2
   de #16 a menos que se reformule `Total` como una fórmula distinta, lo cual
   contradice el requisito explícito del usuario de **mantener** `Total =
   Contestadas + Perdidas + Ocupado + Fallidas` con las **mismas 4
   categorías**.
2. **Requeriría cambios en `Dashboard.jsx`**: el frontend tendría que dejar de
   leer `dispositions['NO ANSWER'].count` y empezar a leer el nuevo campo,
   violando R21 y el principio de #16 R14 ("no modificar el payload si no es
   necesario").
3. **Es estrictamente más información sin más utilidad**: el usuario
   confirmó (decisión 4 del prompt) que la opción de reclasificación dentro de
   `dispositions['NO ANSWER']` es la preferida; esta alternativa solo se
   documenta para registro de la decisión descartada.

### Decisión B — `queryChannels`/`queryHourly`/`ChannelTable`/`HourlyChart`/`DispositionChart` quedan SIN cambios (limitación conocida documentada)

**Contexto:** `queryChannels` agrupa `channel, disposition`; `queryHourly`
agrupa `channel, HOUR(calldate), disposition`. Ninguna conoce `dst` hoy.
`DispositionChart` consume `data.stats.dispositions` (que SÍ se modifica por
esta feature, vía Decisión A); `ChannelTable` consume `channels` (de
`queryChannels`); `HourlyChart` consume `hourly` (de `queryHourly`).

**Opción elegida — (b): no extender `queryChannels`/`queryHourly`, documentar
como limitación conocida.**

Razones para recomendar (b) sobre (a):

1. **Alcance/costo no trivial**: extender `queryChannels` y `queryHourly` para
   aplicar la misma reclasificación requeriría:
   - Añadir `dst` a sus `SELECT`/`GROUP BY` (`queryHourly` pasaría de agrupar
     por `(channel, HOUR(calldate), disposition)` — ya 24 × N canales × 4
     disposiciones — a `(channel, HOUR(calldate), dst, disposition)`, con
     mayor cardinalidad de filas devueltas por hora).
   - Pasarles `lostDests` (mismo cambio de firma que `queryStats`).
   - Re-implementar el mismo algoritmo de reclasificación por fila dentro de
     cada función, duplicando lógica (o extraer un helper compartido —
     posible, pero amplía el diff y el riesgo de regresión en dos funciones
     adicionales que alimentan `ChannelTable` y `HourlyChart`, ambas en uso
     activo).
2. **DispositionChart SÍ queda consistente** con esta feature, porque consume
   directamente `stats.dispositions` (modificado por Decisión A) — es decir,
   el gráfico de pastel "Contestadas / No Contest. / Ocupado / Fallidas" en el
   dashboard principal **sí** reflejará la reclasificación. La inconsistencia
   solo afecta a `ChannelTable` (tabla de actividad por canal) y `HourlyChart`
   (gráfico por hora), que sumando sus columnas `ANSWERED`/`'NO
   ANSWER'`/`BUSY`/`FAILED`/`total` por canal/hora seguirán reflejando la
   clasificación **original** (sin `dst`), mientras que la tarjeta "Perdidas"
   del dashboard (consumidor de `stats.dispositions`) reflejará la
   clasificación **ampliada**.
3. **Discrepancia esperada y acotada**: la diferencia entre "Perdidas" (KPI
   general) y la suma de la columna `'NO ANSWER'` en `ChannelTable`/
   `HourlyChart` será exactamente igual al número de registros
   `ANSWERED`/`BUSY`/`FAILED` con `dst ∈ lostDestinations` (más los `NO
   ANSWER` con `dst ∉ lostDestinations` que ya coincidían). En instalaciones
   típicas donde `lostDestinations` por defecto (`['s','hang','hangup']`)
   representa una fracción pequeña de las llamadas `ANSWERED`/`BUSY`/`FAILED`
   (la mayoría de transferencias a `s`/`hang`/`hangup` ya terminan en `NO
   ANSWER` en la práctica de Asterisk/Issabel), se espera que la discrepancia
   sea pequeña o nula en la mayoría de instalaciones — pero **no se garantiza
   cero** y debe documentarse.
4. **Es reversible / extensible después**: si en el futuro se decide alinear
   `ChannelTable`/`HourlyChart`, es una feature incremental separada
   (`channel_table_lost_destinations` o similar) que reutiliza el mismo
   algoritmo de reclasificación (§3.2) ya implementado y probado para
   `queryStats`.

**Limitación documentada para el acceptance** (criterio explícito del
`feature_list.json`: *"El spec documenta si ChannelTable/HourlyChart/
DispositionChart ... quedan o no consistentes ... si no es trivial extenderlos,
se documenta como limitación conocida"*):

> **Limitación conocida:** Tras esta feature, la tarjeta "Perdidas" del
> dashboard (`stats.dispositions['NO ANSWER'].count`, y el pie chart
> `DispositionChart` que consume el mismo campo) reflejan la definición
> ampliada de "Perdidas" (NO ANSWER ∪ dst ∈ lostDestinations, con
> reclasificación). La tabla `ChannelTable` (columna "No Contest." por canal,
> de `queryChannels`) y `HourlyChart` (serie "NO ANSWER" por hora, de
> `queryHourly`) **NO** aplican esta reclasificación — siguen mostrando la
> clasificación original por `disposition` sin considerar `dst`. Por lo tanto,
> la suma de "No Contest." en `ChannelTable` (o de la serie `'NO ANSWER'` en
> `HourlyChart`) puede ser **menor o igual** que el valor de la tarjeta
> "Perdidas" del dashboard, en la diferencia exacta de registros
> `ANSWERED`/`BUSY`/`FAILED` con `dst ∈ lostDestinations` reclasificados. Si
> esta discrepancia resulta confusa para los operadores, una feature futura
> puede extender `queryChannels`/`queryHourly` reutilizando el algoritmo de
> §3.2.

**Si el humano prefiere la opción (a)** (extender también `queryChannels` y
`queryHourly`), el cambio adicional sería: extraer el algoritmo de
reclasificación de §3.2 a un helper `reclassifyRow(base, row, lostDests)`
compartido, añadir `dst` a los tres `SELECT`/`GROUP BY`, y pasar `lostDests` a
las tres funciones desde `fetchData`. Esto se deja fuera del alcance de
`tasks.md` salvo aprobación explícita, por el aumento de diff/riesgo descrito
arriba.

---

## 7. Compatibilidad v1.0

- **Ningún endpoint cambia** de ruta, método, status code o forma de payload:
  `/api/calls/today`, `/api/calls/range`, `/api/events` (SSE) permanecen
  idénticos en estructura (R20). Solo cambian los **valores** dentro de
  `stats.dispositions` / `inbound.stats.dispositions` /
  `outbound.stats.dispositions` cuando hay registros con `dst ∈
  lostDestinations` y `disposition` ∈ {ANSWERED, BUSY, FAILED}.
- `queryQueues`, `extractChannel`, `passesFilter`, `todayRange`,
  `toMySQLDate`, `queryChannels`, `queryHourly` — **ninguna se modifica**
  (R15, R22; ver §6 Decisión B para `queryChannels`/`queryHourly`).
- El bloque de colas (`config.queues`/`__lost__`, feature #16 R7/R8) sigue
  funcionando exactamente igual — `queryQueues` ya recibe `lostDests` desde
  `fetchData` (sin cambios) y sigue calculando su propio `__lost__` de forma
  independiente (R15, R16). Ambos cálculos ("Perdidas" general vía
  `dispositions['NO ANSWER']` reclasificado, y `__lost__` por cola vía
  `queryQueues`) coexisten sin conflicto: usan el mismo `lostDests` pero
  producen agregados distintos para propósitos distintos (KPI general vs.
  desglose por cola).
- `frontend/src/components/Dashboard.jsx` — **sin cambios funcionales**
  requeridos (R21); ver §5.1 para un ajuste cosmético opcional de texto.
- `InboundView.jsx`, `OutboundView.jsx`, `HistoricalView.jsx`,
  `ChannelAliasManager.jsx`, `Layout.jsx`, `App.jsx` — sin cambios.
- Si `config.lostDestinations` no está definido, el comportamiento es
  idéntico al de `dashboard_kpi_breakdown` (R8): "Perdidas" =
  `dispositions['NO ANSWER'].count` sin reclasificación adicional, **porque el
  default `['s','hang','hangup']` normalmente no coincide con ningún `dst` de
  llamadas `ANSWERED`/`BUSY`/`FAILED` reales** — pero si coincidiera, sí se
  reclasificarían (comportamiento correcto y esperado según R1, R7).

---

## 8. Estrategia de testing — limitación de arquitectura a tener en cuenta

`backend/server.js` es un script auto-ejecutable: define `queryStats` y demás
funciones como funciones internas (no exportadas vía `module.exports`) y
termina con `startServer().catch(...)` que llama a `app.listen()`
inmediatamente al hacer `require('../server')`. **No es importable de forma
segura en tests** (patrón ya observado en `backend/tests/inbound.test.js`, que
**replica/mirror** una copia local de `extractChannel` en vez de importarla de
`server.js`).

**Enfoque para `tasks.md` (T6):** el archivo de test
`backend/tests/dashboard_lost_destinations.test.js` define una **copia local**
de la función `queryStats` modificada (idéntica a la implementación de §3.2
que el implementer escribirá en `server.js`), siguiendo el mismo patrón que
`inbound.test.js` usa para `extractChannel`. El test:
1. Mockea `pool.query` para devolver filas `{ channel, dst, disposition,
   count, total_duration, total_billsec }` (igual que
   `backend/tests/stats.test.js` mockea `pool.query` con
   `jest.fn().mockResolvedValue([rows])`).
2. Invoca la copia local de `queryStats(pool, from, to, allowedChannels,
   direction, lostDests)` con distintos escenarios (R1–R19).
3. Verifica los valores resultantes de `dispositions` y `total`.

Esta copia local debe mantenerse **textualmente idéntica** a la función real
en `server.js` (mismo algoritmo de §3.2) — el `reviewer` debe verificar que
ambas coincidan línea por línea (o al menos en lógica) al cerrar la feature,
para evitar que el test "mienta" sobre el comportamiento real. Esta es la
misma limitación ya aceptada implícitamente por `inbound.test.js` /
`outbound.test.js` para `extractChannel`, y no es una regresión introducida
por esta feature — es el patrón establecido del proyecto para probar lógica
que vive en `server.js`.

**Alternativa NO elegida**: refactorizar `server.js` para exportar `queryStats`
vía `module.exports` y separar `startServer()`/`app.listen()` en un bloque
condicional (`if (require.main === module)`). Esto permitiría imports directos
en tests, pero **excede el alcance de esta feature** (modificaría la
estructura general de `server.js`, fuera de R1–R23, y de la regla dura "no
reescribir lo que ya funciona" / "no cambiar la estructura de server.js" salvo
el cambio mínimo de §3.3). Si el equipo desea esto, debería ser una feature de
refactor explícita y separada, aprobada independientemente.
