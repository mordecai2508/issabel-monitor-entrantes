# design.md — dashboard_kpi_breakdown

> Feature ID: 16 | Revisión: 2026-06-10

---

## 1. Endpoints nuevos

Ninguno. Esta feature es **puramente de frontend**. Todos los datos necesarios
ya viajan en el payload existente de `GET /api/calls/today`, `GET
/api/calls/range` y los eventos SSE `init`/`update` (generados por
`fetchData()` en `backend/server.js`):

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

No se añade, modifica ni elimina ningún endpoint, status code o campo del
payload.

---

## 2. Cambios BD SQLite

Ninguno. No se requiere persistencia adicional.

---

## 3. Queries CDR nuevas

Ninguna. `queryStats(pool, from, to, allowedChannels, direction)` ya calcula
`dispositions['NO ANSWER']`, `dispositions.BUSY`, `dispositions.FAILED`,
`dispositions.ANSWERED` (cada uno con `count` y `pct`) y `total =
ANSWERED.count + 'NO ANSWER'.count + BUSY.count + FAILED.count` (líneas
~98–125 de `backend/server.js`). `fetchData()` ya invoca `queryStats` para
`direction = null` (general), `'in'` (entrante) y `'out'` (saliente) — los
totales `inbound.stats.total` y `outbound.stats.total` ya existen en el
payload.

---

## 4. Dependencias npm

Ninguna nueva. Se reutilizan `recharts` (ya instalado) y `lucide-react` (ya
instalado, para iconos de las nuevas tarjetas).

---

## 5. Componentes frontend

### 5.1 `frontend/src/components/Dashboard.jsx` (modificación)

**Cambios en el mapeo de datos** (sección donde hoy se calcula `lostTotal`):

```js
const disp     = data?.stats?.dispositions;
const total    = data?.stats?.total ?? 0;

// R1, R2, R5, R6 — derivar de dispositions, no de queryQueues/__lost__
const answered = disp?.ANSWERED?.count   ?? 0;
const noAnswer = disp?.['NO ANSWER']?.count ?? 0;
const busy     = disp?.BUSY?.count       ?? 0;
const failed   = disp?.FAILED?.count     ?? 0;

const answeredPct = disp?.ANSWERED?.pct     ?? 0;
const lostPct     = disp?.['NO ANSWER']?.pct ?? 0;
const busyPct     = disp?.BUSY?.pct          ?? 0;
const failedPct   = disp?.FAILED?.pct        ?? 0;

// R9, R10, R12 — desglose entrante/saliente
const inboundTotal  = data?.inbound?.stats?.total  ?? 0;
const outboundTotal = data?.outbound?.stats?.total ?? 0;
const inboundPct  = total > 0 ? Math.round((inboundTotal  / total) * 1000) / 10 : 0;
const outboundPct = total > 0 ? Math.round((outboundTotal / total) * 1000) / 10 : 0;
```

`lostTotal` (basado en `queues.find(q => q.queue === '__lost__')`) **se
elimina** como fuente de la tarjeta general "Perdidas" (R8). La variable
`queues` y el filtro `queues.filter(q => q.queue !== '__lost__')` para
`QueueCard` se mantienen sin cambios (R7).

**Cambios en el grid de StatCards** (reemplaza el bloque actual de 3
columnas):

```jsx
{/* Stat cards principales */}
<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
  <StatCard label="Total llamadas" value={total} icon={Phone} color="blue" />
  <StatCard label="Contestadas" value={answered} icon={PhoneCall} color="green"
    sub="del total" pct={answeredPct} />
  <StatCard label="Perdidas" value={noAnswer} icon={PhoneMissed} color="red"
    sub="sin atender, del total" pct={lostPct} />
</div>

{/* Ocupado + Fallidas + resumen de duración/canales */}
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  <StatCard label="Ocupado" value={busy} icon={PhoneOff} color="amber"
    sub="del total" pct={busyPct} />
  <StatCard label="Fallidas" value={failed} icon={AlertTriangle} color="slate"
    sub="del total" pct={failedPct} />
  <div className="card col-span-2 lg:col-span-2 flex flex-wrap items-center gap-8">
    {/* ... bloque de duración/canales activos existente, sin cambios ... */}
  </div>
</div>

{/* Desglose Entrantes / Salientes */}
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <StatCard label="Llamadas entrantes" value={inboundTotal} icon={PhoneIncoming} color="blue"
    sub="del total" pct={inboundPct} />
  <StatCard label="Llamadas salientes" value={outboundTotal} icon={PhoneOutgoing} color="blue"
    sub="del total" pct={outboundPct} />
</div>
```

