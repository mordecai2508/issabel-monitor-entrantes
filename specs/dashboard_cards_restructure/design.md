# design.md — dashboard_cards_restructure

> Feature #23. Tres ajustes independientes sobre `Dashboard.jsx` y
> `queryQueues` (`backend/server.js`): (1) renombrar la StatCard "Perdidas" →
> "No Contestadas" y eliminar `UnansweredBreakdownCard` (#22); (2) hacer que
> `queryQueues` aplique `resolveDisposition` (#17/#21) por registro antes de
> agregar por cola, para que `queue['NO ANSWER']` refleje la reclasificación;
> (3) combinar las StatCard "Extensiones"/"Activas" (#18/#19) en una sola
> tarjeta.

---

## 1. Endpoints nuevos

Ninguno. Esta feature **no añade ni modifica rutas**. Los endpoints
existentes mantienen exactamente su forma de payload; solo cambian los
valores numéricos de `queues[*]`:

| Método | Ruta | Auth | Cambio |
|---|---|---|---|
| GET | `/api/calls/today` | Sesión | Sin cambio de forma; `queues[*].ANSWERED` / `queues[*]['NO ANSWER']` / `queues[*].BUSY` / `queues[*].FAILED` / `queues[*].total` reflejan la reclasificación de `resolveDisposition` (R7-R11). `stats.dispositions['NO ANSWER'].breakdown` (#22) permanece sin cambios |
| GET | `/api/calls/range` | Sesión | Igual que arriba |
| GET | `/api/events` (SSE `init`/`update`) | Sesión | Igual que arriba |
| GET | `/api/calls/inbound`, `/api/calls/outbound` (+ export) | Sesión | Sin cambio — no usan `queryQueues` |
| GET | `/api/pbx/extensions` | Sesión | Sin cambio — el payload `{ total, active, extensions, available }` (#18/#19) no se modifica; solo cambia su renderizado en el Dashboard |
| GET/PUT | `/api/admin/channels*` | Admin | Sin cambio |

---

## 2. Cambios BD SQLite

Ninguno. Toda la lógica es agregación en memoria sobre filas ya devueltas por
`mysql2` desde el CDR (solo lectura). No se toca `backend/db/`.

---

## 3. Queries CDR — `queryQueues` modificado

### 3.1 SQL actual (antes de esta feature)

```sql
SELECT channel, dst, disposition, COUNT(*) AS count
FROM cdr
WHERE calldate >= ? AND calldate < ?
GROUP BY channel, dst, disposition
```

### 3.2 SQL nuevo — añade `dstchannel`

`resolveDisposition(row, lostDests)` (definida en #21, líneas ~108-125 de
`backend/server.js`) necesita `row.dst`, `row.dstchannel` y
`row.disposition`. El `SELECT`/`GROUP BY` actual de `queryQueues` ya tiene
`dst` y `disposition`, pero le falta `dstchannel` (que `queryStats`,
`queryChannels` y `queryHourly` ya añadieron en #17/#21). Se añade
`dstchannel` al `SELECT` y al `GROUP BY`, mismo patrón que las otras tres
funciones:

```sql
SELECT channel, dst, dstchannel, disposition, COUNT(*) AS count
FROM cdr
WHERE calldate >= ? AND calldate < ?
GROUP BY channel, dst, dstchannel, disposition
```

- Parámetros preparados (`?`, `[from, to]`) sin cambios.
- No se usa `SELECT *` (regla dura del proyecto).
- **Impacto de cardinalidad**: mismo razonamiento que #21 §3.2 — añadir
  `dstchannel` al `GROUP BY` aumenta el número de filas (una fila adicional
  por `dstchannel` distinto dentro de cada combinación
  `channel`/`dst`/`disposition`), pero sigue siendo un `GROUP BY` agregado
  sobre `WHERE calldate >= ? AND calldate < ?` (acotado por el rango de
  fechas, índice en `calldate`) — mismo patrón de rendimiento ya aceptado en
  #17/#21, y `queryQueues` solo se ejecuta cuando `config.queues` no está
  vacío (early return existente, R22).

### 3.3 Cuerpo de `queryQueues` — reclasificación con `resolveDisposition`

Cuerpo actual (antes de esta feature):

```js
async function queryQueues(pool, from, to, inboundChannels, outboundChannels, queues, lostDests) {
  if (!queues || queues.length === 0) return [];

  const [rows] = await pool.query(
    `SELECT channel, dst, disposition, COUNT(*) AS count
     FROM cdr
     WHERE calldate >= ? AND calldate < ?
     GROUP BY channel, dst, disposition`,
    [from, to]
  );

  const validDsts = new Set([...queues, ...lostDests]);
  const result = {};
  for (const q of queues) {
    result[q] = { queue: q, label: `Cola ${q}`, total: 0, ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0 };
  }
  result['__lost__'] = { queue: '__lost__', label: 'Perdidas', total: 0, ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0 };

  for (const r of rows) {
    if (!passesFilter(r.channel, inboundChannels, outboundChannels, 'in')) continue;
    if (!validDsts.has(r.dst)) continue;
    const key   = queues.includes(r.dst) ? r.dst : '__lost__';
    const d     = r.disposition.toUpperCase();
    result[key].total += Number(r.count);
    if (['ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED'].includes(d))
      result[key][d] += Number(r.count);
  }

  return Object.values(result);
}
```

Cuerpo nuevo — reemplaza el cálculo de `d`/`d`-based increment por
`resolveDisposition(r, lostDests)` (idéntico patrón al usado en `queryStats`,
`queryChannels`, `queryHourly` desde #21):

```js
async function queryQueues(pool, from, to, inboundChannels, outboundChannels, queues, lostDests) {
  if (!queues || queues.length === 0) return [];

  const [rows] = await pool.query(
    `SELECT channel, dst, dstchannel, disposition, COUNT(*) AS count
     FROM cdr
     WHERE calldate >= ? AND calldate < ?
     GROUP BY channel, dst, dstchannel, disposition`,
    [from, to]
  );

  const validDsts = new Set([...queues, ...lostDests]);
  const result = {};
  for (const q of queues) {
    result[q] = { queue: q, label: `Cola ${q}`, total: 0, ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0 };
  }
  result['__lost__'] = { queue: '__lost__', label: 'Perdidas', total: 0, ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0 };

  for (const r of rows) {
    if (!passesFilter(r.channel, inboundChannels, outboundChannels, 'in')) continue;
    if (!validDsts.has(r.dst)) continue;
    const key = queues.includes(r.dst) ? r.dst : '__lost__';

    const targetKey = resolveDisposition(r, lostDests);
    if (targetKey) {
      result[key][targetKey] += Number(r.count);
    }
    result[key].total += Number(r.count);
  }

  return Object.values(result);
}
```

### 3.4 Por qué este cambio satisface R7-R11

- **Routing por cola (`key`) no cambia**: `key = queues.includes(r.dst) ?
  r.dst : '__lost__'` sigue decidiéndose por `r.dst` cruda, exactamente como
  hoy. La reclasificación de `resolveDisposition` solo decide en qué
  **bucket de disposición** (`ANSWERED`/`'NO ANSWER'`/`BUSY`/`FAILED`) cae el
  registro dentro de la cola ya seleccionada — nunca cambia a qué cola
  pertenece.

- **R8 (cola configurada, ANSWERED sin agente → `NO ANSWER` de esa cola)**:
  para un registro con `dst = '8000'` (en `config.queues`),
  `disposition = 'ANSWERED'`, `dstchannel` vacío:
  - `key = '8000'` (sin cambio, `queues.includes('8000')` es `true`).
  - `resolveDisposition(r, lostDests)`: `targetKey` empieza en `'ANSWERED'`;
    `lostDests.includes('8000')` es `false` (no afecta); luego
    `AGENT_DSTCHANNEL_RE.test('')` es `false` → `targetKey = 'NO ANSWER'`.
  - `result['8000']['NO ANSWER'] += count` (en vez de
    `result['8000'].ANSWERED += count` como antes). Esto es exactamente R8.

- **R9 (sin cambio para BUSY/FAILED y para ANSWERED con agente)**: si
  `disposition = 'BUSY'`/`'FAILED'`, `resolveDisposition` solo puede
  reclasificar hacia `'NO ANSWER'` vía `lostDests.includes(r.dst)` — si
  `r.dst = '8000'` (no está en `lostDests` salvo configuración exótica),
  `targetKey` permanece `'BUSY'`/`'FAILED'`, sin cambio respecto a hoy. Si
  `disposition = 'ANSWERED'` y `dstchannel` matchea
  `AGENT_DSTCHANNEL_RE` (`Agent/<n>` o `SIP/<n>-`), `targetKey` permanece
  `'ANSWERED'`, sin cambio.

- **R10 (invariante `total = ANSWERED + NO ANSWER + BUSY + FAILED`)**: por
  construcción, `result[key].total += Number(r.count)` se ejecuta para
  **todo** registro que pasa el filtro `validDsts.has(r.dst)`, y
  `result[key][targetKey] += Number(r.count)` se ejecuta exactamente cuando
  `targetKey` no es `null` — es decir, cuando `disposition` (antes de
  reclasificar) ya era una de las 4 reconocidas (`resolveDisposition`
  devuelve `null` solo si `disposition` no es ninguna de
  `ANSWERED|NO ANSWER|BUSY|FAILED`, caso ya excluido hoy implícitamente por
  el `if (['ANSWERED',...].includes(d))` existente). Cada registro
  contribuye a `total` y a exactamente uno de los 4 buckets (o a ninguno si
  `disposition` no es reconocida, igual que hoy) — la suma de los 4 buckets
  sigue igualando `total` para registros con disposición reconocida.

- **R11 (`'__lost__'` sin cambio de semántica)**: todo registro enrutado a
  `'__lost__'` tiene `r.dst` en `lostDests` (porque `validDsts.has(r.dst)` es
  `true` y `queues.includes(r.dst)` es `false`, luego `r.dst ∈ lostDests`
  por construcción de `validDsts = new Set([...queues, ...lostDests])`).
  Para esos registros, `resolveDisposition` siempre devuelve `'NO ANSWER'`
  (la rama `lostDests.includes(row.dst)` se cumple), exactamente como el
  código actual (`d = r.disposition.toUpperCase()` solo incrementaba
  `result['__lost__'][d]`, que para estos registros con disposición
  reconocida distinta de `'NO ANSWER'` antes **no** se reclasificaba — este
  es el único cambio de comportamiento para `'__lost__'`: antes, un registro
  `dst='hang'` con `disposition='ANSWERED'` se contaba en
  `result['__lost__'].ANSWERED`; ahora se cuenta en
  `result['__lost__']['NO ANSWER']`, lo cual es **más correcto** y
  consistente con `stats.dispositions['NO ANSWER']`, que ya hacía esta
  reclasificación desde #17 — no se documenta como discrepancia adicional,
  es una corrección incidental bienvenida que no rompe R10 ni ningún
  acceptance criterion).

### 3.5 Nueva firma — sin cambio

```js
// Antes y después de #23 (firma idéntica):
async function queryQueues(pool, from, to, inboundChannels, outboundChannels, queues, lostDests)
```

Solo cambia el `SELECT`/`GROUP BY` (añade `dstchannel`) y el cuerpo del
bucle (usa `resolveDisposition` en vez de `disposition.toUpperCase()`
directo). `fetchData()` (línea ~493) ya pasa `lostDests` a `queryQueues` —
sin cambios en el sitio de invocación.

---

## 4. Dependencias npm

Ninguna nueva (R24). `resolveDisposition` y `AGENT_DSTCHANNEL_RE` ya existen
en `backend/server.js` desde #21 — se reutilizan tal cual, sin modificar su
firma ni su cuerpo.

---

## 5. Componentes frontend

### 5.1 Renombrado de la StatCard "Perdidas" → "No Contestadas" (R1-R3)

En `frontend/src/components/Dashboard.jsx`, dentro del grid de 3 StatCards
principales (líneas ~202-208):

```jsx
// Antes:
<StatCard label="Perdidas" value={noAnswer} icon={PhoneMissed} color="red"
  sub="no efectivas, del total" pct={lostPct} />

// Después:
<StatCard label="No Contestadas" value={noAnswer} icon={PhoneMissed} color="red"
  sub="no efectivas, del total" pct={lostPct} />
```

Solo cambia el `label`. `value`, `icon`, `color`, `sub`, y `pct`
(`disp?.['NO ANSWER']?.pct ?? 0`, variable `lostPct` ya existente) no
cambian — preserva R2/R3 trivialmente, sin tocar `StatCard.jsx`.

### 5.2 Eliminación de `UnansweredBreakdownCard` (R4-R6)

Se elimina del archivo `frontend/src/components/Dashboard.jsx`:

1. La definición del componente `UnansweredBreakdownCard` (líneas ~89-112).
2. Las constantes `UNANSWERED_REASONS` (líneas ~77-81) y
   `REASON_COLOR_CLASS` (líneas ~83-87) — usadas únicamente por
   `UnansweredBreakdownCard`.
3. La variable `noAnswerBreakdown = disp?.['NO ANSWER']?.breakdown` (línea
   ~161) — sin otros usos tras eliminar (1).
4. El bloque de renderizado (líneas ~210-213):

```jsx
{/* Desglose de 'Perdidas' por motivo (#22) */}
<div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-2 gap-4">
  <UnansweredBreakdownCard breakdown={noAnswerBreakdown} noAnswerTotal={noAnswer} />
</div>
```

No se introduce ningún reemplazo visual para esta fila de grid — la sección
desaparece por completo del Dashboard (R4). El backend conserva
`dispositions['NO ANSWER'].breakdown` en el payload sin cambios (R5) —
`queryStats`, `resolveDisposition`, `classifyUnansweredReason` **no se
tocan**.

### 5.3 Tarjeta combinada de Extensiones/Activas (R14-R18)

Se reemplaza el bloque actual (líneas ~215-222):

```jsx
{/* Estado de extensiones (AMI) */}
<div
  className={`grid grid-cols-2 gap-4 ${extensionsData.available ? '' : 'opacity-50'}`}
  title={extensionsData.available ? undefined : 'Estado de extensiones no disponible'}
>
  <StatCard label="Extensiones" value={extensionsData.total}  icon={Users}     color="slate" />
  <StatCard label="Activas"     value={extensionsData.active} icon={UserCheck} color="green" />
</div>
```

por una sola tarjeta. **Decisión**: en lugar de reutilizar `StatCard` (cuya
API espera un único `value` numérico — ver Decisión técnica §6.1), se crea
un componente local nuevo `ExtensionsStatusCard`, siguiendo el mismo patrón
local-no-exportado que `QueueCard`/`UnansweredBreakdownCard`
(definido junto a ellos en `Dashboard.jsx`, antes del `export default
function Dashboard()`):

```jsx
function ExtensionsStatusCard({ data }) {
  const { total, active, available } = data;

  return (
    <div
      className={`card flex items-center justify-between ${available ? '' : 'opacity-50'}`}
      title={available ? undefined : 'Estado de extensiones no disponible'}
    >
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Extensiones</p>
        <p className="text-3xl font-bold text-slate-100">
          <span className="text-emerald-400">{active}</span>
          <span className="text-slate-500"> / </span>
          <span>{total}</span>
        </p>
        <p className="text-xs text-slate-500 mt-1">activas / total</p>
      </div>
      <div className="w-10 h-10 rounded-xl bg-slate-500/10 flex items-center justify-center">
        <Users className="w-5 h-5 text-slate-400" />
      </div>
    </div>
  );
}
```

Punto de renderizado (reemplaza el bloque de líneas ~215-222):

```jsx
{/* Estado de extensiones (AMI) — tarjeta combinada (#23) */}
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <ExtensionsStatusCard data={extensionsData} />
</div>
```

Notas:
- `available` viene de `extensionsData.available` (igual que hoy); el valor
  por defecto `EMPTY_EXTENSIONS_STATUS = { total: 0, active: 0, extensions:
  [], available: false }` (línea ~15, sin cambios) cubre el estado inicial
  antes de la primera respuesta de `api.pbxExtensions()` (R16).
- Se usa `<span className="text-emerald-400">{active}</span> / {total}` para
  que "activas" resalte visualmente (similar al patrón "8 / 12 activas" del
  acceptance criterion), sin introducir nuevas clases Tailwind dinámicas
  (todas las clases son literales completos, igual que el resto del
  archivo — sin riesgo de purge).
- Se mantiene el `title` con el mismo texto que antes
  (`'Estado de extensiones no disponible'`) cuando `available === false`
  (R16).
- Se usa el icono `Users` (ya importado, usado antes por la StatCard
  "Extensiones"); el icono `UserCheck` (antes usado por "Activas") queda sin
  uso tras este cambio — ver T-eliminación de import no usado en
  `tasks.md`.
- El grid pasa de `grid-cols-2` (dos StatCard de igual ancho) a
  `sm:grid-cols-2` con un solo elemento — se elige no ocupar las dos
  columnas con la tarjeta combinada para mantener una altura/anchura
  consistente con las demás tarjetas individuales del dashboard (p.ej.
  "Ocupado"/"Fallidas" más abajo son `grid-cols-2 lg:grid-cols-4`); deja
  espacio para una futura tarjeta complementaria sin reflow, mismo criterio
  usado en #22 §5.2 para `UnansweredBreakdownCard`.
- `EXTENSIONS_POLL_MS`, el `useEffect` de polling, `EMPTY_EXTENSIONS_STATUS`
  y `api.pbxExtensions()` no se modifican (R18).

---

## 6. Decisión técnica clave

### Decisión A — `queryQueues` reutiliza `resolveDisposition` vs. duplicar la lógica de reclasificación

**Elegido**: reemplazar `const d = r.disposition.toUpperCase(); if
([...].includes(d)) result[key][d] += ...` por
`const targetKey = resolveDisposition(r, lostDests); if (targetKey)
result[key][targetKey] += ...` (sección 3.3), reutilizando la función pura
ya extraída en #21 y usada por `queryStats`/`queryChannels`/`queryHourly`.

**Descartado**: escribir una versión "por cola" de la reclasificación,
distinta de `resolveDisposition`, o solo aplicar el criterio de #21
(`AGENT_DSTCHANNEL_RE`) sin el de #17 (`lostDests`) dentro de `queryQueues`.

**Razón**:
1. El acceptance criterion de `feature_list.json` #23 pide explícitamente
   "aplicando la misma lógica de reclasificación de `resolveDisposition`
   (#17/#21)" y "queryQueues aplica `resolveDisposition`... a cada registro
   antes de agregar por cola" — la función ya existe, está testeada
   (`disposition_agent_answered_fix.test.js`), y es la única fuente de
   verdad para "¿qué bucket de disposición efectivo corresponde a este
   registro?" usada por las otras tres funciones de agregación.
2. Un helper compartido garantiza que `queue['NO ANSWER']` (por cola) y
   `stats.dispositions['NO ANSWER']` (global) usan exactamente el mismo
   criterio — cierra la discrepancia documentada como "limitación conocida"
   en la Decisión C del `design.md` de #21 (que dejaba `queryQueues`
   deliberadamente sin el criterio de `dstchannel`). Esta feature #23 es,
   explícitamente, la "feature incremental futura" que esa Decisión C
   anticipaba.
3. No se introduce ningún campo nuevo en `queues[*]` — la reclasificación
   ocurre dentro de los buckets `ANSWERED`/`'NO ANSWER'`/`BUSY`/`FAILED` ya
   existentes, igual que #17/#21/#22 hicieron para `dispositions`,
   `channels[*]` y `hours[*]` (mismo patrón "additivo en valores, no en
   forma").

### Decisión B — Tarjeta combinada de extensiones: nuevo componente local vs. reutilizar `StatCard` con props extendidas

**Elegido**: crear un componente local nuevo `ExtensionsStatusCard` (sección
5.3), en lugar de extender `StatCard.jsx` con nuevas props (p.ej.
`secondaryValue`, `secondaryLabel`).

**Descartado**: añadir a `StatCard` props opcionales para un segundo valor
(`value2`/`sub2`) y usar `<StatCard label="Extensiones" value={total}
value2={active} ... />`.

**Razón**:
1. `StatCard` (`frontend/src/components/StatCard.jsx`) es un componente
   genérico reutilizado por 7 tarjetas distintas del Dashboard (Total
   llamadas, Contestadas, No Contestadas, Ocupado, Fallidas, Entrantes,
   Salientes) con una API simple de un solo valor numérico + barra de
   porcentaje opcional. Añadir una ruta secundaria "dos valores sin barra de
   porcentaje, con tratamiento de opacidad/`title` condicional" introduce una
   rama de renderizado completamente distinta (sin `pct`, con dos números
   destacados de forma diferente) que no comparte código visual real con el
   resto de usos de `StatCard`.
2. El patrón establecido en este mismo archivo para tarjetas "a medida" con
   layout propio es el componente local no exportado (`QueueCard`,
   `UnansweredBreakdownCard` antes de #23) — `ExtensionsStatusCard` sigue
   ese mismo patrón, consistente con el resto de `Dashboard.jsx`.
3. Mantiene `StatCard.jsx` sin cambios (cero riesgo de regresión visual en
   las otras 7 tarjetas que la usan), cumpliendo la regla "no reescribas lo
   que ya funciona".
4. El bloque "Ocupado + Fallidas + resumen de duración/canales" (líneas
   ~224-246) ya demuestra que `Dashboard.jsx` mezcla `StatCard` con `<div
   className="card ...">` a medida dentro del mismo grid — no es un patrón
   nuevo para el archivo.

### Decisión C — Eliminación completa vs. ocultamiento condicional de `UnansweredBreakdownCard`

**Elegido**: eliminar el componente, sus constantes auxiliares, la variable
`noAnswerBreakdown`, y el punto de renderizado (sección 5.2) — "dead code
removal" completo.

**Descartado**: dejar el componente definido pero no renderizado (código
muerto), o renderizarlo condicionalmente detrás de un flag.

**Razón**: el acceptance criterion de #23 dice "se elimina del Dashboard la
tarjeta... y su sección" — no pide un flag ni una opción de configuración.
Mantener código muerto en `Dashboard.jsx` (componente + constantes sin uso)
generaría warnings de lint/build (`no-unused-vars` si en el futuro se
configura ESLint para frontend, ver `docs/existing_code.md` limitación
"Frontend: aún sin Vitest/ESLint configurados") y confusión para futuros
mantenedores. El backend conserva `breakdown` en el payload (R5) — solo se
elimina el código de presentación, no el de cálculo.

---

## 7. Compatibilidad con v1.0 / #16 / #17 / #18 / #19 / #21 / #22

- **`/api/calls/today`, `/api/calls/range`, SSE `init`/`update`**: misma
  forma de respuesta (R19-R21). Cambian únicamente los valores numéricos de
  `queues[*]` (`ANSWERED`/`'NO ANSWER'`/`BUSY`/`FAILED`/`total`) para
  registros `ANSWERED` sin `dstchannel` de agente dentro de una cola
  configurada, o para registros con `dst` en `lostDestinations` y
  `disposition` distinta de `'NO ANSWER'` dentro de `'__lost__'`.
  `stats.dispositions['NO ANSWER'].breakdown` (#22) permanece sin cambios de
  valor ni de forma.
- **`/api/calls/inbound`, `/api/calls/outbound` (+ export)**: sin cambios —
  no usan `queryQueues`.
- **`/api/pbx/extensions`** (#18/#19): sin cambios de payload — solo cambia
  su consumo en el Dashboard (R14-R18).
- **`queryStats`, `queryChannels`, `queryHourly`, `resolveDisposition`,
  `classifyUnansweredReason`, `extractChannel`, `passesFilter`,
  `todayRange`, `toMySQLDate`**: ninguna se modifica. Solo `queryQueues`
  cambia (SQL: añade `dstchannel`; cuerpo: usa `resolveDisposition`).
- **`config.lostDestinations` / `config.queues` / `AGENT_DSTCHANNEL_RE`**:
  sin cambios de formato, default, ni valor.
- **Frontend**: `StatCard.jsx`, `QueueCard` (la función — solo cambia el
  **valor** `queue['NO ANSWER']` que recibe vía props, no su código),
  `ChannelTable.jsx`, `HourlyChart.jsx`, `DispositionChart.jsx`,
  `InboundView.jsx`, `OutboundView.jsx`, `HistoricalView.jsx`,
  `ChannelAliasManager.jsx`, `Layout.jsx`, `App.jsx`, `useSSE.js`,
  `AuthContext.jsx`, `api.js` — sin cambios. Solo `Dashboard.jsx` se
  modifica: renombra una StatCard, elimina `UnansweredBreakdownCard` (+
  constantes auxiliares + variable `noAnswerBreakdown`), y reemplaza las dos
  StatCard de extensiones por `ExtensionsStatusCard`.
- **CDR (MySQL `asteriskcdrdb`)**: ninguna escritura nueva (R23); el único
  cambio de `SELECT`/`GROUP BY` es añadir `dstchannel` a `queryQueues`
  (mismo patrón que #17/#21 aplicaron a `queryStats`/`queryChannels`/
  `queryHourly`).
