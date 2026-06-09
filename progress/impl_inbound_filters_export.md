# Implementación — inbound_filters_export

## Archivos creados/modificados

### Creados
- `backend/services/cdrService.js` — queryInbound, queryInboundExport, MAX_EXPORT_ROWS
- `backend/services/exportService.js` — toXlsx (streaming ExcelJS), toPdf (PDFKit con drawTable helper)
- `backend/routes/inbound.js` — GET /calls/inbound y GET /calls/inbound/export
- `backend/tests/inbound.test.js` — 14 tests Jest + Supertest con pool MySQL mockeado
- `frontend/src/components/InboundTable.jsx` — nueva vista de búsqueda con filtros, paginación, exportación

### Modificados
- `backend/server.js` — añadido require de inboundRouter + app.use('/api', inboundRouter(...)) en startServer()
- `frontend/src/api.js` — añadido método inboundCalls(queryString)
- `frontend/src/App.jsx` — import InboundTable + ruta /inbound/search con PrivateRoute
- `frontend/src/components/Layout.jsx` — import Search de lucide-react + NavItem "Búsqueda entrantes" → /inbound/search
- `backend/package.json` — exceljs ^4.4.0 y pdfkit ^0.19.0 añadidos a dependencies
- `specs/inbound_filters_export/tasks.md` — todas las tareas marcadas [x]

## Trazabilidad R<n> → test

| Requisito | Test | Archivo:línea |
|---|---|---|
| R1 — retornar registros individuales por rango | `R1 - debe retornar registros individuales para un rango de fechas válido` | inbound.test.js:~90 |
| R2 — filtrar por troncal | `R2 - debe filtrar por troncal y retornar solo registros del canal indicado` | inbound.test.js:~105 |
| R3 — filtrar por origen (parcial) | `R3 - debe filtrar por número origen (búsqueda parcial)` | inbound.test.js:~119 |
| R4 — filtrar por disposition | `R4 - debe filtrar por disposition y retornar solo el estado indicado` | inbound.test.js:~133 |
| R5 — múltiples filtros AND | `R5 - debe aplicar múltiples filtros combinados como AND` | inbound.test.js:~146 |
| R6 — 400 si falta from o to | `R6 - debe rechazar con 400 si falta el parámetro from o to` | inbound.test.js:~161 |
| R8 — 400 si disposition inválida | `R8 - debe rechazar con 400 si disposition tiene un valor inválido` | inbound.test.js:~178 |
| R9/R10 — paginación + meta | `R9 y R10 - debe paginar correctamente y retornar meta.total, page, limit, totalPages` | inbound.test.js:~188 |
| R11 — 400 si limit > 500 | `R11 - debe rechazar con 400 si limit supera 500` | inbound.test.js:~202 |
| R14 — vacío cuando sin resultados | `R14 - debe retornar array vacío y meta.total=0 cuando no hay resultados` | inbound.test.js:~214 |
| R15 — Content-Type xlsx | `R15 - debe responder con Content-Type xlsx para exportación Excel` | inbound.test.js:~228 |
| R19 — Content-Type pdf | `R19 - debe responder con Content-Type pdf para exportación PDF` | inbound.test.js:~240 |
| R23 — 400 si format inválido | `R23 - debe rechazar con 400 si format no es xlsx ni pdf` | inbound.test.js:~252 |
| R25 — 401 sin sesión (list + export) | `R25 - debe rechazar con 401 si no hay sesión autenticada` (x2) | inbound.test.js:~263, ~272 |

## Resultado

- Tests: 39/39 passing (14 nuevos inbound + 25 users pre-existentes)
- Build frontend: OK (vite build exitoso, sin errores de compilación)
- No-regresión: OK (endpoints existentes no modificados; sólo se añadieron 2 líneas a server.js)
- Notas:
  - El filtro de troncal usa `channel LIKE CONCAT(?, '%')` per spec (Opción B del design.md), compatible con MySQL 5.7+ y MariaDB 10.x.
  - `calldate` se normaliza con `.toISOString()` en el mapeo; si MySQL devuelve un string en lugar de Date (según driver), se pasa tal cual.
  - La advertencia de chunk size en el build frontend es pre-existente (642 kB), no introducida por esta feature.
  - `GET /api/admin/channels` en InboundTable maneja 403 (usuario no admin) con catch silencioso: el dropdown muestra solo "Todas" y el filtro de troncal se omite del request.