Notas de implementación:
- Iconos confirmados disponibles en `node_modules/lucide-react` (`^0.376.0`):
  `PhoneOff`, `PhoneMissed`, `PhoneCall`, `PhoneIncoming`, `PhoneOutgoing`,
  `ArrowDownLeft`, `ArrowUpRight`. Usar `PhoneMissed` para "Perdidas" (icono
  ya en uso hoy para esa tarjeta) y `PhoneOff` para "Ocupado" — iconos
  distintos entre sí, sin mezclar significados.
- `PhoneIncoming` / `PhoneOutgoing` para "Llamadas entrantes" / "Llamadas
  salientes" respectivamente (alternativa: `ArrowDownLeft` / `ArrowUpRight`
  si se prefiere un estilo más genérico).
- El layout de 4 columnas (`lg:grid-cols-4`) para "Ocupado + Fallidas + bloque
  resumen" reduce el `col-span` del bloque resumen de 3 a 2 para dar espacio a
  la nueva tarjeta "Ocupado"; el implementer puede ajustar el grid (p.ej. usar
  `lg:grid-cols-6` con spans 1/1/4) siempre que las cuatro magnitudes
  (Contestadas, Perdidas, Ocupado, Fallidas) sean visibles como tarjetas
  individuales con su `pct`, y el bloque de duración/canales activos
  conserve su contenido actual sin pérdida de información.

### 5.2 `frontend/src/components/StatCard.jsx`

Sin cambios de API (mismas props `label, value, sub, color, icon, pct`). Se
reutiliza tal cual para las nuevas tarjetas "Ocupado", "Llamadas entrantes" y
"Llamadas salientes".

### 5.3 `frontend/src/components/DispositionChart.jsx`, `HourlyChart.jsx`, `ChannelTable.jsx`

Sin cambios (R15). El pie chart de `DispositionChart` ya usa
`dispositions.BUSY.count` y `dispositions['NO ANSWER'].count` — sus etiquetas
("Ocupado", "No Contest.") ya son coherentes con el nuevo significado de
"Perdidas"/"Ocupado" en las StatCards, por lo que no requiere cambios.

### 5.4 `QueueCard` (definido inline en `Dashboard.jsx`)

Sin cambios funcionales (R7). Sigue renderizándose solo cuando
`queues.filter(q => q.queue !== '__lost__').length > 0`, es decir, solo si
`config.queues` tiene entradas.

---

## 6. Decisión técnica clave

### Decisión: redefinir "Perdidas" en frontend a partir de `dispositions['NO ANSWER']`, sin tocar el backend

**Opción elegida:** Mapear la tarjeta "Perdidas" del dashboard general a
`data.stats.dispositions['NO ANSWER'].count` (y su `pct` ya calculado por
`queryStats`), y añadir una tarjeta separada "Ocupado" mapeada a
`dispositions.BUSY`. Esto hace que:

```
Total = ANSWERED.count + 'NO ANSWER'.count + BUSY.count + FAILED.count
      = Contestadas    + Perdidas          + Ocupado    + Fallidas
```

reconcilie exactamente, porque `total` en `queryStats` se calcula sumando
`Number(r.count)` de **todas** las filas que pasan `passesFilter` para
`direction = null`, agrupadas por `(channel, disposition)` — y las cuatro
claves de `base` (`ANSWERED`, `'NO ANSWER'`, `BUSY`, `FAILED`) cubren todos los
valores posibles de `disposition` en CDR de Asterisk (`ANSWERED | NO ANSWER |
BUSY | FAILED`, según `docs/existing_code.md`). No hay un "resto" sin
clasificar: cualquier `disposition` que no sea una de las cuatro reconocidas
no se suma a ningún `base[key].count`, **pero sí se suma a `total`** (línea
`total += Number(r.count)` está fuera del `if (base[d])`). En la práctica,
Asterisk solo emite esos cuatro valores, por lo que esta divergencia teórica
no se espera en producción; se documenta como caso límite conocido y no
requiere manejo especial (no se propone backend change para este edge case
porque alteraría el contrato `dispositions`/`total` usado por
`DispositionChart` y otros consumidores — fuera del alcance de esta feature).

