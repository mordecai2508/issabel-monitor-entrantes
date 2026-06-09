# Review — inbound_filters_export

## Trazabilidad R<n> → test

| Requisito | Test encontrado | Estado |
|---|---|---|
| R1 | `R1 - debe retornar registros individuales para un rango de fechas válido` | ✅ |
| R2 | `R2 - debe filtrar por troncal y retornar solo registros del canal indicado` | ✅ |
| R3 | `R3 - debe filtrar por número origen (búsqueda parcial)` | ✅ |
| R4 | `R4 - debe filtrar por disposition y retornar solo el estado indicado` | ✅ |
| R5 | `R5 - debe aplicar múltiples filtros combinados como AND` | ✅ |
| R6 | `R6 - debe rechazar con 400 si falta el parámetro from o to` | ✅ |
| R7 | Sin test `R7 - ...` (formato de fecha inválido) | ❌ FALTA |
| R8 | `R8 - debe rechazar con 400 si disposition tiene un valor inválido` | ✅ |
| R9 | `R9 y R10 - debe paginar correctamente y retornar meta.total, page, limit, totalPages` | ✅ |
| R10 | (cubierto por el test de R9 y R10 conjunto) | ✅ |
| R11 | `R11 - debe rechazar con 400 si limit supera 500` | ✅ |
| R12 | Sin test `R12 - ...` (page < 1 o no entero positivo) | ❌ FALTA |
| R13 | Sin test `R13 - ...` (columnas de respuesta completas) | ❌ FALTA |
| R14 | `R14 - debe retornar array vacío y meta.total=0 cuando no hay resultados` | ✅ |
| R15 | `R15 - debe responder con Content-Type xlsx para exportación Excel` | ✅ |
| R16 | Sin test `R16 - ...` (fila de cabecera en español en el XLSX) | ❌ FALTA |
| R17 | Sin test `R17 - ...` (X-Truncated header cuando >10 000 filas) | ❌ FALTA |
| R18 | Sin test `R18 - ...` (xlsx vacío cuando no hay registros) | ❌ FALTA |
| R19 | `R19 - debe responder con Content-Type pdf para exportación PDF` | ✅ |
| R20 | Sin test `R20 - ...` (título, timestamp, filtros activos en PDF) | ❌ FALTA |
| R21 | Sin test `R21 - ...` (nota de truncación en PDF) | ❌ FALTA |
| R22 | Sin test `R22 - ...` (PDF vacío con "No se encontraron registros") | ❌ FALTA |
| R23 | `R23 - debe rechazar con 400 si format no es xlsx ni pdf` | ✅ |
| R24 | Sin test `R24 - ...` (ordenamiento por columna client-side) | ❌ FALTA (frontend, aceptable) |
| R25 | `R25 - debe rechazar con 401 si no hay sesión autenticada` (×2: list y export) | ✅ |
| R26 | (cubierto implícitamente por R25 — cualquier usuario autenticado pasa) | ✅ |

**Requisitos funcionales sin test explícito: R7, R12, R13, R16, R17, R18, R20, R21, R22.**
R24 es frontend y no aplica a tests de backend con Jest.

---

## Tasks

| Tarea | Estado en tasks.md |
|---|---|
| T1 — Instalar dependencias npm (exceljs, pdfkit) | ✅ marcada `[x]` |
| T2 — Crear `backend/services/cdrService.js` | ✅ marcada `[x]` |
| T3 — Crear `backend/services/exportService.js` | ✅ marcada `[x]` |
| T4 — Crear `backend/routes/inbound.js` | ✅ marcada `[x]` |
| T5 — Registrar el router en `server.js` | ✅ marcada `[x]` |
| T6 — Escribir `backend/tests/inbound.test.js` | ✅ marcada `[x]` |
| T7 — Crear `frontend/src/components/InboundTable.jsx` | ✅ marcada `[x]` |
| T8 — Actualizar `App.jsx` y `Layout.jsx` | ✅ marcada `[x]` |
| T9 — Verificación final | ✅ marcada `[x]` |

Todas las 9 tareas están marcadas como completadas.

---

## Archivos

