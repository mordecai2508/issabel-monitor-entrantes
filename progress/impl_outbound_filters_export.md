# Implementación — outbound_filters_export

## Archivos creados/modificados

| Archivo | Acción |
|---|---|
| `backend/services/cdrService.js` | Modificado — añadidas `buildOutboundWhereClause`, `mapOutboundRow`, `queryOutbound`, `queryOutboundExport`; `module.exports` ampliado |
| `backend/services/exportService.js` | Modificado — `toXlsx` acepta `headers` y `sheetName` opcionales; `toPdf` acepta `title`, `pdfHeaders` y `rowKeys` opcionales; `drawTable` acepta `rowKeys` opcional |
| `backend/routes/outbound.js` | Creado — router factory con `GET /calls/outbound` y `GET /calls/outbound/export` |
| `backend/server.js` | Modificado — require e mount de `outboundRouter` añadidos |
| `backend/tests/outbound.test.js` | Creado — 16 tests (R1–R28 + R32 no-regresión) |
| `frontend/src/components/OutboundTable.jsx` | Creado — componente de página con filtros, tabla, paginación, exportación |
| `frontend/src/api.js` | Modificado — añadido método `outboundCalls` |
| `frontend/src/App.jsx` | Modificado — import de `OutboundTable` y ruta `/outbound/search` |
| `frontend/src/components/Layout.jsx` | Modificado — ítem "Búsqueda salientes" → `/outbound/search` añadido al sidebar |

## Trazabilidad R<n> → test

| Requisito | Test | Archivo:línea |
|---|---|---|
| R1 | R1 - debe retornar registros individuales para un rango de fechas válido | outbound.test.js:103 |
| R2 | R2 - debe filtrar por troncal saliente (dstchannel) | outbound.test.js:118 |
| R3 | R3 - debe filtrar por extensión origen (src) con búsqueda parcial | outbound.test.js:133 |
| R4 | R4 - debe filtrar por número destino (dst) con búsqueda parcial | outbound.test.js:148 |
| R5 | R5 - debe filtrar por disposition y retornar solo el estado indicado | outbound.test.js:163 |
| R6 | R6 - debe aplicar múltiples filtros combinados como AND | outbound.test.js:178 |
| R7 | R7 - debe rechazar con 400 si falta el parámetro from o to | outbound.test.js:195 |
| R9 | R9 - debe rechazar con 400 si disposition tiene un valor inválido | outbound.test.js:212 |
| R12/R13 | R12 y R13 - debe paginar correctamente y retornar meta.total, page, limit, totalPages | outbound.test.js:222 |
| R14 | R14 - debe rechazar con 400 si limit supera 500 | outbound.test.js:237 |
| R17 | R17 - debe retornar array vacío y meta.total=0 cuando no hay resultados | outbound.test.js:248 |
| R18 | R18 - debe responder con Content-Type xlsx para exportación Excel | outbound.test.js:267 |
| R22 | R22 - debe responder con Content-Type pdf para exportación PDF | outbound.test.js:279 |
| R26 | R26 - debe rechazar con 400 si format no es xlsx ni pdf | outbound.test.js:291 |
| R28 | R28 - debe rechazar con 401 si no hay sesión autenticada | outbound.test.js:258 (lista) + 302 (export) |
| R32 | R32 (no-regresión) - GET /api/calls/inbound sigue respondiendo igual | outbound.test.js:316 |

## Resultado

- Tests: 56/56 passing (16 nuevos en outbound.test.js + 40 existentes en inbound.test.js y users.test.js)
- Build frontend: OK (sin errores; warning de chunk size es pre-existente)
- No-regresión: OK (todos los tests de inbound y users pasan sin cambios)
- Notas:
  - Se añadió `rowKeys` como tercer parámetro opcional a `drawTable` y `toPdf` para que los campos `dstchannel` de salientes se rendericen correctamente en PDF (inbound usa `channel`, outbound usa `dstchannel`).
  - `toXlsx` usa `r.channel || r.dstchannel` para compatibilidad retroactiva con filas inbound e outbound.
  - El warning de Vite sobre chunk size (648 kB) es pre-existente; no lo genera esta feature.
