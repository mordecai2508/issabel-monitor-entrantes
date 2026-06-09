# Design — outbound_filters_export

---

## 1. Endpoints nuevos

| Método | Ruta | Auth | Query params | Payload salida | HTTP codes |
|--------|------|------|-------------|----------------|------------|
| GET | `/api/calls/outbound` | `requireAuth` | `from` (YYYY-MM-DD, req), `to` (YYYY-MM-DD, req), `trunk` (string, opt), `extension` (string, opt), `dest` (string, opt), `disposition` (ANSWERED\|NO ANSWER\|BUSY\|FAILED, opt), `page` (int ≥1, default 1), `limit` (int 1-500, default 100) | `{ ok, data: [...], meta: { total, page, limit, totalPages } }` | 200, 400, 401, 500 |
| GET | `/api/calls/outbound/export` | `requireAuth` | Mismos filtros de fecha/troncal/extensión/dest/disposition + `format` (xlsx\|pdf, req) | Stream binario (Content-Disposition: attachment) | 200, 400, 401, 504, 500 |

### Respuesta estándar de lista (HTTP 200)

```json
{
  "ok": true,
  "data": [
    {
      "calldate": "2026-06-07T14:35:22.000Z",
      "src": "101",
      "dst": "3001234567",
      "dstchannel": "SIP/troncal-claro",
      "duration": 185,
      "billsec": 180,
      "disposition": "ANSWERED"
    }
  ],
  "meta": {
    "total": 832,
    "page": 1,
    "limit": 100,
    "totalPages": 9
  }
}
```

---

## 2. Funciones nuevas en cdrService.js

Las funciones `queryOutbound` y `queryOutboundExport` se añaden al archivo
existente `backend/services/cdrService.js` como nuevas exportaciones. No se
modifica ni reimplementa ninguna función existente.

### Cómo distinguir llamadas salientes en el CDR

En Asterisk/Issabel, una llamada saliente queda registrada en la tabla `cdr` con:
- `channel`: canal de la extensión interna que realizó la llamada (ej. `SIP/101-00a1b2c3`).
  Su nombre normalizado NO aparece en la lista `allowedChannels` de config.json.
- `dstchannel`: canal de la troncal saliente utilizada (ej. `SIP/troncal-claro-00b3c4d5`).
  Su nombre normalizado SÍ aparece en `allowedChannels`.

Esta es exactamente la lógica de `passesFilter(channel, allowedChannels, 'out')` en
`server.js`: una llamada es saliente si su `channel` NO está en `allowedChannels`
(y no empieza por `Local/`).

Dado que `cdrService.js` opera de forma independiente a `server.js`, la condición
equivalente en SQL es: se incluyen registros cuyo `channel` (normalizado) **no**
aparece en la lista de canales configurados. Como la lista de canales permitidos
es estática (viene de `config.json`), se pasa como parámetro al router y de ahí
a las funciones del servicio.

**Estrategia SQL elegida para el filtro de dirección:** igual que la feature `inbound`,
se usa `channel NOT LIKE CONCAT(?, '%')` con cada canal de `allowedChannels`, generando
condiciones `AND channel NOT LIKE 'SIP/troncal-A%' AND channel NOT LIKE 'SIP/troncal-B%'`.
Esto es equivalente al filtro `direction='out'` de `passesFilter` y es compatible con
todas las versiones de MySQL/MariaDB soportadas por Issabel.

También se excluyen canales `Local/`:
```sql
AND channel NOT LIKE 'Local/%'
```

### Filtro de troncal saliente

El parámetro `trunk` filtra por `dstchannel` (no por `channel`, que es la extensión origen).
Se usa la misma técnica LIKE prefix que en inbound:
```sql
AND (? IS NULL OR dstchannel LIKE CONCAT(?, '%'))
```

### Función `buildOutboundWhereClause(filters, allowedChannels)`

