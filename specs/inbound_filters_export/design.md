# Design — inbound_filters_export

---

## 1. Endpoints nuevos

| Método | Ruta | Auth | Query params | Payload salida | HTTP codes |
|--------|------|------|-------------|----------------|------------|
| GET | `/api/calls/inbound` | `requireAuth` | `from` (YYYY-MM-DD, req), `to` (YYYY-MM-DD, req), `trunk` (string, opt), `origin` (string, opt), `disposition` (ANSWERED\|NO ANSWER\|BUSY\|FAILED, opt), `page` (int ≥1, default 1), `limit` (int 1-500, default 100) | `{ ok, data: [...], meta: { total, page, limit, totalPages } }` | 200, 400, 401, 500 |
| GET | `/api/calls/inbound/export` | `requireAuth` | Mismos filtros de fecha/troncal/origen/disposition + `format` (xlsx\|pdf, req) | Stream binario (Content-Disposition: attachment) | 200, 400, 401, 504, 500 |

### Respuesta estándar de lista (HTTP 200)

```json
{
  "ok": true,
  "data": [
    {
      "calldate": "2026-06-07T10:23:45.000Z",
      "src": "3001234567",
      "dst": "100",
      "channel": "SIP/troncal-claro",
      "duration": 95,
      "billsec": 87,
      "disposition": "ANSWERED"
    }
  ],
  "meta": {
    "total": 1450,
    "page": 1,
    "limit": 100,
    "totalPages": 15
  }
}
```

---

## 2. Query CDR nueva

La función `queryInbound(pool, filters, pagination)` en `cdrService.js` ejecuta
dos queries: una de conteo (para `meta.total`) y una de datos (con LIMIT/OFFSET).

### Query de conteo

```sql
SELECT COUNT(*) AS total
FROM cdr
WHERE calldate >= ?
  AND calldate < ?
  -- Condicional según filtros activos:
  AND (? IS NULL OR UPPER(disposition) = UPPER(?))
  AND (? IS NULL OR src LIKE ?)
```

El filtro de troncal se aplica en JavaScript post-query usando `extractChannel()`
(igual que las funciones existentes), porque el canal en CDR incluye el sufijo hex.
Ver la nota sobre troncal más abajo.

### Query de datos paginada

```sql
SELECT
  calldate,
  src,
  dst,
  channel,
  duration,
  billsec,
  disposition
FROM cdr
WHERE calldate >= ?
  AND calldate < ?
  -- Condicional según filtros activos:
  AND (? IS NULL OR UPPER(disposition) = UPPER(?))
  AND (? IS NULL OR src LIKE ?)
ORDER BY calldate DESC
LIMIT ? OFFSET ?
```

Parámetros preparados (nunca concatenación de strings). El `LIMIT` defensivo máximo
para exportación es 10,000 (`MAX_EXPORT_ROWS = 10000`).

### Filtro de troncal (estrategia post-query para el paginado)

La columna `channel` contiene valores como `SIP/trunk-name-00a1b2c3`. El valor
normalizado solo es conocido tras aplicar `extractChannel()`. Dos opciones:

**Opción A (elegida):** Aplicar `extractChannel()` en SQL mediante expresiones
regulares. MySQL soporta `REGEXP_REPLACE(channel, '-[0-9a-fA-F]{6,}$', '')` y
`REGEXP_REPLACE(result, '-[0-9]+$', '')`. Esto permite filtrar en la query:
```sql
AND (? IS NULL OR
  REGEXP_REPLACE(REGEXP_REPLACE(channel, '-[0-9a-fA-F]{6,}$', ''), '-[0-9]+$', '') = ?)
```

**Opción B (descartada):** Traer todas las filas del rango y filtrar en JS.
Descartada porque en rangos grandes (semanas/meses) podría traer decenas de miles
de registros innecesariamente, degradando el rendimiento.

La Opción A requiere que el servidor MySQL sea versión 8.0+ (Issabel moderno usa
MariaDB 10.x o MySQL 5.7+). Para compatibilidad máxima, se usará un LIKE prefix
como alternativa de fallback: `AND (? IS NULL OR channel LIKE CONCAT(?, '%'))`.
Esta solución es compatible con todas las versiones y funcionalmente equivalente
porque los prefijos de canal son únicos dentro de una instalación Issabel.