**Opción descartada A — seguir usando `queryQueues.__lost__` pero con
`lostDestinations` por defecto siempre activo:**
Descartada porque `queryQueues` retorna `[]` completo si `queues` está vacío
(no solo `__lost__`), y porque `__lost__` se calcula con una query y un
criterio (`dst` ∈ `lostDestinations`) completamente distintos a
`dispositions`, lo que no garantiza `Total = suma de disposiciones` (dos
fuentes de verdad distintas para "perdidas" vs "total"). Habría requerido
modificar `queryQueues` para que siempre compute `__lost__` con
`allowedChannels`/`direction=null` sin depender de `queues.length > 0`,
tocando una función central reutilizada por otras features — mayor riesgo de
regresión para un problema que ya tiene una fuente de datos correcta
disponible (`dispositions`).

**Opción descartada B — añadir un nuevo campo `stats.lost` en el backend
calculado explícitamente como `NO ANSWER + BUSY`:**
Descartada por R14 (no modificar el payload) y porque es innecesaria:
`dispositions['NO ANSWER']` y `dispositions.BUSY` ya están en el payload con
`count` y `pct` precalculados; sumarlos (si se decidiera fusionar "Perdidas" +
"Ocupado" en una sola tarjeta) es una operación trivial en el frontend. Esta
spec opta por **mostrar Ocupado como tarjeta separada** (R5) en lugar de
fusionarlo dentro de "Perdidas", porque:
1. Es más informativo para el operador (BUSY suele indicar saturación de
   extensión/troncal, NO ANSWER indica que nadie atendió — causas y acciones
   correctivas distintas).
2. `DispositionChart` ya distingue "No Contest." de "Ocupado" como categorías
   separadas — mantener la misma taxonomía en las StatCards es consistente.
3. Si en el futuro se decide fusionar, es un cambio de una línea en el
   frontend (`lostTotal = noAnswer + busy`) sin tocar backend ni esta
   decisión arquitectónica.

### Decisión: desglose Entrantes/Salientes como StatCards adicionales, sin nueva consulta

