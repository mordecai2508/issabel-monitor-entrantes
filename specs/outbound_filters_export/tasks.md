# Tasks — outbound_filters_export

> El implementer sigue este orden exacto. Marcar `[x]` al completar cada tarea.
> No iniciar la siguiente tarea hasta que la anterior esté completa y sin errores.

---

- [x] **T1. Añadir `queryOutbound` y `queryOutboundExport` a `backend/services/cdrService.js`**

  Abrir el archivo existente `backend/services/cdrService.js` y añadir, sin modificar
  las funciones existentes (`queryInbound`, `queryInboundExport`, `buildWhereClause`,
  `mapRow`, `MAX_EXPORT_ROWS`):

  **Función privada `buildOutboundWhereClause(filters, allowedChannels)`:**
  - Añade condición de rango de fechas (`calldate >= ?` y `calldate <= ?`).
  - Añade `AND channel NOT LIKE 'Local/%'` (siempre).
  - Por cada canal en `allowedChannels`, añade `AND channel NOT LIKE CONCAT(?, '%')`.
  - Si `filters.trunk`: añade `AND dstchannel LIKE CONCAT(?, '%')`.
  - Si `filters.extension`: añade `AND src LIKE CONCAT('%', ?, '%')`.
  - Si `filters.dest`: añade `AND dst LIKE CONCAT('%', ?, '%')`.
  - Si `filters.disposition`: añade `AND UPPER(disposition) = UPPER(?)`.
  - Retorna `{ conditions, params }`.

  **Función privada `mapOutboundRow(row, extractChannelFn)`:**
  - Retorna `{ calldate (ISO 8601), src, dst, dstchannel (normalizado con extractChannelFn), duration, billsec, disposition }`.

  **Función exportada `async queryOutbound(pool, filters, pagination, allowedChannels, extractChannelFn)`:**
  - `filters`: `{ from, to, trunk?, extension?, dest?, disposition? }`.
  - `pagination`: `{ page?, limit? }` (defaults 1 y 100).
  - `allowedChannels`: array de canales configurados (puede ser null o []).
  - Ejecuta query de conteo (`SELECT COUNT(*) AS total FROM cdr WHERE ...`).
  - Ejecuta query de datos (`SELECT calldate, src, dst, dstchannel, duration, billsec, disposition FROM cdr WHERE ... ORDER BY calldate DESC LIMIT ? OFFSET ?`).
  - Usa parámetros preparados (`?`). Nunca concatenar strings en SQL.
  - Mapea filas con `mapOutboundRow`.
  - Retorna `{ rows, meta: { total, page, limit, totalPages } }`.

  **Función exportada `async queryOutboundExport(pool, filters, allowedChannels, extractChannelFn)`:**
  - Igual que la query de datos pero sin paginación y con `LIMIT MAX_EXPORT_ROWS`.
  - Retorna array de filas mapeadas.

  **Actualizar `module.exports`:**
  ```js
  module.exports = {
    queryInbound,
    queryInboundExport,
    queryOutbound,
    queryOutboundExport,
    MAX_EXPORT_ROWS,
  };
  ```

---

- [x] **T2. Actualizar `backend/services/exportService.js` para soporte de cabeceras configurables**

  Modificar las firmas de `toXlsx` y `toPdf` añadiendo parámetros opcionales al final,
  sin romper las llamadas existentes desde `inbound.js`:

  **`toXlsx(rows, res, filenameBase, truncated = false, headers = null, sheetName = 'Entrantes')`:**
  - Si `headers` no es null, usar el array provisto en lugar de las cabeceras hardcodeadas.
  - Si `headers` es null, usar el array actual (`['Fecha/Hora', 'Origen', ...]`).
  - Si `sheetName` se provee, usar ese nombre para la hoja.

  **`toPdf(rows, res, filenameBase, filters, truncated = false, title = null, pdfHeaders = null)`:**
  - Si `title` no es null, usar como título del documento en lugar de `'Llamadas Entrantes — Búsqueda'`.
  - Si `pdfHeaders` no es null, pasar al helper `drawTable` en lugar de los headers hardcodeados.

  Las llamadas existentes desde `inbound.js` no se tocan (los nuevos parámetros son opcionales
  con valores por defecto que reproducen el comportamiento actual).

