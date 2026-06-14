# design.md — dashboard_perdidas_no_contestadas_split

> Feature #24. Separa la `StatCard` única "No Contestadas" (#23) en dos
> `StatCard`: "Perdidas" (`breakdown.ivr_hangup`) y "No Contestadas"
> (`breakdown.no_answer + breakdown.queue_no_agent`), reutilizando el campo
> `dispositions['NO ANSWER'].breakdown` ya calculado por `queryStats` desde
> #22. Cambio exclusivo de `frontend/src/components/Dashboard.jsx`.

---

## 1. Endpoints nuevos

Ninguno. Esta feature **no añade ni modifica rutas, ni el payload de ningún
endpoint**.

| Método | Ruta | Auth | Cambio |
|---|---|---|---|
| GET | `/api/calls/today` | Sesión | Sin cambio. `stats.dispositions['NO ANSWER'].breakdown = { no_answer, ivr_hangup, queue_no_agent }` ya existe desde #22 y se conserva sin cambios desde #23 (R12) |
| GET | `/api/calls/range` | Sesión | Sin cambio — mismo razonamiento |
| GET | `/api/events` (SSE `init`/`update`) | Sesión | Sin cambio — mismo razonamiento |
| GET | `/api/calls/inbound`, `/api/calls/outbound` (+ export) | Sesión | Sin cambio — no usan `queryStats` |
| GET | `/api/pbx/extensions` | Sesión | Sin cambio |
| GET/PUT | `/api/admin/channels*` | Admin | Sin cambio |

### 1.1 Confirmación: el backend NO necesita cambios

Se verificó `backend/server.js`:

- `queryStats` (líneas ~150-203) inicializa
  `base['NO ANSWER'].breakdown = { no_answer: 0, ivr_hangup: 0,
  queue_no_agent: 0 }` (línea 170) y lo incrementa por registro vía
  `classifyUnansweredReason(r, lostDests)` (líneas 187-189).
- `fetchData()` invoca `queryStats` tres veces (total, `direction='in'`,
  `direction='out'`) — las tres devuelven `dispositions['NO ANSWER']` con
  `breakdown` poblado, sin que #23 haya alterado `queryStats` (#23 solo tocó
  `queryQueues` y `Dashboard.jsx`).
- `/api/calls/today` y `/api/calls/range` devuelven `stats` (resultado de la
  invocación "total" de `queryStats`) directamente — `stats.dispositions['NO
  ANSWER'].breakdown` está presente.
- El broadcaster SSE (`init`/`update`) reutiliza `fetchData()` — mismo
  payload, mismo campo presente.

**Conclusión**: `dispositions['NO ANSWER'].breakdown` ya está disponible en
los tres puntos de entrada (`/api/calls/today`, `/api/calls/range`, SSE) sin
ningún cambio adicional. R12 se satisface sin tocar `backend/server.js`.

---

## 2. Cambios BD SQLite

Ninguno.

---

## 3. Queries CDR nuevas

Ninguna. No se modifica el `SELECT`/`GROUP BY` de `queryStats` ni de ninguna
otra función de agregación.

---

## 4. Dependencias npm

Ninguna nueva (R14). Cambio puramente de lectura/presentación en
`Dashboard.jsx`, usando JS nativo.

---

## 5. Componentes frontend

### 5.1 Estado actual (tras #23) — `Dashboard.jsx`

```jsx
// Líneas ~138-146 (lectura de datos)
const answered = disp?.ANSWERED?.count   ?? 0;
const noAnswer = disp?.['NO ANSWER']?.count ?? 0;
const busy     = disp?.BUSY?.count       ?? 0;
const failed   = disp?.FAILED?.count     ?? 0;

const answeredPct = disp?.ANSWERED?.pct     ?? 0;
const lostPct     = disp?.['NO ANSWER']?.pct ?? 0;
const busyPct     = disp?.BUSY?.pct          ?? 0;
const failedPct   = disp?.FAILED?.pct        ?? 0;
```

```jsx
// Líneas ~187-193 (grid de 3 StatCard principales)
<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
  <StatCard label="Total llamadas" value={total}     icon={Phone}      color="blue" />
  <StatCard label="Contestadas"    value={answered}  icon={PhoneCall}  color="green"
    sub="del total" pct={answeredPct} />
  <StatCard label="No Contestadas" value={noAnswer}  icon={PhoneMissed} color="red"
    sub="no efectivas, del total" pct={lostPct} />
</div>
```