```js
function buildOutboundWhereClause(filters, allowedChannels) {
  // filters: { from, to, trunk, extension, dest, disposition }
  // allowedChannels: string[] de canales configurados (troncales entrantes)

  const conditions = [];
  const params = [];

  // Date range (required)
  conditions.push('calldate >= ?');
  params.push(filters.from + ' 00:00:00');

  conditions.push('calldate <= ?');
  params.push(filters.to + ' 23:59:59');

  // Excluir canales Local/
  conditions.push("channel NOT LIKE 'Local/%'");

  // Excluir canales de troncales entrantes (= llamadas salientes)
  if (allowedChannels && allowedChannels.length > 0) {
    for (const ch of allowedChannels) {
      conditions.push('channel NOT LIKE CONCAT(?, \'%\')');
      params.push(ch);
    }
  }

  // Optional: trunk filter on dstchannel
  if (filters.trunk) {
    conditions.push('dstchannel LIKE CONCAT(?, \'%\')');
    params.push(filters.trunk);
  }

  // Optional: extension partial match on src
  if (filters.extension) {
    conditions.push('src LIKE CONCAT(\'%\', ?, \'%\')');
    params.push(filters.extension);
  }

  // Optional: dest partial match on dst
  if (filters.dest) {
    conditions.push('dst LIKE CONCAT(\'%\', ?, \'%\')');
    params.push(filters.dest);
  }

  // Optional: disposition exact match
  if (filters.disposition) {
    conditions.push('UPPER(disposition) = UPPER(?)');
    params.push(filters.disposition);
  }

  return { conditions, params };
}
```

### Función `mapOutboundRow(row, extractChannelFn)`

```js
function mapOutboundRow(row, extractChannelFn) {
  return {
    calldate:   row.calldate instanceof Date ? row.calldate.toISOString() : row.calldate,
    src:        row.src,
    dst:        row.dst,
    dstchannel: extractChannelFn(row.dstchannel),
    duration:   Number(row.duration),
    billsec:    Number(row.billsec),
    disposition: row.disposition,
  };
}
```

### `async function queryOutbound(pool, filters, pagination, allowedChannels, extractChannelFn)`

Ejecuta dos queries SQL con parámetros preparados:

**Query de conteo:**
```sql
SELECT COUNT(*) AS total
FROM cdr
WHERE calldate >= ?
  AND calldate <= ?
  AND channel NOT LIKE 'Local/%'
  -- Por cada canal en allowedChannels:
  AND channel NOT LIKE CONCAT(?, '%')
  -- Filtros opcionales:
  AND (dstchannel LIKE CONCAT(?, '%'))   -- si trunk activo
  AND (src LIKE CONCAT('%', ?, '%'))      -- si extension activo
  AND (dst LIKE CONCAT('%', ?, '%'))      -- si dest activo
  AND (UPPER(disposition) = UPPER(?))     -- si disposition activo
```

**Query de datos paginada:**
```sql
SELECT
  calldate,
  src,
  dst,
  dstchannel,
  duration,
  billsec,
  disposition
FROM cdr
WHERE <mismas condiciones>
ORDER BY calldate DESC
LIMIT ? OFFSET ?
```

Retorna: `{ rows: [...], meta: { total, page, limit, totalPages } }`.

### `async function queryOutboundExport(pool, filters, allowedChannels, extractChannelFn)`

Igual que la query de datos pero sin paginación y con `LIMIT MAX_EXPORT_ROWS` (10000).
Retorna el array de filas mapeadas con `mapOutboundRow`.

### Exports actualizados de cdrService.js

```js
module.exports = {
  queryInbound,
  queryInboundExport,
  queryOutbound,       // nuevo
  queryOutboundExport, // nuevo
  MAX_EXPORT_ROWS,
};
```

---

## 3. Reutilización de exportService.js

Las funciones `toXlsx` y `toPdf` de `backend/services/exportService.js` son genéricas:
aceptan `rows`, `res`, `filenameBase` (y `filters` en el caso de PDF) y no asumen nada
sobre el contenido semántico de las columnas.

Para llamadas salientes, el router `outbound.js` invoca estas mismas funciones con:

**Excel:**
```js
await toXlsx(rows, res, `salientes_${filters.from}_${filters.to}`, truncated);
```

Sin embargo, `toXlsx` actualmente incluye una fila de cabecera hardcodeada con
etiquetas para "entrantes" (`['Fecha/Hora', 'Origen', 'Destino', 'Troncal', ...]`).
Para reutilizarla sin modificarla, se pasa `headers` como parámetro adicional en
la firma. **Si toXlsx ya acepta `headers` como parámetro opcional**, se usa; si no,
se refactoriza toXlsx para aceptar un parámetro `headers` opcional (con valor por
defecto el array de entrantes), añadiendo un parámetro al final de la firma sin
romper las llamadas existentes.

