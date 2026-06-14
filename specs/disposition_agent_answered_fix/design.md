# design.md — disposition_agent_answered_fix

> Feature #21. Generaliza el criterio de "Contestada" introducido
> implícitamente por `disposition='ANSWERED'`, definiendo "atendida por
> agente" a partir de `dstchannel`, y aplica la reclasificación resultante de
> forma consistente en `queryStats`, `queryChannels` y `queryHourly`,
> cerrando la limitación conocida de la feature #17.

---

## 1. Endpoints nuevos

Ninguno. Esta feature **no añade ni modifica rutas**. Los endpoints
existentes mantienen exactamente su forma de payload:

| Método | Ruta | Auth | Cambio |
|---|---|---|---|
| GET | `/api/calls/today` | Sesión | Sin cambio de forma; valores numéricos de `stats`, `channels`, `hourly` (e `inbound`/`outbound` equivalentes) reflejan la reclasificación R1–R13 |
| GET | `/api/calls/range` | Sesión | Igual que arriba |
| GET | `/api/events` (SSE `init`/`update`) | Sesión | Igual que arriba |
| GET | `/api/calls/inbound`, `/api/calls/outbound` (+ export) | Sesión | Sin cambio — estos endpoints devuelven registros CDR individuales (no agregados); no usan `queryStats`/`queryChannels`/`queryHourly` y por tanto no se ven afectados |
| GET/PUT | `/api/admin/channels*` | Admin | Sin cambio |

---

## 2. Cambios BD SQLite

Ninguno. No se requiere persistencia adicional — toda la lógica es agregación
en memoria sobre filas ya devueltas por `mysql2` desde el CDR (solo lectura).

---

## 3. Queries CDR nuevas

### 3.1 Helper compartido — `resolveDisposition(row, lostDests)`