---

- [x] **T3. Crear `backend/routes/outbound.js`**

  Nuevo router con `'use strict'`. Seguir el patrón factory:

  ```js
  module.exports = function outboundRouter(pool, config, requireAuth, extractChannel) { ... }
  ```

  Los `allowedChannels` se extraen de `config.channels || []` dentro del factory.

  **GET `/calls/outbound`** (`requireAuth`):
  - Validar `from`, `to` (requeridos; formato YYYY-MM-DD).
  - Validar `disposition` si presente (debe ser ANSWERED, NO ANSWER, BUSY o FAILED).
  - Validar `page` (entero ≥1, default 1). Rechazar con 400 si < 1 o no numérico.
  - Validar `limit` (entero 1–500, default 100). Rechazar con 400 si > 500.
  - Llamar `cdrService.queryOutbound(pool, filters, pagination, allowedChannels, extractChannel)`.
  - Responder `{ ok: true, data, meta }` (HTTP 200).
  - En catch: `console.error('[outbound] GET /calls/outbound:', err.message)` + 500.

  **GET `/calls/outbound/export`** (`requireAuth`):
  - Validar `from`, `to` (requeridos).
  - Validar `format` (debe ser `xlsx` o `pdf`; 400 si no).
  - Validar `disposition` si presente.
  - Llamar `cdrService.queryOutboundExport(pool, filters, allowedChannels, extractChannel)`.
  - `truncated = rows.length >= MAX_EXPORT_ROWS`.
  - `filenameBase = 'salientes_<from>_<to>'`.
  - Si `format === 'xlsx'`: llamar `exportService.toXlsx(rows, res, filenameBase, truncated, outboundXlsxHeaders, 'Salientes')`.
  - Si `format === 'pdf'`: llamar `exportService.toPdf(rows, res, filenameBase, filters, truncated, 'Llamadas Salientes — Búsqueda', outboundPdfHeaders)`.
  - Constantes de cabeceras en el router:
    ```js
    const outboundXlsxHeaders = ['Fecha/Hora', 'Extensión', 'Destino', 'Troncal', 'Duración (s)', 'Seg. facturados', 'Estado'];
    const outboundPdfHeaders  = ['Fecha/Hora', 'Extensión', 'Destino', 'Troncal', 'Duración (s)', 'Seg. fact.', 'Estado'];
    ```
  - En catch: si headers ya enviados no responder; de lo contrario, responder 500.

---

- [x] **T4. Registrar el router en `server.js`**

  Dentro de `startServer()`, junto al require de `inboundRouter` y antes de `app.listen()`,
  añadir exactamente estas dos líneas:

  ```js
  const outboundRouter = require('./routes/outbound');
  app.use('/api', outboundRouter(pool, config, requireAuth, extractChannel));
  ```

  No modificar nada más en `server.js`.

---

- [x] **T5. Escribir `backend/tests/outbound.test.js`**

  Framework: Jest + Supertest. Usar mocks para el pool MySQL (no conectar a Issabel real).
  Levantar una instancia Express de prueba con el router montado.

  Tests obligatorios (nombrar cada `it` con el código de requisito):

  - `R1 - debe retornar registros individuales para un rango de fechas válido`
  - `R2 - debe filtrar por troncal saliente (dstchannel) y retornar solo registros del canal indicado`
  - `R3 - debe filtrar por extensión origen (src) con búsqueda parcial`
  - `R4 - debe filtrar por número destino (dst) con búsqueda parcial`
  - `R5 - debe filtrar por disposition y retornar solo el estado indicado`
  - `R6 - debe aplicar múltiples filtros combinados como AND`
  - `R7 - debe rechazar con 400 si falta el parámetro from o to`
  - `R9 - debe rechazar con 400 si disposition tiene un valor inválido`
  - `R12 y R13 - debe paginar correctamente y retornar meta.total, page, limit, totalPages`
  - `R14 - debe rechazar con 400 si limit supera 500`
  - `R17 - debe retornar array vacío y meta.total=0 cuando no hay resultados`
  - `R18 - debe responder con Content-Type xlsx para exportación Excel`
  - `R22 - debe responder con Content-Type pdf para exportación PDF`
  - `R26 - debe rechazar con 400 si format no es xlsx ni pdf`
  - `R28 - debe rechazar con 401 si no hay sesión autenticada`
  - `R32 (no-regresión) - GET /api/calls/inbound sigue respondiendo con su contrato original`