**Decisión final:** Usar `LIKE CONCAT(?, '%')` para máxima compatibilidad. El valor
pasado como parámetro es el `trunk` normalizado tal como viene del frontend
(e.g., `SIP/troncal-claro`).

### Query de exportación (sin paginación, con techo 10 000)

Igual que la query de datos pero sin OFFSET y con `LIMIT 10000`.

### Normalización de `calldate` en respuesta

El campo `calldate` de MySQL se devuelve como objeto `Date` de Node.js.
Se serializa a ISO 8601 con `.toISOString()` en el mapeo de resultados.

---

## 3. Dependencias nuevas

| Paquete | Versión | Estado | Uso |
|---------|---------|--------|-----|
| `exceljs` | `^4.4.0` | **No instalado** | Generación de archivos .xlsx en memoria |
| `pdfkit` | `^0.15.0` | **No instalado** | Generación de archivos .pdf en memoria |

Comandos de instalación (en `backend/`):
```bash
npm install exceljs pdfkit --save
```

Justificación: ambas librerías están explícitamente aprobadas en `docs/conventions.md`.
Son las únicas opciones autorizadas para exportación en este proyecto.

---

## 4. Lógica de exportación

### 4.1 Excel (exceljs)

```
1. Crear instancia de ExcelJS.stream.xlsx.WorkbookWriter con { stream: res }.
2. Definir cabeceras HTTP antes de comenzar a escribir:
     Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
     Content-Disposition: attachment; filename="entrantes_<from>_<to>.xlsx"
3. Crear una hoja (worksheet.addRow) con las columnas:
     ['Fecha/Hora', 'Origen', 'Destino', 'Troncal', 'Duración (s)', 'Seg. facturados', 'Estado']
4. Iterar sobre las filas de resultado y escribir cada una con worksheet.addRow().
5. Llamar workbook.commit() para finalizar el stream.
6. Nunca guardar en disco; el stream va directamente a `res`.
```

Si se supera `MAX_EXPORT_ROWS = 10000`, se añade la cabecera HTTP:
`X-Truncated: true; rows=10000`.

### 4.2 PDF (pdfkit)

```
1. Crear instancia de PDFDocument con { margin: 40, size: 'A4', layout: 'landscape' }.
2. Definir cabeceras HTTP:
     Content-Type: application/pdf
     Content-Disposition: attachment; filename="entrantes_<from>_<to>.pdf"
3. Hacer pipe del documento a res: doc.pipe(res).
4. Escribir título ("Llamadas Entrantes"), rango de fechas y filtros activos.
5. Escribir fecha/hora de generación.
6. Dibujar la tabla con columnas: Fecha/Hora, Origen, Destino, Troncal, Duración, Seg. facturados, Estado.
   Usar coordenadas manuales (x, y) con doc.text() y líneas doc.moveTo/lineTo dado que
   pdfkit no tiene soporte nativo de tablas — implementar helper drawTable(doc, rows).
7. Llamar doc.end() para finalizar el stream.
```

Si se supera `MAX_EXPORT_ROWS`, se añade una nota en la primera página del PDF indicando truncación.

---

## 5. Componente frontend

### Decisión: crear `InboundTable.jsx` (nuevo), mantener `InboundView.jsx` (existente)

`InboundView.jsx` muestra KPIs en tiempo real vía SSE (estadísticas agregadas de hoy).
Este componente tiene un propósito distinto al de la nueva feature (registros individuales
con filtros ad-hoc). **Coexistirán** como dos vistas separadas bajo la misma sección
"Entrantes" del sidebar:

- `/inbound` → `InboundView.jsx` (vista en vivo, sin cambios — v1.0)
- `/inbound/search` → `InboundTable.jsx` (nueva vista de búsqueda con filtros)

Esto evita romper la funcionalidad existente y separa las responsabilidades:
monitoreo en vivo vs. búsqueda histórica.

### `InboundTable.jsx` — estructura

**Props:** ninguna (componente de página autónomo).

**Estado local:**
```
filters: { from, to, trunk, origin, disposition }  // valores de los inputs
page: number                                         // página actual
sortCol: string                                      // columna de ordenamiento
sortDir: 'asc' | 'desc'
rows: array                                          // datos de la página actual
meta: { total, page, limit, totalPages }
loading: boolean
error: string | null
```