**Opción elegida:** Dos `StatCard` nuevas ("Llamadas entrantes" / "Llamadas
salientes") leyendo `data.inbound.stats.total` / `data.outbound.stats.total`,
ya presentes en el payload (R9, R14).

**Opción descartada — gráfico de barras apiladas (Recharts) entrante/saliente
por hora:**
Descartada por alcance: el `acceptance` de la feature pide "el desglose del
total de llamadas entre Entrantes y Salientes (p. ej. nuevas StatCard o
sub-indicador)" — un gráfico adicional añade complejidad de layout y no es
requerido. `HourlyChart` ya muestra el total por hora; añadir series
in/out requeriría que `queryHourly` separe por dirección, lo cual
**no está disponible hoy** en `hourly` (solo en `inbound.hourly`, y
`outbound.hourly` no se calcula en `fetchData()` — ver Compatibilidad §7).
Si se desea esa visualización en el futuro, requeriría una feature aparte
con cambio de backend (`fetchData` debería añadir `outbound.hourly`).

### Caso límite documentado: `inbound.stats.total + outbound.stats.total` vs `total`

Verificado en `backend/server.js`:
- `total` (general) = `queryStats(..., direction = null)` → `passesFilter(ch,
  allowedChannels, null)` retorna `true` para **todo** canal (línea `return
  true;` al final de `passesFilter` cuando `direction` no es `'in'` ni
  `'out'`).
- `inbound.stats.total` = `queryStats(..., direction = 'in')` →
  `passesFilter(ch, allowedChannels, 'in')` retorna `true` solo si
  `allowedChannels.includes(extractChannel(ch))` (cuando `allowedChannels` no
  es null/vacío) — si `allowedChannels` es `null`/`[]`, retorna
  `direction !== 'out'` → `true` para `'in'`.
- `outbound.stats.total` = `queryStats(..., direction = 'out')` →
  `passesFilter` excluye canales `Local/*` y, si `allowedChannels` está
  configurado, excluye los canales que SÍ están en `allowedChannels`.

**Conclusión:**
- Si `config.channels` (allowedChannels) **no está configurado**
  (`null`/`[]`): `passesFilter` retorna `true` para `direction='in'` en todo
  canal, y para `direction='out'` retorna `true` salvo `Local/*`. Esto puede
  producir **doble conteo** (`inbound.total + outbound.total > total`) para
  canales no-`Local/*`, ya que el mismo registro pasa ambos filtros.
- Si `config.channels` **está configurado**: cada canal cae en exactamente un
  bucket (`in` si está en la lista y no es `out`; `out` si no está en la lista
  y no es `Local/*`), salvo los canales `Local/*`, que **no pasan ningún
  filtro** `direction='in'` (`inList` sería `false` si `Local/...` no está en
  `allowedChannels`, lo cual es lo normal) ni `direction='out'` (excluidos
  explícitamente) — estos quedan **sin clasificar**, produciendo
  `inbound.total + outbound.total < total` cuando hay tráfico en canales
  `Local/*`.

Por tanto **no se debe asumir `inbound.total + outbound.total === total`** en
ningún caso de configuración. R11 cubre este caso: el frontend muestra los
tres valores tal cual vienen del backend, sin forzar reconciliación ni lanzar
errores. No se propone "Otros" calculado como `total -
(inbound.total+outbound.total)` porque podría dar **negativo** en el caso de
doble conteo (`allowedChannels` vacío) — mostrar un número negativo sería
confuso. El indicador "Otros"/diferencia es **opcional** y, si se implementa,
debe usar `Math.max(0, total - inbound.total - outbound.total)` o similar y
documentarse como aproximado; el implementer puede omitirlo sin incumplir
R9–R12.

---

## 7. Compatibilidad v1.0

- **Ningún endpoint existente cambia** de ruta, método, payload o status code:
  `/api/calls/today`, `/api/calls/range`, `/api/events` (SSE) permanecen
  idénticos.
- `queryStats`, `queryChannels`, `queryHourly`, `queryQueues`, `fetchData`,
  `extractChannel`, `passesFilter`, `todayRange`, `toMySQLDate` — **ninguna se
  modifica**.
- El bloque de `QueueCard` / colas configuradas (`config.queues`) sigue
  funcionando exactamente igual (R7) — solo deja de alimentar la tarjeta
  general "Perdidas".
- `InboundView.jsx`, `OutboundView.jsx`, `HistoricalView.jsx`,
  `ChannelAliasManager.jsx`, `Layout.jsx`, `App.jsx` — sin cambios (R15); no
  se añaden rutas nuevas.
- `outbound.hourly` **no existe** en el payload actual (`fetchData` solo
  calcula `outbound.stats` y `outbound.channels`, no `outbound.hourly`) — se
  documenta aquí porque podría asumirse erróneamente que existe; esta feature
  no lo necesita ni lo añade.

---

## 8. Limitación conocida — tests de frontend

El proyecto **no tiene Vitest/ESLint configurados en `frontend/`** (ver
`CLAUDE.md` raíz: "Frontend: aún sin Vitest/ESLint configurados — no usar
`npm test`/`npm run lint` en `frontend/`"). Esta feature no modifica backend,
por lo que no hay `backend/tests/*.test.js` nuevos que escribir (no hay R<n>
de backend que probar con Jest/Supertest).

La verificación de R1–R13 se realiza mediante:
1. Verificación manual contra `/api/calls/today` real (o `/api/calls/range`
   con un rango con datos conocidos), comprobando aritméticamente que
   `Total = Contestadas + Perdidas + Ocupado + Fallidas` en los valores
   mostrados.
2. Verificación manual con `config.queues` vacío y configurado (dos arranques
   del backend con distinto `config.json`), confirmando R3 y R7.
3. Inspección visual del payload SSE en DevTools (Network → EventStream) para
   confirmar R13 tras un `update`.

`tasks.md` detalla esta verificación como checklist explícito (T-final).