Se extrae un helper puro, compartido por `queryStats`, `queryChannels` y
`queryHourly`, que decide el "bucket de disposición efectivo" de una fila tras
aplicar **ambos** criterios de reclasificación (lostDestinations de #17 y
agente de #21):

```js
const AGENT_DSTCHANNEL_RE = /^(Agent\/\d+|SIP\/\d+-)/;

/**
 * Devuelve la clave de disposición efectiva ('ANSWERED' | 'NO ANSWER' |
 * 'BUSY' | 'FAILED' | null) tras aplicar las reclasificaciones de #17 y #21.
 * `row` debe incluir { dst, dstchannel, disposition }.
 */
function resolveDisposition(row, lostDests) {
  const d = row.disposition.toUpperCase();
  let targetKey = ['ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED'].includes(d) ? d : null;
  if (!targetKey) return null; // disposición no reconocida (igual que v1.0)

  // #17: dst en lostDestinations reclasifica cualquier disposición hacia 'NO ANSWER'
  const isLostDst = lostDests.includes(row.dst);
  if (isLostDst && targetKey !== 'NO ANSWER') {
    targetKey = 'NO ANSWER';
  }

  // #21: ANSWERED sin dstchannel de agente reclasifica hacia 'NO ANSWER'
  if (targetKey === 'ANSWERED' && !AGENT_DSTCHANNEL_RE.test(row.dstchannel || '')) {
    targetKey = 'NO ANSWER';
  }

  return targetKey;
}
```

Notas de diseño:
- El orden de las dos comprobaciones es irrelevante para el resultado final
  (ambas, si aplican, apuntan a `'NO ANSWER'`); se evalúan en este orden por
  legibilidad y porque así se documenta el orden histórico (primero #17,
  luego #21).
- R5/R6: si una fila cumple **ambos** criterios (p.ej. `dst` en
  `lostDestinations` y `dstchannel` vacío con `disposition='ANSWERED'`),
  `targetKey` termina en `'NO ANSWER'` por cualquiera de las dos ramas — se
  suma una sola vez, sin doble conteo, porque `targetKey` es una única
  variable que se sobrescribe, no se acumula dos veces.
- R4/R6: si `disposition` es `'BUSY'` o `'FAILED'`, la rama de #21
  (`targetKey === 'ANSWERED'`) nunca se cumple — el criterio de `dstchannel`
  solo afecta a registros `ANSWERED`, exactamente como pide R4.
- `AGENT_DSTCHANNEL_RE` se evalúa sobre `row.dstchannel` **crudo**, sin pasar
  por `extractChannel` (R19) — los prefijos `Agent/<n>` y `SIP/<n>-` ya son
  estables sin necesidad de limpieza de sufijo.

### 3.2 `queryStats` — SELECT modificado (añade `dstchannel`)

```sql
SELECT
  channel,
  dst,
  dstchannel,
  disposition,
  COUNT(*)                    AS count,
  COALESCE(SUM(duration), 0)  AS total_duration,
  COALESCE(SUM(billsec), 0)   AS total_billsec
FROM cdr
WHERE calldate >= ? AND calldate < ?
GROUP BY channel, dst, dstchannel, disposition
```

Cambios respecto al SQL actual (post-#17, `backend/server.js` línea ~103):
- Se añade `dstchannel` al `SELECT` y al `GROUP BY`.
- Los parámetros preparados (`?`, `[from, to]`) no cambian.
- No se usa `SELECT *` (regla dura del proyecto).

**Impacto de cardinalidad**: añadir `dstchannel` al `GROUP BY` aumenta el
número de filas devueltas (cada `dstchannel` distinto por `channel`/`dst`/
`disposition` genera una fila adicional — en la práctica, una fila por agente
que atendió esa combinación). El rango sigue acotado por
`(canales × destinos distintos × dstchannels distintos × 4 disposiciones)`
para el período consultado; sigue siendo un `GROUP BY` agregado con `WHERE
calldate >= ? AND calldate < ?` (índice en `calldate`), no una consulta de
filas individuales — mismo patrón de rendimiento aceptado en #17.

Cuerpo de la función (algoritmo de agregación):

```js
let total = 0;
for (const r of rows) {
  if (!passesFilter(r.channel, inboundChannels, outboundChannels, direction)) continue;

  const targetKey = resolveDisposition(r, lostDests);
  if (targetKey) {
    base[targetKey].count          += Number(r.count);
    base[targetKey].total_duration += Number(r.total_duration);
    base[targetKey].total_billsec  += Number(r.total_billsec);
  }
  total += Number(r.count);
}
```

El resto de `queryStats` (cálculo de `avg_billsec` y `pct`, R10) no cambia
respecto a #17.

### 3.3 `queryChannels` — SELECT modificado (añade `dst`, `dstchannel`)

```sql
SELECT
  channel,
  dst,
  dstchannel,
  disposition,
  COUNT(*)                    AS count,
  COALESCE(SUM(billsec), 0)  AS total_billsec
FROM cdr
WHERE calldate >= ? AND calldate < ?
GROUP BY channel, dst, dstchannel, disposition
```

Cuerpo:

```js
const map = {};
for (const r of rows) {
  if (!passesFilter(r.channel, inboundChannels, outboundChannels, direction)) continue;
  const ch = extractChannel(r.channel);
  if (!map[ch]) {
    map[ch] = { channel: ch, ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0, total: 0, total_billsec: 0 };
  }

  const targetKey = resolveDisposition(r, lostDests);
  if (targetKey) {
    map[ch][targetKey] += Number(r.count);
  }
  map[ch].total         += Number(r.count);
  map[ch].total_billsec += Number(r.total_billsec);
}
```

Nueva firma: `queryChannels(pool, from, to, inboundChannels, outboundChannels,
direction = 'in', lostDests = ['s', 'hang', 'hangup'])` — mismo patrón de
parámetro `lostDests` ya usado por `queryStats` desde #17.

### 3.4 `queryHourly` — SELECT modificado (añade `dst`, `dstchannel`)

```sql
SELECT
  channel,
  dst,
  dstchannel,
  HOUR(calldate) AS hour,
  disposition,
  COUNT(*)       AS count
FROM cdr
WHERE calldate >= ? AND calldate < ?
GROUP BY channel, dst, dstchannel, HOUR(calldate), disposition
ORDER BY hour
```

Cuerpo:

```js
for (const r of rows) {
  if (!passesFilter(r.channel, inboundChannels, outboundChannels, direction)) continue;
  const h = Number(r.hour);

  const targetKey = resolveDisposition(r, lostDests);
  if (targetKey) {
    hours[h][targetKey] += Number(r.count);
  }
  hours[h].total += Number(r.count);
}
```

Nueva firma: `queryHourly(pool, from, to, inboundChannels, outboundChannels,
direction = 'in', lostDests = ['s', 'hang', 'hangup'])`.

**Impacto de cardinalidad (queryHourly)**: `GROUP BY` pasa de `(channel, hour,
disposition)` a `(channel, dst, dstchannel, hour, disposition)`. Esto es el
mayor incremento de cardinalidad de los tres cambios, pero sigue siendo un
agregado MySQL sobre un rango acotado por `calldate` (RNF-02, < 10 s para
consultas históricas) — no se introduce `LIMIT` porque, igual que en #17,
`queryHourly` opera sobre agregados, no sobre filas individuales exportables.

### 3.5 `queryQueues` — sin cambios de SQL ni de criterio (R17)

`queryQueues` (feature #16/#17) **no se modifica**. Sigue agrupando por
`channel, dst, disposition` y clasificando por cola usando `disposition`
"en crudo" (sin el criterio de `dstchannel`). Esto es una discrepancia
intencional y documentada (ver sección 6, Decisión C): el desglose por cola
(`queues[*].ANSWERED`) responde a la pregunta "¿cuántas llamadas a esta cola
terminaron con `disposition=ANSWERED`?", mientras que el KPI global
"Contestadas" (`stats.dispositions.ANSWERED`) responde a "¿cuántas llamadas
fueron atendidas por un agente real?" — son métricas distintas y
complementarias.

### 3.6 Nueva firma — resumen

```js
// Antes (post-#20):
async function queryStats(pool, from, to, inboundChannels, outboundChannels, direction = 'in', lostDests = ['s', 'hang', 'hangup'])
async function queryChannels(pool, from, to, inboundChannels, outboundChannels, direction = 'in')
async function queryHourly(pool, from, to, inboundChannels, outboundChannels, direction = 'in')

// Después (#21):
async function queryStats(pool, from, to, inboundChannels, outboundChannels, direction = 'in', lostDests = ['s', 'hang', 'hangup'])  // sin cambio de firma, solo SQL + cuerpo
async function queryChannels(pool, from, to, inboundChannels, outboundChannels, direction = 'in', lostDests = ['s', 'hang', 'hangup'])  // + lostDests
async function queryHourly(pool, from, to, inboundChannels, outboundChannels, direction = 'in', lostDests = ['s', 'hang', 'hangup'])    // + lostDests
```

`fetchData()` (dentro de `startServer()`, bloque `Promise.all`) pasa
`lostDests` también a `queryChannels` y `queryHourly` en las tres invocaciones
de cada una (total/in/out), reutilizando la misma constante `lostDests =
config.lostDestinations || ['s', 'hang', 'hangup']` ya definida en la línea
~414 (sin duplicar el default).

---

## 4. Dependencias npm

Ninguna nueva. Es agregación en memoria sobre filas ya devueltas por
`mysql2`; el regex `AGENT_DSTCHANNEL_RE` usa `RegExp` nativo de JS.

---

## 5. Componentes frontend

**Sin cambios de código requeridos.** Los componentes ya consumen los campos
existentes:

- `Dashboard.jsx` lee `data.stats.dispositions.ANSWERED.count` /
  `dispositions['NO ANSWER'].count` (StatCards "Contestadas"/"Perdidas") y
  `DispositionChart` consume el mismo `stats.dispositions` — tras esta
  feature, ambos reflejan automáticamente la reclasificación R1–R10.
- `ChannelTable.jsx` consume `channels[*]` (de `queryChannels`) — tras esta
  feature (R11), sus columnas `ANSWERED`/`'NO ANSWER'` quedan consistentes con
  el KPI global.
- `HourlyChart.jsx` consume `hourly[*]` (de `queryHourly`) — tras esta feature
  (R12), su serie `ANSWERED`/`'NO ANSWER'` queda consistente con el KPI
  global.
- `InboundView.jsx`, `OutboundView.jsx`, `HistoricalView.jsx`,
  `ChannelAliasManager.jsx`, `Layout.jsx`, `App.jsx` — sin cambios; no
  consumen `queryStats`/`queryChannels`/`queryHourly` de forma que requiera
  ajuste (`InboundView`/`OutboundView`/`HistoricalView` usan los mismos
  payloads de `/api/calls/range`, que ya se actualizan automáticamente).

**Verificación manual recomendada** (no bloqueante, sin cambio de código):
tras desplegar, comparar visualmente que la suma de la columna "Contestadas"
de `ChannelTable` para `direction=in` coincida con el valor de la StatCard
"Contestadas" del dashboard para el mismo rango de fechas — confirma R11 en
producción.

---

## 6. Decisión técnica clave

### Decisión A — Helper compartido `resolveDisposition` vs. duplicar la lógica en las 3 funciones

**Elegido**: extraer `resolveDisposition(row, lostDests)` como función pura
compartida por `queryStats`, `queryChannels` y `queryHourly` (sección 3.1).

**Descartado**: copiar el bloque `if/else` de reclasificación dentro de cada
una de las tres funciones por separado.

**Razón**: el propio `design.md` de #17 (sección 6, Decisión B) identificó
"duplicar lógica en funciones adicionales" como el principal riesgo de
extender `queryChannels`/`queryHourly`. Un helper compartido:
1. Garantiza R11/R12/R13 (consistencia entre las tres funciones) por
   construcción — un único punto de verdad para "¿en qué bucket cae esta
   fila?".
2. Reduce el riesgo de que una futura feature corrija el criterio en una
   función y olvide las otras dos (el bug que esta misma feature corrige para
   #17).
3. Es trivialmente testeable de forma aislada (un `it()` por combinación
   `disposition`/`dst`/`dstchannel`), independiente de mockear `pool.query`
   tres veces.

### Decisión B — Reclasificación dentro de los buckets existentes (sin nuevo campo), igual que #17

**Elegido**: igual que la Decisión A de #17 — la reclasificación mueve el
conteo entre los buckets `ANSWERED`/`'NO ANSWER'`/`BUSY`/`FAILED` ya
existentes en `dispositions`, `channels[*]` y `hourly[*]`. No se añade
`dispositions.LOST`, ni `channels[*].noAgent`, ni campos similares.

**Razón**: por las mismas razones que #17 (preserva R9/R21 trivialmente, no
requiere cambios de frontend, mantiene la semántica ya establecida de
"Perdidas" = "no atendida efectivamente").

### Decisión C — `queryQueues` (desglose por cola) NO aplica el criterio de `dstchannel` (R17)

**Elegido**: `queryQueues` se mantiene sin cambios; el desglose `queues[*]`
sigue clasificando por `disposition` "en crudo" (ya reclasificado solo por
`lostDestinations`, como en #17, vía su propio parámetro `lostDests` —
sin cambios respecto a hoy).

**Descartado**: aplicar también `resolveDisposition` (con el criterio de
`dstchannel`) dentro de `queryQueues`, de modo que `queues['8000'].ANSWERED`
también excluya las llamadas a la cola 8000 sin agente.

**Razón**:
1. **Fuera del alcance de los acceptance criteria de #21**: el `feature_list.json`
   de #21 menciona explícitamente `queryStats`, `queryChannels` y
   `queryHourly` (y `ChannelTable`/`HourlyChart`/`DispositionChart`/KPI
   "Contestadas"); no menciona `queryQueues` ni el desglose por cola
   (`QueueCard`, introducido en #16).
2. **Cambiaría la semántica de una métrica ya consolidada**: `queues[*]`
   responde "¿qué pasó con las llamadas a esta cola, según el CDR?" — una
   pregunta operativa sobre el flujo de la cola en sí (cuántas terminaron en
   IVR sin agente vs. con agente vs. colgadas). Forzarla a usar el mismo
   criterio que el KPI global duplicaría/contradiría
   `result['__lost__']` (que ya agrupa `dst` en `lostDestinations`) con una
   nueva fuente de "perdidas por cola sin agente", mezclando dos conceptos en
   el mismo bucket `__lost__`.
3. **Riesgo de doble conteo cruzado entre `queues[*]` y `__lost__`** si no se
   diseña con cuidado adicional — se prefiere dejarlo como una feature
   incremental futura, explícitamente fuera de alcance, si el equipo decide
   que el desglose por cola también debe reflejar "atendida por agente".

**Documentación de la discrepancia (limitación conocida, análoga a la de
#17 ahora resuelta para Channels/Hourly pero introducida aquí para
Queues)**:

> **Limitación conocida**: tras esta feature, `stats.dispositions.ANSWERED`,
> `channels[*].ANSWERED` y `hourly[*].ANSWERED` (KPI "Contestadas" del
> dashboard, `ChannelTable`, `HourlyChart`, `DispositionChart`) excluyen las
> llamadas a una cola configurada (`dst` en `config.queues`) que terminaron
> con `disposition='ANSWERED'` pero sin que un agente (`dstchannel` ~
> `Agent/<n>` o `SIP/<n>-`) las atendiera — esas llamadas se cuentan en
> `'NO ANSWER'` ("Perdidas"). Sin embargo, `queues['8000'].ANSWERED` /
> `queues['8300'].ANSWERED` (el desglose por cola de `QueueCard`, feature #16)
> **siguen contando esas mismas llamadas como `ANSWERED`** para esa cola,
> porque `queryQueues` no aplica el criterio de `dstchannel` (Decisión C). Es
> decir, una llamada puede aparecer en `queues['8000'].ANSWERED = 1` y
> simultáneamente contribuir a `stats.dispositions['NO ANSWER'].count` (no a
> `stats.dispositions.ANSWERED.count`). Esto es intencional: el desglose por
> cola describe el resultado de la cola desde la perspectiva del IVR/Asterisk
> (`disposition` crudo), mientras que el KPI global describe si un humano
> atendió la llamada. Si esta discrepancia resulta confusa para los
> operadores, una feature futura puede aplicar `resolveDisposition` también
> dentro de `queryQueues`, añadiendo un bucket adicional (p.ej.
> `queues[q].answeredByAgent` junto a `queues[q].ANSWERED`) sin romper el
> contrato actual.

---

## 7. Compatibilidad con v1.0

- **`/api/calls/today`, `/api/calls/range`, SSE `init`/`update`**: misma forma
  de respuesta (R14–R16, R21). Cambian únicamente los **valores numéricos**
  dentro de `stats.dispositions`, `channels[*]`, `hourly[*]` (y sus
  equivalentes `inbound.*`/`outbound.*`) cuando existen registros
  `ANSWERED` con `dstchannel` que no matchea `/^Agent\/\d+/` ni `/^SIP\/\d+-/`.
- **`/api/calls/inbound`, `/api/calls/outbound` (+ export)**: sin cambios —
  no usan `queryStats`/`queryChannels`/`queryHourly`.
- **`queryQueues`, `extractChannel`, `passesFilter`, `todayRange`,
  `toMySQLDate`**: ninguna se modifica (R17; ver Decisión C para
  `queryQueues`).
- **`config.lostDestinations` / `config.queues`**: sin cambios de formato ni
  de defaults (`['s','hang','hangup']` y `['8000','8300']`
  respectivamente); el nuevo criterio de `dstchannel` no introduce ninguna
  clave de configuración nueva — es un regex fijo (`/^(Agent\/\d+|SIP\/\d+-)/`),
  no configurable, según el criterio acordado con el usuario (no negociable).
- **Frontend**: sin cambios funcionales requeridos (sección 5). Los
  componentes existentes consumen automáticamente los valores reclasificados.
- **CDR (MySQL `asteriskcdrdb`)**: ninguna escritura; las tres queries
  modificadas siguen siendo `SELECT` con parámetros `?` (R20), solo añaden
  `dst`/`dstchannel` al `SELECT`/`GROUP BY` de `queryChannels`/`queryHourly`
  (y `dstchannel` al de `queryStats`, que ya tenía `dst` desde #17).