**UI:**
- Panel de filtros (siempre visible):
  - DateRangePicker (dos `<input type="date">`) para `from`/`to`
  - Dropdown `<select>` con las troncales disponibles (obtenidas de `GET /api/admin/channels`)
  - `<input type="text">` para número origen (búsqueda parcial)
  - `<select>` para disposition: Todas / Contestada / No contestada / Ocupado / Fallida
  - Botón "Buscar" (aplica filtros)
  - Botón "Limpiar" (resetea filtros)
- Botones de exportación (solo visibles si hay resultados):
  - "Exportar Excel" → llama `GET /api/calls/inbound/export?format=xlsx&<filtros activos>`
  - "Exportar PDF" → llama `GET /api/calls/inbound/export?format=pdf&<filtros activos>`
  - Los botones usan `window.open(url)` o un `<a href>` con `download` para forzar la descarga.
- Tabla de resultados con columnas: Fecha/Hora, Origen, Destino, Troncal, Duración, Seg. fact., Estado.
  - Cabecera de cada columna clickeable para ordenar (icono asc/desc).
  - Ordenamiento aplicado sobre los datos en memoria (`rows.slice().sort()`).
  - Badge de color en columna Estado (verde=ANSWERED, amarillo=NO ANSWER, rojo=BUSY/FAILED).
- Paginación: botones Anterior / Siguiente + indicador "Página N de M (total T registros)".
- Estado de carga: spinner inline durante fetch.
- Estado de error: banner rojo con mensaje.
- Estado vacío: mensaje "No se encontraron registros para los filtros seleccionados".

**Lógica de fetch:**
Todas las llamadas HTTP pasan por `src/api.js`. El componente usa `useState` + `useEffect`
(pattern existente del proyecto). No se introduce ninguna librería de estado adicional.

**Obtención de troncales para el dropdown:**
`GET /api/admin/channels` devuelve `{ channels: [{ channel, alias }] }`.
Se carga una sola vez al montar el componente (`useEffect([], [])`).
Si el usuario no es admin, el endpoint devuelve 403 — en ese caso el dropdown muestra
solo la opción "Todas" y el filtro de troncal se omite del request.

**Alternativa:** usar la lista de troncales que llega en el SSE (`data.channels`).
Descartada porque `InboundTable.jsx` no está conectado al SSE y añadir esa dependencia
acoplaría dos responsabilidades distintas.

---

## 6. Decisión técnica — por qué registros individuales y no extender `/api/calls/range`

`/api/calls/range` devuelve **estadísticas agregadas**: totales por canal, distribución
por hora, disposiciones sumadas. Su propósito es el dashboard y la vista histórica de
métricas. Devuelve un objeto complejo con múltiples sub-objetos (`stats`, `channels`,
`hourly`, `queues`), no una lista de filas.

La nueva feature requiere **registros individuales paginados** con filtros ad-hoc
(troncal específica, número origen, estado), más capacidad de exportación.
Modificar `/api/calls/range` para este propósito:
- Cambiaría su contrato de respuesta, rompiendo `HistoricalView.jsx` y el SSE.
- Mezclaría dos responsabilidades en un único endpoint difícil de mantener.
- Haría imposible la paginación sin rediseñar toda la función `fetchData()`.

Por eso se crea un endpoint nuevo `/api/calls/inbound` con su propio servicio
`cdrService.js` y su propia query orientada a filas individuales.

---

## 7. Compatibilidad con v1.0

| Endpoint existente | Cambio | Justificación |
|--------------------|--------|---------------|
| `GET /api/calls/today` | Ninguno | No se toca |
| `GET /api/calls/range` | Ninguno | No se toca |
| `GET /api/events` (SSE) | Ninguno | No se toca |
| `POST /api/auth/login` | Ninguno | No se toca |
| `GET /api/admin/channels` | Ninguno | Se reutiliza para el dropdown de troncales |
| `/inbound` (ruta frontend) | Ninguno | `InboundView.jsx` sin cambios |

La única modificación a `server.js` es una línea de `require()` para montar el
nuevo router. No se altera ninguna función existente.

`Layout.jsx` recibe un nuevo ítem en el sidebar ("Búsqueda entrantes" → `/inbound/search`),
pero la estructura existente del sidebar y las rutas actuales no cambian.