---

- [x] **T6. Crear `frontend/src/components/OutboundTable.jsx`**

  Nuevo componente de página. Seguir el patrón de `InboundTable.jsx` con las siguientes
  diferencias específicas para salientes:

  - **Filtros:** `from`, `to`, `trunk` (dropdown), `extension` (texto, búsqueda parcial en `src`),
    `dest` (texto, búsqueda parcial en `dst`), `disposition` (select).
  - **Columnas:** `calldate`, `src` (label "Extensión"), `dst` (label "Destino"),
    `dstchannel` (label "Troncal"), `duration`, `billsec`, `disposition`.
  - **API call:** usar `api.outboundCalls(params.toString())` (ver T7).
  - **URL de exportación:** `/api/calls/outbound/export?format=<xlsx|pdf>&<filtros activos>`
    (parámetros: `from`, `to`, `trunk`, `extension`, `dest`, `disposition`).
  - **Título de la página:** "Búsqueda de llamadas salientes".
  - Todo lo demás (spinner, badge de colores, paginación, ordenamiento client-side,
    descarga por elemento `<a>` temporal) es idéntico a `InboundTable.jsx`.

---

- [x] **T7. Actualizar `src/api.js`, `App.jsx` y `Layout.jsx`**

  **En `frontend/src/api.js`:**
  - Añadir método `outboundCalls(params)` análogo a `inboundCalls`:
    ```js
    outboundCalls: (params) => get(`/api/calls/outbound?${params}`),
    ```

  **En `frontend/src/App.jsx`:**
  - Importar `OutboundTable` siguiendo el mismo patrón de import que los demás componentes.
  - Añadir ruta protegida:
    ```jsx
    <Route path="/outbound/search" element={<PrivateRoute><OutboundTable /></PrivateRoute>} />
    ```

  **En `frontend/src/components/Layout.jsx`:**
  - Localizar la entrada del sidebar correspondiente a `/outbound`.
  - Añadir debajo (o como sub-ítem) la entrada para `/outbound/search`:
    ```
    Icono: Search (lucide-react, mismo icono que usa /inbound/search)
    Label: "Búsqueda salientes"
    href: /outbound/search
    ```
  - Mantener todas las entradas existentes del sidebar intactas.

---

- [x] **T8. Verificación final**

  Ejecutar en orden (desde la raíz del monorepo):

  ```bash
  # Tests backend (incluyendo no-regresión de inbound)
  cd backend && npx jest --forceExit 2>&1

  # Build frontend
  cd ../frontend && npm run build 2>&1
  ```

  Criterios de éxito:
  - `npx jest` verde (0 failed), incluyendo los tests existentes de `inbound.test.js`.
  - `npm run build` sin errores de compilación ni warnings de importación.
  - Ningún endpoint existente de v1.0 responde diferente (no-regresión).

  Smoke tests manuales opcionales (si hay servidor disponible):
  - `GET /api/calls/outbound?from=2026-06-01&to=2026-06-08` → 200 con `data` y `meta`.
  - `GET /api/calls/outbound/export?format=xlsx&from=2026-06-01&to=2026-06-08` → descarga `.xlsx`.
  - `GET /api/calls/outbound/export?format=pdf&from=2026-06-01&to=2026-06-08` → descarga `.pdf`.
  - `GET /api/calls/range?from=2026-06-01&to=2026-06-08` → sigue respondiendo igual (no-regresión).
  - `GET /api/calls/inbound?from=2026-06-01&to=2026-06-08` → sigue respondiendo igual (no-regresión).
  - `GET /api/events` → sigue emitiendo SSE (no-regresión).
  - Ruta `/outbound/search` en el frontend carga `OutboundTable.jsx` y muestra los filtros.
  - Ruta `/outbound` sigue mostrando `OutboundView.jsx` sin cambios (no-regresión).
