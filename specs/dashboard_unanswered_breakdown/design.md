# design.md — dashboard_unanswered_breakdown

> Feature #22. Añade un desglose por motivo (`no_answer` / `ivr_hangup` /
> `queue_no_agent`) dentro de `dispositions['NO ANSWER']`, calculado por
> `queryStats` reutilizando `resolveDisposition` (#17/#21), y lo presenta en
> una nueva sección del Dashboard junto a la tarjeta "Perdidas".

---

## 1. Endpoints nuevos

Ninguno. Esta feature **no añade ni modifica rutas**. Los endpoints
existentes mantienen su forma de payload, con un campo adicional:

| Método | Ruta | Auth | Cambio |
|---|---|---|---|
| GET | `/api/calls/today` | Sesión | `stats.dispositions['NO ANSWER']` (y sus equivalentes `inbound.stats.*` / `outbound.stats.*`) ganan el campo adicional `breakdown: { no_answer, ivr_hangup, queue_no_agent }`. Resto del payload sin cambios (R12) |
| GET | `/api/calls/range` | Sesión | Igual que arriba (R13) |
| GET | `/api/events` (SSE `init`/`update`) | Sesión | Igual que arriba (R14) |
| GET | `/api/calls/inbound`, `/api/calls/outbound` (+ export) | Sesión | Sin cambio — no usan `queryStats` |
| GET/PUT | `/api/admin/channels*` | Admin | Sin cambio |

---

## 2. Cambios BD SQLite

Ninguno. Toda la lógica es agregación en memoria adicional sobre las mismas
filas que `queryStats` ya recibe de MySQL (solo lectura).

---

## 3. Queries CDR

### 3.1 Sin cambios de SQL

El `SELECT`/`GROUP BY` de `queryStats` (backend/server.js, ~línea 127-141) **no
se modifica**: ya incluye `dst` y `dstchannel` (añadidos en #17/#21), que son
exactamente los campos que necesita la nueva clasificación. No se requiere
ninguna columna adicional ni un segundo `SELECT` (R21).

```sql
-- Sin cambios respecto a #21
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

### 3.2 Nueva función pura — `classifyUnansweredReason(row, lostDests)`

Se añade una función hermana de `resolveDisposition`, junto a ella
(backend/server.js, tras la línea ~125), que solo se invoca para filas cuyo
`resolveDisposition(row, lostDests) === 'NO ANSWER'`. Implementa el orden de
evaluación de R1 (`ivr_hangup` → `queue_no_agent` → `no_answer`):

```js
// ── Desglose de motivo de 'NO ANSWER' (#22) ───────────────────────
// Solo debe llamarse cuando resolveDisposition(row, lostDests) === 'NO ANSWER'.
// Devuelve 'ivr_hangup' | 'queue_no_agent' | 'no_answer' (R1, R4-R7).
function classifyUnansweredReason(row, lostDests) {
  // R5/R1.1: dst en lostDestinations → 'ivr_hangup', tiene prioridad sobre
  // 'no_answer' aunque la disposition original ya fuera 'NO ANSWER'
  // (evita doble conteo, R5).
  if (lostDests.includes(row.dst)) {
    return 'ivr_hangup';
  }

  // R6/R1.2: disposition original ANSWERED reclasificada por #21
  // (dstchannel sin agente) → 'queue_no_agent'.
  const d = row.disposition.toUpperCase();
  if (d === 'ANSWERED' && !AGENT_DSTCHANNEL_RE.test(row.dstchannel || '')) {
    return 'queue_no_agent';
  }

  // R4/R1.3: caso puro — disposition original ya era 'NO ANSWER' y dst no
  // está en lostDestinations.
  return 'no_answer';
}
```

Notas de diseño:
- **Decisión de diseño** (ver sección 6, Decisión A): se crea una función
  **hermana** `classifyUnansweredReason`, separada de `resolveDisposition`,
  en lugar de hacer que `resolveDisposition` devuelva una tupla
  `[targetKey, reason]`. `resolveDisposition` sigue devolviendo solo
  `targetKey` (string | null), sin romper su firma actual usada por
  `queryChannels`/`queryHourly`.
- `classifyUnansweredReason` reutiliza `AGENT_DSTCHANNEL_RE` (constante ya
  definida en la línea ~103) y se evalúa sobre `row.dstchannel` crudo, igual
  que `resolveDisposition` (R19 de #21, heredado aquí).
- El orden `ivr_hangup` → `queue_no_agent` → `no_answer` implementa
  exactamente R1: si `dst` está en `lostDests`, el resultado es siempre
  `ivr_hangup`, sin importar `disposition`/`dstchannel` — esto cubre R5
  (incluyendo el caso "disposition original ya era NO ANSWER y dst en
  lostDests", que NO cae en `no_answer`).
- Si esta función se llama con una fila cuyo `resolveDisposition` NO es
  `'NO ANSWER'` (uso incorrecto), el resultado no está definido por el spec —
  el `queryStats` actualizado (sección 3.3) garantiza que solo se llama tras
  comprobar `targetKey === 'NO ANSWER'` (R2).

### 3.3 `queryStats` — cuerpo actualizado (sin cambio de SQL ni de firma)

```js
async function queryStats(pool, from, to, inboundChannels, outboundChannels, direction = 'in', lostDests = ['s', 'hang', 'hangup']) {
  const [rows] = await pool.query( /* SQL sin cambios, sección 3.1 */ );

  const base = {
    ANSWERED:    { count: 0, total_duration: 0, total_billsec: 0, avg_billsec: 0, pct: 0 },
    'NO ANSWER': {
      count: 0, total_duration: 0, total_billsec: 0, avg_billsec: 0, pct: 0,
      breakdown: { no_answer: 0, ivr_hangup: 0, queue_no_agent: 0 },   // R8, R9
    },
    BUSY:        { count: 0, total_duration: 0, total_billsec: 0, avg_billsec: 0, pct: 0 },
    FAILED:      { count: 0, total_duration: 0, total_billsec: 0, avg_billsec: 0, pct: 0 },
  };

  let total = 0;
  for (const r of rows) {
    if (!passesFilter(r.channel, inboundChannels, outboundChannels, direction)) continue;

    const targetKey = resolveDisposition(r, lostDests);
    if (targetKey) {
      base[targetKey].count          += Number(r.count);
      base[targetKey].total_duration += Number(r.total_duration);
      base[targetKey].total_billsec  += Number(r.total_billsec);

      // R8: desglose adicional, solo para 'NO ANSWER'
      if (targetKey === 'NO ANSWER') {
        const reason = classifyUnansweredReason(r, lostDests);
        base['NO ANSWER'].breakdown[reason] += Number(r.count);
      }
    }
    total += Number(r.count);
  }

  if (base.ANSWERED.count > 0)
    base.ANSWERED.avg_billsec = Math.round(base.ANSWERED.total_billsec / base.ANSWERED.count);

  for (const key of Object.keys(base)) {
    base[key].pct = total > 0 ? Math.round((base[key].count / total) * 1000) / 10 : 0;
  }

  return { dispositions: base, total };
}
```

Cambios respecto a #21:
1. `base['NO ANSWER']` gana el campo `breakdown: { no_answer: 0, ivr_hangup: 0,
   queue_no_agent: 0 }` en su inicialización (R8, R9 — los demás campos de
   `base['NO ANSWER']` y los otros tres buckets no cambian).
2. Dentro del bucle, cuando `targetKey === 'NO ANSWER'`, se llama
   `classifyUnansweredReason(r, lostDests)` y se incrementa
   `base['NO ANSWER'].breakdown[reason]` por `Number(r.count)` — el mismo
   valor que ya se suma a `base['NO ANSWER'].count` en la línea anterior, lo
   que garantiza R3 (`no_answer + ivr_hangup + queue_no_agent ===
   dispositions['NO ANSWER'].count`) por construcción: cada fila que
   incrementa `count` incrementa exactamente uno de los tres campos de
   `breakdown` en la misma cantidad.
3. El cálculo de `avg_billsec` y `pct` (incluyendo `pct` de `'NO ANSWER'`) no
   cambia — `breakdown` no participa en esos cálculos (R9, R10).

**Complejidad/rendimiento**: O(1) adicional por fila ya iterada (una llamada a
`classifyUnansweredReason`, que es un par de comparaciones/regex) — sin
impacto medible sobre RNF-02, sin nuevas queries SQL (R21).

### 3.4 `queryChannels` / `queryHourly` — sin cambios (R11)

No se modifican. Siguen devolviendo exactamente la forma de #21
(`{channel, ANSWERED, 'NO ANSWER', BUSY, FAILED, total, total_billsec}` y
`{hour, ANSWERED, 'NO ANSWER', BUSY, FAILED, total}` respectivamente, sin
`breakdown`).

### 3.5 `queryQueues` — sin cambios

Fuera de alcance, igual que en #21 (Decisión C de su design.md). No se toca.

---

## 4. Dependencias npm

Ninguna nueva (R23). Cálculo en memoria con JS nativo.

---

## 5. Componentes frontend

### 5.1 Nuevo componente — `UnansweredBreakdownCard`

Se añade un componente funcional simple en `frontend/src/components/Dashboard.jsx`,
junto a `QueueCard` (que ya vive como componente local dentro de
`Dashboard.jsx`, líneas ~39-75) — mismo patrón: componente local no exportado,
sin archivo nuevo, ya que es de un solo uso y pequeño (consistente con
`QueueCard`).

```jsx
const UNANSWERED_REASONS = [
  { key: 'no_answer',     label: 'Sin respuesta',   color: 'amber' },
  { key: 'ivr_hangup',    label: 'Colgó en IVR',    color: 'slate' },
  { key: 'queue_no_agent', label: 'Cola sin agente', color: 'red'   },
];

function UnansweredBreakdownCard({ breakdown, noAnswerTotal }) {
  const b = breakdown ?? { no_answer: 0, ivr_hangup: 0, queue_no_agent: 0 }; // R19

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-200">Detalle de Perdidas</span>
        <span className="text-2xl font-bold text-slate-100">{noAnswerTotal}</span>
      </div>
      <div className="space-y-2">
        {UNANSWERED_REASONS.map(({ key, label, color }) => {
          const count = b[key] ?? 0;
          const pct = noAnswerTotal > 0 ? Math.round((count / noAnswerTotal) * 1000) / 10 : 0; // R17
          return (
            <div key={key} className="flex items-center justify-between text-xs text-slate-500">
              <span>{label}</span>
              <span className={`font-medium text-${color}-400`}>{count} ({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Notas:
- Sin gráfico (R20 satisfecho por la opción "sin chart"; ver Decisión B). Si
  el reviewer/usuario prefiere visualizar con un gráfico, podría sustituirse
  por un `PieChart`/`BarChart` de Recharts reutilizando el patrón de
  `DispositionChart.jsx` — se documenta como alternativa, no obligatoria.
- Las clases Tailwind `text-${color}-400` deben ser clases completas y
  estáticas para que el purge de Tailwind las detecte — el implementer debe
  verificar que `text-amber-400`, `text-slate-400`, `text-red-400` ya
  aparecen literalmente en otros componentes del proyecto (sí aparecen, p.ej.
  `StatCard.jsx` y `QueueCard`), o bien escribir las 3 clases completas de
  forma literal (sin interpolación) si el purge de Tailwind las elimina en
  build de producción. **Recomendación**: escribir un mapa
  `const REASON_COLOR_CLASS = { no_answer: 'text-amber-400', ivr_hangup:
  'text-slate-400', queue_no_agent: 'text-red-400' }` y usar
  `REASON_COLOR_CLASS[key]` en vez de interpolar el string, para evitar
  cualquier duda sobre purge de Tailwind (JIT detecta literales completos en
  el código fuente, no fragmentos generados dinámicamente).

### 5.2 Integración en `Dashboard.jsx`

Tras la tarjeta "Perdidas" (línea ~167-168), se añade una nueva fila/sección.
Lectura de datos (junto a las constantes existentes ~línea 107-122):

```jsx
const noAnswerBreakdown = disp?.['NO ANSWER']?.breakdown; // R19: puede ser undefined
```

Renderizado (nueva sección, tras el bloque de StatCards existente — antes o
después del bloque "Extensiones"; se propone justo debajo del grid de las 3
StatCards principales, línea ~169, dentro del `{data && ( ... )}` existente —
R18):

```jsx
{/* Desglose de 'Perdidas' por motivo (#22) */}
<div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-2 gap-4">
  <UnansweredBreakdownCard breakdown={noAnswerBreakdown} noAnswerTotal={noAnswer} />
</div>
```

(`noAnswer` ya existe como constante en el componente — línea 115:
`disp?.['NO ANSWER']?.count ?? 0`.)

**Decisión de ubicación**: se coloca en su propia fila de grid (no dentro del
grid de 3 columnas de StatCards) porque su contenido es una mini-tabla de 3
filas, más alto que una `StatCard` estándar — mezclarlo en el mismo grid de
altura uniforme rompería la alineación visual. Se usa `lg:grid-cols-2` con un
solo elemento para no ocupar todo el ancho en pantallas grandes (deja espacio
para una futura tarjeta complementaria sin reflow).

---

## 6. Decisiones técnicas

### Decisión A — Función hermana `classifyUnansweredReason` vs. extender `resolveDisposition` para devolver una tupla

**Elegido**: crear `classifyUnansweredReason(row, lostDests)` como función
**separada**, llamada solo cuando `resolveDisposition(row, lostDests) ===
'NO ANSWER'` (sección 3.2/3.3).

**Descartado**: cambiar `resolveDisposition` para que devuelva
`{ targetKey, reason }` o `[targetKey, reason]` en todos los casos.

**Razón**:
1. `resolveDisposition` es usada también por `queryChannels` y `queryHourly`
   (#21, R11-R13), que **no necesitan** el desglose (R11 de este spec). Cambiar
   su tipo de retorno obligaría a actualizar las tres funciones y sus tests
   existentes (`disposition_agent_answered_fix.test.js`,
   `dashboard_lost_destinations.test.js`) solo para destructurar un valor que
   dos de ellas ignorarían — riesgo de regresión sin beneficio.
2. Mantener `resolveDisposition(row, lostDests) -> string | null` preserva
   100% de compatibilidad con el código y tests de #17/#21 (R22).
3. `classifyUnansweredReason` es trivialmente testeable de forma aislada,
   igual que `resolveDisposition` lo fue en #21.

### Decisión B — Sin gráfico (cards numéricas) vs. gráfico Recharts (donut/barra)

**Elegido**: presentación numérica simple (mini-lista con conteo + %), sin
gráfico nuevo (sección 5.1).

**Descartado**: añadir un `PieChart`/donut de Recharts para el desglose de 3
categorías, similar a `DispositionChart.jsx`.

**Razón**:
1. `DispositionChart.jsx` ya es un donut de las 4 disposiciones globales
   (ANSWERED/NO ANSWER/BUSY/FAILED) — añadir un segundo donut justo al lado,
   que es un "zoom" de una sola porción del primero, puede resultar redundante
   visualmente y añade más código/props que mantener.
2. El acceptance criteria de `feature_list.json` (#22) pide "conteos y
   porcentajes" sin exigir explícitamente un gráfico — una mini-tabla cumple
   R16/R17 con menos código y reutiliza el patrón visual de `QueueCard`
   (lista de métricas con porcentaje), ya familiar en este dashboard.
3. R20 permite explícitamente la opción sin gráfico. Si en revisión humana se
   prefiere un gráfico, es un cambio aislado al render interno de
   `UnansweredBreakdownCard` (no afecta R1-R15, backend, ni tests del
   backend).

### Decisión C — Ubicación de `breakdown`: dentro de `dispositions['NO ANSWER']` vs. campo nuevo de nivel superior (`stats.unansweredBreakdown`)

**Elegido**: `dispositions['NO ANSWER'].breakdown` (anidado, sección 3.3).

**Descartado**: `stats.unansweredBreakdown = { no_answer, ivr_hangup,
queue_no_agent }` como hermano de `stats.dispositions` y `stats.total`.

**Razón**:
1. El propio enunciado del feature (`feature_list.json` #22, acceptance
   criteria 5) pide explícitamente: *"incluyen el nuevo desglose dentro de
   `dispositions['NO ANSWER']` (o campo equivalente)"* — anidarlo es la opción
   primaria sugerida.
2. Mantiene la relación semántica obvia: "el desglose de qué" → de
   `dispositions['NO ANSWER']`. Un campo hermano de nivel superior requeriría
   que el frontend combine dos rutas de acceso (`stats.dispositions['NO
   ANSWER'].count` y `stats.unansweredBreakdown`) para una sola tarjeta.
3. Es estrictamente additivo (R9) — ningún cliente existente que itere
   `Object.keys(dispositions['NO ANSWER'])` esperando un conjunto cerrado de
   claves se rompe, porque ningún código actual hace eso (los componentes
   acceden por nombre de campo: `.count`, `.pct`, etc.).

---

## 7. Compatibilidad con v1.0 / #17 / #20 / #21

- **`/api/calls/today`, `/api/calls/range`, SSE `init`/`update`**: misma forma
  de respuesta (R12-R15, R22), con el campo additivo `breakdown` dentro de
  cada `dispositions['NO ANSWER']` producido por `queryStats` (total, in, out
  — las tres invocaciones existentes en `fetchData()`).
- **`/api/calls/inbound`, `/api/calls/outbound` (+ export)**: sin cambios — no
  usan `queryStats`.
- **`queryChannels`, `queryHourly`, `queryQueues`, `extractChannel`,
  `passesFilter`, `resolveDisposition`, `todayRange`, `toMySQLDate`**:
  ninguna se modifica (R11; `resolveDisposition` se reutiliza sin cambiar su
  firma ni su cuerpo — Decisión A).
- **`config.lostDestinations` / `AGENT_DSTCHANNEL_RE`**: sin cambios de
  formato ni de valor — se reutilizan tal cual de #17/#21.
- **Frontend**: `ChannelTable.jsx`, `HourlyChart.jsx`, `DispositionChart.jsx`,
  `InboundView.jsx`, `OutboundView.jsx`, `HistoricalView.jsx`,
  `ChannelAliasManager.jsx`, `Layout.jsx`, `App.jsx`, `QueueCard` — sin
  cambios. Solo `Dashboard.jsx` gana el nuevo componente local
  `UnansweredBreakdownCard` y su punto de renderizado (sección 5.2).
- **CDR (MySQL `asteriskcdrdb`)**: ninguna escritura ni query nueva (R21); el
  `SELECT`/`GROUP BY` de `queryStats` es idéntico al de #21.