### 5.2 Cambio — lectura de datos (reemplaza `noAnswer`/`lostPct`)

Se elimina el cálculo agregado `noAnswer`/`lostPct` (#23) y se reemplaza por
dos pares de variables, una por cada nueva `StatCard`, leyendo
`breakdown` con defaults por clave (R10, R11):

```jsx
const answered = disp?.ANSWERED?.count ?? 0;
const busy     = disp?.BUSY?.count     ?? 0;
const failed   = disp?.FAILED?.count   ?? 0;

const answeredPct = disp?.ANSWERED?.pct ?? 0;
const busyPct     = disp?.BUSY?.pct     ?? 0;
const failedPct   = disp?.FAILED?.pct   ?? 0;

// R10/R11: breakdown puede ser undefined (payload legacy) o tener claves
// faltantes — default por clave individual, no all-or-nothing.
const noAnswerBreakdown = disp?.['NO ANSWER']?.breakdown ?? {};

// R1: "Perdidas" = colgó en IVR/menú (dst en config.lostDestinations).
const lost = noAnswerBreakdown.ivr_hangup ?? 0;

// R2: "No Contestadas" = sin respuesta + cola sin agente real.
const noAnswer =
  (noAnswerBreakdown.no_answer ?? 0) + (noAnswerBreakdown.queue_no_agent ?? 0);

// R6: pct de cada tarjeta sobre el total general (no entre sí, no sobre
// dispositions['NO ANSWER'].count). Misma fórmula/redondeo que el resto del
// archivo (p.ej. inboundPct/outboundPct, líneas ~150-151).
const lostPct =
  total > 0 ? Math.round((lost / total) * 1000) / 10 : 0;
const noAnswerPct =
  total > 0 ? Math.round((noAnswer / total) * 1000) / 10 : 0;
```

Notas:
- `total` ya existe (`data?.stats?.total ?? 0`, línea ~132) — se reutiliza
  sin cambios.
- `disp?.['NO ANSWER']?.pct` (el `pct` agregado que calculaba `queryStats`
  sobre `dispositions['NO ANSWER'].count`) **deja de usarse** para estas dos
  tarjetas — cada una calcula su propio `pct` localmente sobre `total`,
  como pide R6. El campo `dispositions['NO ANSWER'].pct` sigue existiendo en
  el payload (backend sin cambios, R12) pero no se referencia para estas dos
  `StatCard`.

### 5.3 Cambio — render de las StatCard (reemplaza la tarjeta única)

```jsx
// Antes (#23):
<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
  <StatCard label="Total llamadas" value={total}     icon={Phone}      color="blue" />
  <StatCard label="Contestadas"    value={answered}  icon={PhoneCall}  color="green"
    sub="del total" pct={answeredPct} />
  <StatCard label="No Contestadas" value={noAnswer}  icon={PhoneMissed} color="red"
    sub="no efectivas, del total" pct={lostPct} />
</div>

// Después (#24):
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <StatCard label="Total llamadas" value={total}     icon={Phone}      color="blue" />
  <StatCard label="Contestadas"    value={answered}  icon={PhoneCall}  color="green"
    sub="del total" pct={answeredPct} />
  <StatCard label="Perdidas"       value={lost}      icon={PhoneMissed} color="red"
    sub="colgó en IVR, del total" pct={lostPct} />
  <StatCard label="No Contestadas" value={noAnswer}  icon={PhoneMissed} color="amber"
    sub="sin respuesta, del total" pct={noAnswerPct} />
</div>
```

Decisiones de presentación (R4, R5, R7):
- **Grid**: `sm:grid-cols-3` → `sm:grid-cols-2 lg:grid-cols-4` para acomodar
  4 tarjetas en la misma fila en pantallas medianas/grandes, sin invadir el
  bloque siguiente ("Ocupado + Fallidas + resumen", que ya usa
  `grid-cols-2 lg:grid-cols-4`, líneas ~201-222) — mismo patrón de columnas
  ya usado en ese bloque, consistencia visual.
- **Orden**: Total, Contestadas, Perdidas, No Contestadas — preserva el
  orden conceptual existente (Total → Contestadas → "lo que no se contestó",
  ahora desglosado en dos) y mantiene "Contestadas" como vecino inmediato de
  "Perdidas" (R7: ambas en el mismo grupo visual de KPIs primarios).
- **Icono/color**:
  - "Perdidas" reutiliza `icon={PhoneMissed} color="red"` — mismo
    icono/color que tenía la tarjeta única "No Contestadas" en #23 (era
    visualmente la categoría "roja" de no-efectivas).
  - "No Contestadas" usa `icon={PhoneMissed} color="amber"` — mismo icono
    (`PhoneMissed` ya importado, sin nuevo import) pero color `amber` para
    diferenciarla visualmente de "Perdidas" (rojo) y de "Ocupado" (que ya es
    `amber` más abajo — la diferenciación es por posición/etiqueta, no por
    unicidad global de color; `StatCard.jsx` ya define la paleta `amber` y
    se usa en múltiples tarjetas).
  - Ningún nuevo import de `lucide-react` es necesario: `Phone`, `PhoneCall`,
    `PhoneMissed` ya están importados (línea 3).