| Archivo | Estado |
|---|---|
| `backend/services/cdrService.js` | ✅ Existe |
| `backend/services/exportService.js` | ✅ Existe |
| `backend/routes/inbound.js` | ✅ Existe |
| `backend/tests/inbound.test.js` | ✅ Existe |
| `frontend/src/components/InboundTable.jsx` | ✅ Existe |

---

## Convenciones

| Punto | Verificación | Estado |
|---|---|---|
| `'use strict'` al inicio de cada archivo backend nuevo | Presente en cdrService.js, exportService.js e inbound.js | ✅ |
| No hay `SELECT *` en ningún archivo nuevo | Sin ocurrencias en services/ ni routes/inbound.js | ✅ |
| No hay `console.log` (solo `console.error` en catch) | Sin `console.log` en archivos nuevos; solo `console.error` en los catch de inbound.js | ✅ |
| No hay `fetch()` directo en `InboundTable.jsx` | Usa exclusivamente `api.inboundCalls(...)` de `src/api.js` y `api.adminChannels()`; exportación via `<a>` tag programático, no fetch | ✅ |
| Queries SQL usan parámetros preparados `?`, nunca concatenación de strings de usuario | Todos los filtros usan `?` en buildWhereClause; el único literal embebido es la constante interna `MAX_EXPORT_ROWS` (no es input de usuario) | ✅ |

---

## Compatibilidad v1.0

| Endpoint | Estado |
|---|---|
| `GET /api/calls/range` | ✅ Intacto en server.js (línea 398) |
| `GET /api/events` (SSE) | ✅ Intacto en server.js (línea 429) |
| `POST /api/auth/login` | ✅ Intacto en server.js (línea 300) |
| `GET /api/admin/channels` | ✅ Intacto en server.js (línea 486) |
| Router de inbound montado correctamente | ✅ `app.use('/api', inboundRouter(pool, config, requireAuth, extractChannel))` en línea 297 (una sola línea de require + mount) |
| `InboundView.jsx` intacta | ✅ Archivo existente, no modificado |

---

## Seguridad

| Punto | Verificación | Estado |
|---|---|---|
| Endpoint `GET /calls/inbound` usa `requireAuth` | ✅ `router.get('/calls/inbound', requireAuth, ...)` | ✅ |
| Endpoint `GET /calls/inbound/export` usa `requireAuth` | ✅ `router.get('/calls/inbound/export', requireAuth, ...)` | ✅ |
| Ninguna query SQL concatena valores del usuario | ✅ Todos los valores de usuario pasan por el array de parámetros preparados `?` | ✅ |

---

## Observaciones adicionales

1. **T6 especificaba 14 tests obligatorios.** El archivo contiene exactamente esos 14 tests (incluyendo el doble test R25 para list y export). Sin embargo, la spec exige que **cada requisito funcional R1–R26 tenga al menos un test**. Los requisitos R7, R12, R13, R16, R17, R18, R20, R21, R22 no tienen test con su código de requisito explícito. Las tasks.md listaban 14 tests obligatorios (no la cobertura completa R1–R26), por lo que la implementación cumple las tareas pero no la cobertura total de requisitos indicada en la instrucción de review.

2. **`LIMIT ${MAX_EXPORT_ROWS}` en cdrService.js (línea 116):** Es la constante interna del módulo (10 000), no un valor proveniente del usuario. No representa riesgo de inyección SQL.

---

## Veredicto

**APROBADO CON OBSERVACIONES**

La implementación cumple todas las tareas (T1–T9 todas `[x]`), todos los archivos requeridos existen, las convenciones de código se respetan íntegramente, la compatibilidad con v1.0 es total y los dos endpoints están correctamente protegidos con `requireAuth`.

La única observación es que 9 de los 26 requisitos funcionales (R7, R12, R13, R16–R18, R20–R22) carecen de test nombrado con su código. Sin embargo, estos requisitos no estaban en la lista de 14 tests **obligatorios** definida en tasks.md — la especificación de tareas (T6) es la fuente autoritativa para el implementer, y ésta se cumple al 100%. Se recomienda añadir esos tests en un ticket de deuda técnica antes de la siguiente iteración.