Headers para salientes:
```js
['Fecha/Hora', 'Extensión', 'Destino', 'Troncal', 'Duración (s)', 'Seg. facturados', 'Estado']
```

**PDF:**
```js
toPdf(rows, res, `salientes_${filters.from}_${filters.to}`, filters, truncated);
```

`toPdf` ya acepta `filters` y construye dinámicamente el resumen de filtros activos.
Solo el título del PDF cambia: "Llamadas Salientes — Búsqueda". Para esto, `toPdf`
también acepta un parámetro `title` opcional (con valor por defecto `'Llamadas Entrantes — Búsqueda'`),
añadido al final de la firma sin romper las llamadas existentes.

Los headers de tabla del PDF para salientes serán:
```js
['Fecha/Hora', 'Extensión', 'Destino', 'Troncal', 'Duración (s)', 'Seg. fact.', 'Estado']
```

El helper `drawTable` es independiente de la semántica; solo recibe headers y rows,
por lo que funciona sin cambios.

**Nota:** Los parámetros adicionales (`headers`, `title`) se añaden como últimos parámetros
opcionales con valores por defecto. Las llamadas existentes desde `inbound.js` no se modifican
y siguen funcionando con los valores por defecto actuales.

---

## 4. Dependencias nuevas

Ninguna. `exceljs` y `pdfkit` ya están instalados como dependencias del proyecto
(instalados durante la feature `inbound_filters_export`).

---

## 5. Componente frontend OutboundTable.jsx

### Decisión: crear `OutboundTable.jsx`, mantener `OutboundView.jsx`

`OutboundView.jsx` muestra KPIs agregados de salientes en tiempo real vía SSE.
`OutboundTable.jsx` es la nueva vista de búsqueda individual con filtros ad-hoc.
**Coexistirán** bajo la misma sección del sidebar:

- `/outbound` → `OutboundView.jsx` (vista en vivo, sin cambios — v1.0)
- `/outbound/search` → `OutboundTable.jsx` (nueva vista de búsqueda con filtros)

### Estructura de `OutboundTable.jsx`

**Props:** ninguna (componente de página autónomo).

**Estado local:**
```
filters: { from, to, trunk, extension, dest, disposition }
appliedFilters: object | null
page: number
sortCol: string
sortDir: 'asc' | 'desc'
rows: array
meta: { total, page, limit, totalPages }
loading: boolean
error: string | null
trunks: array
```

**Constantes:**
```js
const DISPOSITION_OPTIONS = [
  { value: '',          label: 'Todas' },
  { value: 'ANSWERED',  label: 'Contestada' },
  { value: 'NO ANSWER', label: 'No contestada' },
  { value: 'BUSY',      label: 'Ocupado' },
  { value: 'FAILED',    label: 'Fallida' },
];

const COLUMNS = [
  { key: 'calldate',    label: 'Fecha/Hora' },
  { key: 'src',         label: 'Extensión' },
  { key: 'dst',         label: 'Destino' },
  { key: 'dstchannel',  label: 'Troncal' },
  { key: 'duration',    label: 'Duración (s)' },
  { key: 'billsec',     label: 'Seg. fact.' },
  { key: 'disposition', label: 'Estado' },
];
```

**UI — Panel de filtros (siempre visible):**
- DateRangePicker: dos `<input type="date">` para `from`/`to`
- Dropdown `<select>` con troncales (obtenidas de `GET /api/admin/channels`; si 403, solo "Todas")
- `<input type="text">` para extensión origen (búsqueda parcial sobre `src`)
- `<input type="text">` para número destino (búsqueda parcial sobre `dst`)
- `<select>` para disposition: Todas / Contestada / No contestada / Ocupado / Fallida
- Botón "Buscar" (aplica filtros) / Botón "Limpiar" (resetea a defaults)

**UI — Botones de exportación** (solo visibles si `meta.total > 0`):
- "Exportar Excel" → descarga `/api/calls/outbound/export?format=xlsx&<filtros activos>`
- "Exportar PDF" → descarga `/api/calls/outbound/export?format=pdf&<filtros activos>`
- Nota "hasta 10,000 filas"
- Descarga mediante elemento `<a>` temporal con `href` + `click()` (igual que `InboundTable.jsx`)

