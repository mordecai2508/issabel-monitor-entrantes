# design.md — channels_inbound_outbound_split

> Feature #20. Diseño del cambio de `config.channels` (array plano) a
> `config.channels = { inbound: [...], outbound: [...] }`, con migración
> automática y filtrado explícito por dirección.

---

## 1. Endpoints nuevos

Ninguno. Esta feature **no añade endpoints**; modifica el comportamiento y el
payload de respuesta de endpoints ya existentes y revisa la lista que devuelve
`/api/admin/channels`.

| Método | Ruta | Auth | Cambio |
|---|---|---|---|
| GET | `/api/calls/today` | Sesión | Sin cambio de forma; `inbound`/`outbound` ahora derivan de `channels.inbound`/`channels.outbound` |
| GET | `/api/calls/range` | Sesión | Igual que arriba |
| GET | `/api/events` (SSE `init`/`update`) | Sesión | Igual que arriba |
| GET | `/api/calls/outbound` | Sesión | El filtro de troncal pasa de "exclusión de `channels` (inbound)" a "inclusión explícita de `channels.outbound`" |
| GET | `/api/calls/outbound/export` | Sesión | Igual que arriba |
| GET | `/api/admin/channels` | Admin | Respuesta cambia de `[{channel, alias}]` a `[{channel, direction, alias}]` (ver sección 5) |
| PUT | `/api/admin/channels/:channel` | Admin | Sin cambio de payload de entrada/salida; cambia solo la validación de existencia (busca en `inbound` **o** `outbound`) |

No se añaden nuevas rutas REST ni nuevos query params obligatorios.

---

## 2. Cambios BD SQLite

Ninguno. Esta feature no toca `backend/db/setup.js` ni `monitor.sqlite`. Toda
la configuración sigue viviendo en `backend/config.json` (igual que v1.0; no
se introduce una nueva entidad en config.json, solo se reestructura la
existente `channels`, lo cual está permitido porque es una migración de una
clave ya existente, no una clave nueva).

---

## 3. Queries CDR nuevas

Ninguna query SQL nueva. Las queries existentes (`queryStats`, `queryChannels`,
`queryHourly`, `queryQueues` en `backend/server.js`, y
`buildOutboundWhereClause`/`queryOutbound`/`queryOutboundExport` en
`backend/services/cdrService.js`) se mantienen igual a nivel de SQL — solo
cambia **qué lista de canales** se pasa como parámetro de filtrado en memoria
o en la cláusula `WHERE`.

### 3.1 `passesFilter` (server.js)

Firma actual:
```js
function passesFilter(channel, allowedChannels, direction)
```

Nueva firma (mantiene compatibilidad de nombre de función y orden de los tres
primeros parámetros que ya consumen `queryStats`/`queryChannels`/`queryHourly`/
`queryQueues`):

```js
// inboundChannels y outboundChannels son arrays (pueden estar vacíos, nunca null/undefined)
function passesFilter(channel, inboundChannels, outboundChannels, direction) {
  const ch = extractChannel(channel);

  if (direction === 'out') {
    if (ch.startsWith('Local/')) return false;
    return outboundChannels.includes(ch);          // R8, R9, R10
  }

  if (direction === 'in') {
    return inboundChannels.includes(ch);            // R7
  }

  return true; // direction = null → todos (R11)
}
```

`queryStats`, `queryChannels`, `queryHourly`, `queryQueues` reciben ahora
`(pool, from, to, inboundChannels, outboundChannels, direction, ...)` en lugar
de `(pool, from, to, allowedChannels, direction, ...)`. Esto es un cambio de
firma interno a `server.js`; no afecta a ningún router externo porque estas
funciones no se exportan ni se usan fuera de `server.js`.

### 3.2 `buildOutboundWhereClause` (cdrService.js)

Cambia de "NOT LIKE de cada canal de `allowedChannels` (inbound)" a "LIKE OR
de cada canal de `channels.outbound`" + exclusión de `Local/`:

```js
function buildOutboundWhereClause(filters, outboundChannels) {
  const conditions = [];
  const params = [];

  conditions.push('calldate >= ?');
  params.push(filters.from + ' 00:00:00');
  conditions.push('calldate <= ?');
  params.push(filters.to + ' 23:59:59');

  conditions.push("channel NOT LIKE 'Local/%'");

  if (!outboundChannels || outboundChannels.length === 0) {
    // R10: sin troncales salientes configuradas → ningún resultado
    conditions.push('1 = 0');
  } else {
    const orParts = outboundChannels.map(() => "channel LIKE CONCAT(?, '%')");
    conditions.push(`(${orParts.join(' OR ')})`);
    for (const ch of outboundChannels) params.push(ch);
  }

  // ... filtros opcionales (trunk, extension, dest, disposition) sin cambios
  return { conditions, params };
}
```