- **Sub-texto**: "colgó en IVR, del total" / "sin respuesta, del total" —
  textos cortos que indican la semántica de cada subcategoría sin requerir
  tooltip adicional, siguiendo el estilo conciso de los `sub` existentes
  ("del total", "no efectivas, del total").

### 5.4 `StatCard.jsx` — sin cambios

No se requiere ninguna modificación a `frontend/src/components/StatCard.jsx`
(R4, R5): su API (`label`, `value`, `sub`, `color`, `icon`, `pct`) ya soporta
exactamente el formato que necesitan ambas tarjetas nuevas, idéntico al de
"Contestadas".

---

## 6. Decisión técnica clave

### Decisión A — `pct` calculado localmente en `Dashboard.jsx` vs. usar `dispositions['NO ANSWER'].pct`

**Elegido**: cada nueva `StatCard` ("Perdidas", "No Contestadas") calcula su
propio `pct` en `Dashboard.jsx` como `value / total` (sección 5.2), donde
`value` es `breakdown.ivr_hangup` o `breakdown.no_answer +
breakdown.queue_no_agent` respectivamente.

**Descartado**:
1. Reutilizar `dispositions['NO ANSWER'].pct` (el `pct` agregado que
   `queryStats` ya calcula sobre `dispositions['NO ANSWER'].count` /
   `total`) para una de las dos tarjetas y derivar la otra por resta.
2. Pedir al backend que calcule y devuelva `breakdown.ivr_hangup_pct` /
   `breakdown.no_answer_pct` / `breakdown.queue_no_agent_pct` directamente.

**Razón**:
1. El acceptance criterion de `feature_list.json` #24 es explícito: *"Los
   porcentajes (pct) de 'Perdidas' y 'No Contestadas' se calculan cada uno
   sobre el total general de llamadas"* (R6) — ninguna de las dos
   subcategorías corresponde 1:1 a `dispositions['NO ANSWER'].pct` (que es
   `count / total` para el **conjunto combinado** de las 3 subcategorías),
   así que no hay un campo existente que sirva directamente para ninguna de
   las dos tarjetas sin un cálculo adicional.
2. El cálculo `value / total` con el mismo redondeo
   (`Math.round((x / total) * 1000) / 10`) **ya es un patrón establecido en
   este mismo archivo** (`inboundPct`/`outboundPct`, líneas ~150-151,
   `lostPct`/`answeredPct`/etc. derivados de `pct` del backend pero con la
   misma fórmula) — replicarlo localmente para dos valores adicionales no
   introduce un patrón nuevo ni lógica de negocio en el frontend más allá de
   aritmética simple ya presente.
3. Pedir al backend nuevos campos `*_pct` violaría R12 (sin cambios de
   backend) y la justificación explícita del acceptance criterion ("no se
   requieren cambios en queryStats... si el spec_author identifica que sí
   hace falta, debe documentarlo y justificarlo" — no se identificó
   necesidad alguna, sección 1.1).
4. Mantiene `dispositions['NO ANSWER'].pct` sin cambios en el payload (sigue
   representando el agregado de las 3 subcategorías, útil para otros
   consumidores potenciales o para `DispositionChart`/`HourlyChart`, R9), sin
   que el Dashboard necesite usarlo para estas dos tarjetas específicas.

### Decisión B — Dos `StatCard` separadas vs. una tarjeta combinada con dos sub-valores (estilo `ExtensionsStatusCard` de #23)