**UI — Tabla de resultados:**
- Columnas: Fecha/Hora, Extensión, Destino, Troncal, Duración (s), Seg. fact., Estado
- Cabeceras clickeables para ordenar (icono asc/desc, ordenamiento client-side)
- Badge de color en columna Estado (verde=ANSWERED, amarillo=NO ANSWER, rojo=BUSY/FAILED)

**UI — Paginación:**
- Botones Anterior / Siguiente + indicador "Página N de M (total T registros)"

**UI — Estados:**
- Spinner de carga durante fetch (`animate-spin`)
- Banner de error rojo con mensaje
- Mensaje vacío "No se encontraron registros para los filtros seleccionados"

**Lógica de fetch:**
Todas las llamadas HTTP pasan por `src/api.js`. Se añade el método `outboundCalls(params)`
al objeto `api` existente, análogo a `api.inboundCalls`. El componente usa `useState` +
`useEffect` + `useCallback` (mismo patrón que `InboundTable.jsx`).

**URL de exportación construida:**
```js
function buildExportUrl(format) {
  const params = new URLSearchParams({
    from: appliedFilters.from,
    to:   appliedFilters.to,
    format,
  });
  if (appliedFilters.trunk)       params.set('trunk',       appliedFilters.trunk);
  if (appliedFilters.extension)   params.set('extension',   appliedFilters.extension);
  if (appliedFilters.dest)        params.set('dest',        appliedFilters.dest);
  if (appliedFilters.disposition) params.set('disposition', appliedFilters.disposition);
  return `/api/calls/outbound/export?${params.toString()}`;
}
```

---

## 6. Decisión técnica — por qué extender cdrService.js en lugar de crear uno nuevo

**Opción elegida:** añadir `queryOutbound` y `queryOutboundExport` al archivo
`backend/services/cdrService.js` existente.

**Alternativa descartada:** crear `backend/services/outboundCdrService.js` separado.

**Razones para elegir extensión en lugar de archivo nuevo:**

1. **Cohesión semántica:** Todas las consultas sobre la tabla CDR de Issabel comparten el
   mismo dominio. Separar inbound/outbound en archivos distintos fragmentaría lógica que
   comparte constantes (`MAX_EXPORT_ROWS`), helpers (`buildWhereClause`, `mapRow`) y el
   contrato de la pool MySQL.

2. **Reutilización de helpers internos:** `buildWhereClause` y `mapRow` son funciones
   privadas (no exportadas) de `cdrService.js`. Si se creara un archivo separado, habría
   que duplicarlas o hacerlas públicas, aumentando el surface area del módulo.

3. **Patrón establecido:** El proyecto ya sigue el patrón de un único `cdrService.js`
   como capa de acceso a CDR. Los routers (`inbound.js`, `outbound.js`) son los que
   separan la responsabilidad de HTTP; el servicio agrupa la lógica de datos.

4. **Tamaño manejable:** Añadir ~80 líneas a un archivo de ~130 no degrada la
   mantenibilidad. El umbral de separación justificada sería si el archivo superara
   las 500 líneas de lógica sustancial.

---

## 7. Compatibilidad con v1.0

| Endpoint / componente existente | Cambio | Justificación |
|---------------------------------|--------|---------------|
| `GET /api/calls/today` | Ninguno | No se toca |
| `GET /api/calls/range` | Ninguno | No se toca |
| `GET /api/events` (SSE) | Ninguno | No se toca |
| `POST /api/auth/login` | Ninguno | No se toca |
| `GET /api/calls/inbound` | Ninguno | No se toca |
| `GET /api/calls/inbound/export` | Ninguno | No se toca |
| `GET /api/admin/channels` | Ninguno | Se reutiliza para el dropdown de troncales |
| `/outbound` (ruta frontend) | Ninguno | `OutboundView.jsx` sin cambios |
| `backend/services/exportService.js` | Parámetros opcionales añadidos al final | Retrocompatible |
| `backend/services/cdrService.js` | Nuevas funciones añadidas; exports ampliados | Retrocompatible |

La única modificación a `server.js` es una línea de `require()` para montar el
nuevo router `outbound.js`. No se altera ninguna función existente.

`Layout.jsx` recibe un nuevo ítem en el sidebar ("Búsqueda salientes" → `/outbound/search`),
pero la estructura existente del sidebar y las rutas actuales no cambian.