`queryOutbound` / `queryOutboundExport` reciben `outboundChannels` (en vez de
`allowedChannels`) desde `backend/routes/outbound.js`, que a su vez lo obtiene
de `config.channels.outbound` (con default `[]`).

`1 = 0` es una condición SQL constante estándar para "sin resultados"; se
prefiere sobre lanzar un error porque mantiene el contrato HTTP 200 con
`data: [], meta: { total: 0, ... }` (consistente con R3 de `docs/specs.md` /
`inbound_filters_export`: "sin registros → 200 con total = 0").

---

## 4. Dependencias npm

Ninguna dependencia nueva. No se requiere `exceljs`, `pdfkit` ni librerías
adicionales — el cambio es de configuración y lógica de filtrado existente.

---

## 5. Componentes frontend

### 5.1 `ChannelAliasManager.jsx` (`/admin/channels`)

**Cambio mínimo, compatible con la UI existente** (decisión técnica, ver
sección 6): se mantiene una sola tabla, pero cada canal se lista una vez por
cada lista (`inbound`/`outbound`) en la que aparece, y se añade una columna
"Dirección" con una etiqueta de solo lectura (`Entrante` / `Saliente`).

Forma de la respuesta de `GET /api/admin/channels`:

```json
{
  "ok": true,
  "channels": [
    { "channel": "SIP/ENT_LIWA",           "direction": "inbound",  "alias": "Liwa" },
    { "channel": "SIP/NET2_ENT_6076854970","direction": "inbound",  "alias": "Net2Phone" },
    { "channel": "SIP/SALIENTE_CALL",      "direction": "outbound", "alias": "" }
  ]
}
```

Cambios en `ChannelAliasManager.jsx`:
- Añadir una columna "Dirección" entre "Canal (técnico)" y "Nombre a mostrar",
  mostrando una badge (`Entrante` en azul / `Saliente` en ámbar, p.ej. mismas
  clases Tailwind que usan otras badges del proyecto).
- Opcional (no bloqueante, fuera de alcance de v1 de esta feature si el
  reviewer lo considera "nice to have"): agrupar visualmente la tabla en dos
  secciones ("Canales entrantes" / "Canales salientes") usando el mismo
  array ya ordenado por `direction` que devuelve el backend — no requiere
  cambios adicionales de API.
- `saveAlias(channel)` sigue llamando a `api.updateChannelAlias(channel, alias)`
  sin cambios de firma; si el mismo nombre de canal aparece en ambas
  direcciones (caso R19), ambas filas comparten el mismo `alias` tras guardar
  (el backend usa `channelAliases[channel]` como clave única por nombre de
  canal, no por dirección — un alias es del canal, no de la dirección).

`frontend/src/api.js`: sin cambios — `adminChannels()` y
`updateChannelAlias(channel, alias)` mantienen su firma.

### 5.2 `OutboundView.jsx`

Sin cambios de componente. Sigue llamando a
`GET /api/calls/outbound?from=&to=&...` vía `api.js`; el cambio de
comportamiento (qué se considera "saliente") ocurre enteramente en el backend
(`cdrService.buildOutboundWhereClause`). Se debe verificar manualmente tras el
cambio (ver `tasks.md` T9) que con `channels.outbound = ["SIP/SALIENTE_CALL"]`
configurado, la vista sigue mostrando llamadas salientes reales y deja de
mostrar llamadas extensión-a-extensión.

### 5.3 Otros componentes (`Dashboard.jsx`, `InboundView.jsx`, `HistoricalView.jsx`)

Sin cambios. Consumen `data.inbound` / `data.outbound` / `data.stats` /
`data.channels` / `data.hourly` de `/api/calls/today`, `/api/calls/range` y
SSE — formas de respuesta sin cambios (R14–R16).

---

## 6. Decisión técnica clave

### 6.1 Estructura de `channels`: objeto `{inbound, outbound}` vs. dos claves planas

**Elegido**: `config.channels = { inbound: [...], outbound: [...] }` (objeto
anidado bajo la clave existente `channels`).

**Descartado**: introducir dos claves nuevas al nivel raíz,
`config.channelsInbound` / `config.channelsOutbound`.

