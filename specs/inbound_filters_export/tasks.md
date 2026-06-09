# Tasks — inbound_filters_export

> El implementer sigue este orden exacto. Marcar `[x]` al completar cada tarea.
> No iniciar la siguiente tarea hasta que la anterior esté completa y sin errores.

---

- [x] **T1. Instalar dependencias npm nuevas**

  En `backend/`:
  ```bash
  npm install exceljs pdfkit --save
  ```
  Verificar que `exceljs` y `pdfkit` aparecen en `backend/package.json` en `dependencies`.
  Referencia: `docs/conventions.md` sección "Exportación".

---

- [x] **T2. Crear `backend/services/cdrService.js`**

  Nuevo archivo con `'use strict'` y exports CommonJS.

  Exportar la función:
  ```js
  async function queryInbound(pool, filters, pagination)
  ```

  - `filters`: `{ from, to, trunk, origin, disposition }` (todos opcionales salvo from/to).
  - `pagination`: `{ page, limit }` (defaults 1 y 100).
  - Ejecuta dos queries SQL con parámetros preparados (`?`):
    1. `SELECT COUNT(*) AS total FROM cdr WHERE ...` (con filtros activos).
    2. `SELECT calldate, src, dst, channel, duration, billsec, disposition FROM cdr WHERE ... ORDER BY calldate DESC LIMIT ? OFFSET ?`.
  - Filtro de troncal: `channel LIKE CONCAT(?, '%')` con el valor del parámetro `trunk`.
  - Filtro de origen: `src LIKE CONCAT('%', ?, '%')`.
  - Filtro de disposition: `UPPER(disposition) = UPPER(?)`.
  - Mapear `calldate` a ISO 8601 (`.toISOString()`) y `channel` a nombre normalizado
    usando `extractChannel()` (importado/recibido como argumento).
  - Retornar: `{ rows: [...], meta: { total, page, limit, totalPages } }`.

  Exportar también:
  ```js
  async function queryInboundExport(pool, filters, extractChannelFn)
  ```
  - Igual que la query de datos pero sin paginación y con `LIMIT 10000`.
  - Retorna solo el array de filas.

  Constante pública:
  ```js
  const MAX_EXPORT_ROWS = 10000;
  ```

---

- [x] **T3. Crear `backend/services/exportService.js`**

  Nuevo archivo con `'use strict'` y exports CommonJS.

  Exportar dos funciones:

  **`async function toXlsx(rows, res, filenameBase)`**
  - Establece cabeceras HTTP en `res`:
    - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
    - `Content-Disposition: attachment; filename="<filenameBase>.xlsx"`
    - Si `rows.length === MAX_EXPORT_ROWS`: añadir `X-Truncated: true`.
  - Usa `ExcelJS.stream.xlsx.WorkbookWriter` con `{ stream: res }`.
  - Crea una hoja llamada "Entrantes".
  - Añade fila de cabecera: `['Fecha/Hora', 'Origen', 'Destino', 'Troncal', 'Duración (s)', 'Seg. facturados', 'Estado']`.
  - Itera `rows` y añade cada fila con `worksheet.addRow([...]).commit()`.
  - Finaliza con `workbook.commit()`.

  **`function toPdf(rows, res, filenameBase, filters)`**
  - Establece cabeceras HTTP en `res`:
    - `Content-Type: application/pdf`
    - `Content-Disposition: attachment; filename="<filenameBase>.pdf"`
  - Crea `PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' })`.
  - Hace `doc.pipe(res)`.
  - Escribe título "Llamadas Entrantes — Búsqueda", rango de fechas y filtros activos.
  - Escribe fecha/hora de generación.
  - Si `rows.length === MAX_EXPORT_ROWS`: añade nota de truncación.
  - Dibuja tabla usando helper interno `drawTable(doc, headers, rows)` con posicionamiento
    manual (coordenadas x/y con `doc.text()` y líneas `doc.moveTo().lineTo().stroke()`).
  - Columnas: Fecha/Hora, Origen, Destino, Troncal, Duración (s), Seg. fact., Estado.
  - Finaliza con `doc.end()`.

---

- [x] **T4. Crear `backend/routes/inbound.js`**

  Nuevo router con `'use strict'` siguiendo el patrón factory `module.exports = function inboundRouter(pool, config, requireAuth, extractChannel)`.

  **GET `/calls/inbound`** (`requireAuth`):
  - Validar `from`, `to` (requeridos, formato fecha).
  - Validar `disposition` si presente (debe ser uno de los cuatro valores permitidos).
  - Validar `page` (entero ≥1, default 1).
  - Validar `limit` (entero 1–500, default 100).
  - Rechazar con 400 + `{ ok: false, error: '...' }` si falla alguna validación.
  - Llamar `cdrService.queryInbound(pool, filters, pagination)`.
  - Responder `{ ok: true, data, meta }` (HTTP 200).
  - En catch: `console.error` + respuesta 500.

  **GET `/calls/inbound/export`** (`requireAuth`):
  - Validar `from`, `to` (requeridos).
  - Validar `format` (debe ser `xlsx` o `pdf`; 400 si no).
  - Validar `disposition` si presente.
  - Llamar `cdrService.queryInboundExport(pool, filters, extractChannel)`.
  - Construir `filenameBase = 'entrantes_<from>_<to>'`.
  - Si `format === 'xlsx'`: llamar `exportService.toXlsx(rows, res, filenameBase)`.
  - Si `format === 'pdf'`: llamar `exportService.toPdf(rows, res, filenameBase, filters)`.
  - En catch: si los headers ya fueron enviados, no responder; de lo contrario,
    responder 500 con `{ ok: false, error: '...' }`.