**Elegido**: dos instancias independientes de `StatCard` (sección 5.3),
mismo componente genérico ya usado por "Contestadas"/"Ocupado"/"Fallidas".

**Descartado**: crear un componente local nuevo (p.ej.
`UnansweredSplitCard`) que muestre "Perdidas: N1 (p1%) / No Contestadas: N2
(p2%)" en una sola tarjeta, similar a `ExtensionsStatusCard` (#23) o
`QueueCard`.

**Razón**:
1. El acceptance criterion pide explícitamente "DOS tarjetas" con "el mismo
   formato (label + valor + sub-texto + % del total) que 'Contestadas'" —
   `StatCard` ya provee exactamente ese formato; usarlo dos veces es la
   solución más directa y de menor riesgo (cero código nuevo de
   presentación, cero CSS nuevo).
2. `ExtensionsStatusCard` (#23) se justificó como componente local porque
   `StatCard` no soporta "dos valores sin barra de progreso única" de forma
   natural — aquí, en cambio, cada subcategoría **sí** tiene su propio
   `value` + `pct` + barra de progreso independiente, que es precisamente lo
   que `StatCard` ya renderiza. No hay necesidad de un layout a medida.
3. Mantiene la fila de KPIs principales como una secuencia homogénea de
   `StatCard`s (Total, Contestadas, Perdidas, No Contestadas), consistente
   con el patrón visual de #16/#23 para esta fila.

### Decisión C — Eliminar `lostPct`/`disp?.['NO ANSWER']?.pct` de las variables de nivel superior vs. conservarlas sin uso

**Elegido**: eliminar las variables `noAnswer` y `lostPct` (definiciones de
#23, líneas ~139 y ~144) y sustituirlas por `lost`, `noAnswer` (redefinida),
`lostPct` (redefinida), `noAnswerPct` (sección 5.2) — sin dejar variables sin
referenciar.

**Descartado**: conservar `noAnswer`/`lostPct` (valores agregados de
`dispositions['NO ANSWER']`) como variables muertas o usarlas en otro lugar
no especificado.

**Razón**: el proyecto no tiene ESLint configurado para frontend (limitación
conocida, `docs/existing_code.md`), pero dejar variables sin uso degrada la
legibilidad y puede confundir a futuros mantenedores sobre cuál es la fuente
de verdad para "Perdidas"/"No Contestadas" tras este cambio. `disp?.['NO
ANSWER']?.count` y `.pct` siguen estando disponibles en `disp` por si algún
futuro componente los necesita (p.ej. para una eventual reintroducción de un
indicador "no contestadas total combinado") — simplemente no se asignan a
variables de nivel superior si no se usan.

---

## 7. Compatibilidad con v1.0 / #16 / #17 / #21 / #22 / #23

- **`/api/calls/today`, `/api/calls/range`, SSE `init`/`update`**: sin
  cambios de payload ni de valores (R12). `dispositions['NO
  ANSWER'].breakdown` permanece exactamente como lo dejó #22/#23.
- **`queryStats`, `resolveDisposition`, `classifyUnansweredReason`,
  `queryChannels`, `queryHourly`, `queryQueues`, `extractChannel`,
  `passesFilter`, `todayRange`, `toMySQLDate`**: ninguna se modifica.
- **`DispositionChart.jsx`, `HourlyChart.jsx`**: sin cambios — siguen
  mostrando la categoría combinada "no contestadas"
  (`dispositions['NO ANSWER'].count` / `hourly[*]['NO ANSWER']`), consistente
  en valor con la suma de las dos nuevas `StatCard` (R9).
- **`ChannelTable.jsx`, `QueueCard`, `ExtensionsStatusCard`,
  `InboundView.jsx`, `OutboundView.jsx`, `HistoricalView.jsx`,
  `ChannelAliasManager.jsx`, `Layout.jsx`, `App.jsx`, `useSSE.js`,
  `AuthContext.jsx`, `api.js`, `StatCard.jsx`**: sin cambios. Solo
  `Dashboard.jsx` se modifica (sección 5.2/5.3): reemplaza el cálculo y
  render de la tarjeta única "No Contestadas" (#23) por dos tarjetas
  "Perdidas"/"No Contestadas" derivadas de `breakdown`.
- **CDR (MySQL `asteriskcdrdb`)**: ninguna escritura ni query nueva (R13);
  cero acceso adicional a CDR — esta feature es 100% frontend sobre datos ya
  recibidos.