**Razón**: el `feature_list.json` (#20, acceptance) especifica explícitamente
`channels.inbound` / `channels.outbound`. Además, mantener todo bajo la clave
`channels` ya existente facilita la migración (basta con transformar el valor
de una clave, no añadir/quitar claves de nivel raíz) y es más legible en
`config.json`.

### 6.2 Comportamiento cuando `channels.outbound` está vacío

**Elegido**: si `channels.outbound` está vacío o no configurado,
`direction='out'` no devuelve ningún registro (R10) — tanto en
`queryStats`/`queryChannels`/`queryHourly` (vía `passesFilter` devolviendo
`false` siempre) como en `/api/calls/outbound` (vía `1 = 0` en el `WHERE`).

**Descartado — opción A**: caer al comportamiento legado v1.0 ("todo lo que no
está en `channels.inbound`, excepto `Local/`"). Se descarta porque es
exactamente el bug que esta feature corrige: seguiría contando llamadas
extensión-a-extensión como salientes en instalaciones que aún no configuraron
`channels.outbound` tras la migración automática (que siempre produce
`outbound: []`).

**Descartado — opción B**: lanzar un error 4xx/5xx cuando `direction='out'` y
`channels.outbound` está vacío. Se descarta porque rompería
`/api/calls/today`, `/api/calls/range` y SSE `init`/`update` (R14–R16), que
siempre solicitan `direction='out'` como parte de `fetchData()` — un error ahí
tumbaría el dashboard completo, no solo la sección "salientes".

**Consecuencia operativa**: tras la migración automática de una instalación
v1.0 existente, la sección "Salientes" del dashboard y `/api/calls/outbound`
mostrarán 0 resultados hasta que un administrador configure
`channels.outbound` (vía edición manual de `config.json`, ya que esta feature
no añade un endpoint de administración para *añadir/quitar* canales de las
listas — solo para gestionar alias y ver la dirección, ver sección 6.3). Esto
se debe documentar en las notas de despliegue / `progress/`.

### 6.3 Alcance de `ChannelAliasManager` — gestión de listas vs. solo visualización

**Elegido**: `GET /api/admin/channels` pasa a listar canales de ambas listas
con un campo `direction` de solo lectura; `PUT /api/admin/channels/:channel`
sigue gestionando **solo el alias** (sin cambios de payload). Mover un canal
de `inbound` a `outbound` (o añadir/quitar canales de las listas) sigue siendo
una edición manual de `config.json`.

**Descartado**: añadir un endpoint `PUT /api/admin/channels/:channel/direction`
o un selector editable de dirección en la UI que reescriba
`channels.inbound`/`channels.outbound`.

**Razón**: el criterio de aceptación dice "permite **ver/gestionar** ambas
listas... sin romper la gestión de alias existente" — el requisito mínimo
verificable es la *visibilidad* de la dirección y que la gestión de alias siga
funcionando. Añadir edición de pertenencia a listas implica validar
duplicados, canales con sufijos dinámicos, y coordinarlo con
`buildOutboundWhereClause` (que usa `LIKE CONCAT(?, '%')`, sensible a
prefijos) — se considera una feature separada y se deja fuera de alcance
explícitamente. El `design.md` deja la puerta abierta (estructura ya soporta
`direction` por entrada) para una futura feature de edición.

---

## 7. Compatibilidad con v1.0

- **`/api/calls/today`, `/api/calls/range`, SSE `init`/`update`**: misma forma
  de respuesta (R14–R16). El único cambio observable es el **contenido** de
  `outbound.*` (deja de incluir extensión-a-extensión; ver R12/R13) y, si
  `channels.outbound` no está configurado tras la migración, `outbound.*`
  quedará en ceros hasta que se configure (ver 6.2).
- **`/api/calls/outbound` y `/export`**: misma forma de respuesta
  (`{ ok, data, meta }` / archivo descargable); cambia el conjunto de
  resultados según 6.2/R17.
- **`/api/admin/channels`**: cambia la forma del array de respuesta (se añade
  `direction`); es un cambio de contrato menor pero **observable**. Se
  documenta en `tasks.md` como parte del checklist de implementación y se
  verifica que `ChannelAliasManager.jsx` se actualiza en el mismo PR/commit
  (no debe quedar un frontend v1.0 leyendo un backend v2.0 sin el campo
  `direction`, ya que el componente simplemente ignoraría el campo nuevo y
  seguiría funcionando — no hay ruptura dura, pero sí se pierde la
  visualización de dirección si no se actualiza).
- **`/api/admin/channels/:channel` (PUT)**: mismo payload de entrada/salida;
  la validación de existencia ahora comprueba `channels.inbound` **o**
  `channels.outbound` (antes solo `channels`), por lo que canales que antes
  daban 404 por no estar en la única lista plana ahora pueden existir si están
  en `outbound` — esto es una *ampliación* de casos válidos, no una ruptura.
- **`channelAliases`**: clave sin cambios de forma (`{ [channelName]: alias }`);
  ningún alias existente se pierde en la migración (R3, R23).
- **CDR (MySQL `asteriskcdrdb`)**: ninguna escritura; todas las queries
  existentes (`SELECT` con `?`) se mantienen, solo cambian los valores/listas
  pasados como parámetros (R22).