---

- [x] **T5. Registrar el router en `server.js`**

  Dentro de `startServer()`, después del require de `users.js` y antes de `app.listen()`,
  añadir exactamente estas dos líneas:
  ```js
  const inboundRouter = require('./routes/inbound');
  app.use('/api', inboundRouter(pool, config, requireAuth, extractChannel));
  ```
  No modificar nada más en `server.js`.

---

- [x] **T6. Escribir `backend/tests/inbound.test.js`**

  Framework: Jest + Supertest. Usar mocks para el pool MySQL (no conectar a Issabel real).
  Levantar la app con el router montado sobre una instancia Express de prueba.

  Tests obligatorios (nombrar cada `it` con el código de requisito):

  - `R1 - debe retornar registros individuales para un rango de fechas válido`
  - `R2 - debe filtrar por troncal y retornar solo registros del canal indicado`
  - `R3 - debe filtrar por número origen (búsqueda parcial)`
  - `R4 - debe filtrar por disposition y retornar solo el estado indicado`
  - `R5 - debe aplicar múltiples filtros combinados como AND`
  - `R6 - debe rechazar con 400 si falta el parámetro from o to`
  - `R8 - debe rechazar con 400 si disposition tiene un valor inválido`
  - `R9 y R10 - debe paginar correctamente y retornar meta.total, page, limit, totalPages`
  - `R11 - debe rechazar con 400 si limit supera 500`
  - `R14 - debe retornar array vacío y meta.total=0 cuando no hay resultados`
  - `R15 - debe responder con Content-Type xlsx para exportación Excel`
  - `R19 - debe responder con Content-Type pdf para exportación PDF`
  - `R23 - debe rechazar con 400 si format no es xlsx ni pdf`
  - `R25 - debe rechazar con 401 si no hay sesión autenticada`

---

- [x] **T7. Crear `frontend/src/components/InboundTable.jsx`**

  Nuevo componente de página. Ver sección 5 del `design.md` para estructura completa.

  Puntos clave de implementación:
  - Importar y usar `get` de `src/api.js` para todos los fetch (nunca `fetch()` directo).
  - Los botones de exportación construyen la URL con los filtros activos y usan
    un `<a>` tag temporal con `href` + `download` para forzar la descarga:
    ```js
    const a = document.createElement('a');
    a.href = `/api/calls/inbound/export?format=xlsx&from=...`;
    a.click();
    ```
  - El ordenamiento por columna se hace sobre el array `rows` en memoria con `.sort()`.
  - El spinner de carga usa la clase Tailwind `animate-spin` (patrón del proyecto).
  - Los badges de color en la columna Estado siguen la paleta existente:
    verde (`text-emerald-400`) para ANSWERED, amarillo (`text-amber-400`) para NO ANSWER,
    rojo (`text-red-400`) para BUSY y FAILED.
  - Paginación: botones "Anterior" / "Siguiente" deshabilitan cuando corresponde.

---

- [x] **T8. Actualizar `App.jsx` y `Layout.jsx`**

  En `frontend/src/App.jsx`:
  - Importar `InboundTable` (lazy import con `React.lazy` si el patrón existente lo usa;
    de lo contrario, import estático siguiendo el patrón de los otros componentes).
  - Añadir ruta protegida:
    ```jsx
    <Route path="/inbound/search" element={<PrivateRoute><InboundTable /></PrivateRoute>} />
    ```

  En `frontend/src/components/Layout.jsx`:
  - Localizar la entrada del sidebar correspondiente a `/inbound`.
  - Añadir debajo (o como sub-ítem) la entrada para `/inbound/search`:
    ```
    Icono: Search (lucide-react)
    Label: "Búsqueda entrantes"
    href: /inbound/search
    ```
  - Mantener todas las entradas existentes del sidebar intactas.

---

- [x] **T9. Verificación final**

  Ejecutar en orden (desde la raíz del monorepo):

  ```bash
  # Tests backend
  cd backend && npx jest --forceExit 2>&1

  # Build frontend (lint implícito de Vite)
  cd ../frontend && npm run build 2>&1

  # Smoke test manual (opcional si hay servidor disponible):
  # - GET /api/calls/inbound?from=2026-06-01&to=2026-06-08 → 200 con data/meta
  # - GET /api/calls/inbound/export?format=xlsx&from=2026-06-01&to=2026-06-08 → descarga .xlsx
  # - GET /api/calls/inbound/export?format=pdf&from=2026-06-01&to=2026-06-08 → descarga .pdf
  # - GET /api/calls/range?from=2026-06-01&to=2026-06-08 → sigue respondiendo igual (no-regresión)
  # - GET /api/events → sigue emitiendo SSE (no-regresión)
  ```

  Criterios de éxito:
  - `npx jest` verde (0 failed).
  - `npm run build` sin errores de compilación.
  - Ningún endpoint existente de v1.0 responde diferente.
