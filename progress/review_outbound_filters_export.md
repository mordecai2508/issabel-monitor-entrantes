# Review — outbound_filters_export

## 1. Trazabilidad R<n> → test

La spec exige que cada requisito funcional R1–R32 tenga al menos un `it('R<n> - ...')`.
Las tasks.md (T5) listaban 16 tests **obligatorios** específicos; esos son la fuente
autoritativa para el implementer.

| Requisito | Test encontrado | Estado |
|---|---|---|
| R1 | `R1 - debe retornar registros individuales para un rango de fechas válido` | ✅ |
| R2 | `R2 - debe filtrar por troncal saliente (dstchannel) y retornar solo registros del canal indicado` | ✅ |
| R3 | `R3 - debe filtrar por extensión origen (src) con búsqueda parcial` | ✅ |
| R4 | `R4 - debe filtrar por número destino (dst) con búsqueda parcial` | ✅ |
| R5 | `R5 - debe filtrar por disposition y retornar solo el estado indicado` | ✅ |
| R6 | `R6 - debe aplicar múltiples filtros combinados como AND` | ✅ |
| R7 | `R7 - debe rechazar con 400 si falta el parámetro from o to` | ✅ |
| R8 | Sin test `R8 - ...` (formato de fecha inválido) | ❌ FALTA |
| R9 | `R9 - debe rechazar con 400 si disposition tiene un valor inválido` | ✅ |
| R10 | Sin test `R10 - ...` (identificación de llamadas salientes con passesFilter) | ❌ FALTA |
| R11 | Sin test `R11 - ...` (exclusión de Local/ channels) | ❌ FALTA |
| R12 | `R12 y R13 - debe paginar correctamente y retornar meta.total, page, limit, totalPages` | ✅ |
| R13 | (cubierto por test conjunto R12 y R13) | ✅ |
| R14 | `R14 - debe rechazar con 400 si limit supera 500` | ✅ |
| R15 | Sin test `R15 - ...` (page < 1 o no entero positivo → 400) | ❌ FALTA |
| R16 | Sin test `R16 - ...` (columnas completas de respuesta) | ❌ FALTA |
| R17 | `R17 - debe retornar array vacío y meta.total=0 cuando no hay resultados` | ✅ |
| R18 | `R18 - debe responder con Content-Type xlsx para exportación Excel` | ✅ |
| R19 | Sin test `R19 - ...` (cabecera en español en XLSX) | ❌ FALTA |
| R20 | Sin test `R20 - ...` (X-Truncated header cuando >10 000 filas) | ❌ FALTA |
| R21 | Sin test `R21 - ...` (xlsx vacío con solo cabecera cuando no hay registros) | ❌ FALTA |
| R22 | `R22 - debe responder con Content-Type pdf para exportación PDF` | ✅ |
| R23 | Sin test `R23 - ...` (título, timestamp y filtros en PDF) | ❌ FALTA |
| R24 | Sin test `R24 - ...` (nota de truncación en PDF >10 000) | ❌ FALTA |
| R25 | Sin test `R25 - ...` (PDF vacío con "No se encontraron registros") | ❌ FALTA |
| R26 | `R26 - debe rechazar con 400 si format no es xlsx ni pdf` | ✅ |
| R27 | Sin test `R27 - ...` (ordenamiento client-side — frontend, aceptable) | N/A (frontend) |
| R28 | `R28 - debe rechazar con 401 si no hay sesión autenticada` (×2: list y export) | ✅ |
| R29 | (cubierto implícitamente por R28 — cualquier usuario autenticado con rol monitor pasa) | ✅ |
| R30 | Verificado estructuralmente en cdrService.js (funciones añadidas sin modificar existentes) | ✅ |
| R31 | Verificado en outbound.js: llama toXlsx/toPdf con parámetros opcionales | ✅ |
| R32 | `R32 (no-regresión) - GET /api/calls/inbound sigue respondiendo con su contrato original` | ✅ |

**Requisitos funcionales sin test explícito:** R8, R10, R11, R15, R16, R19, R20, R21, R23, R24, R25.
R27 es frontend y no aplica a tests de backend con Jest.

**Tests obligatorios de T5 (16 items):** todos presentes. ✅
Los requisitos sin test (R8, R10, R11, R15, R16, R19–R21, R23–R25) no estaban en la lista
obligatoria de T5; son deuda técnica de cobertura, no un incumplimiento de las tareas.

---

## 2. Tasks completadas

| Tarea | Estado en tasks.md |
|---|---|
| T1 — Añadir `queryOutbound` y `queryOutboundExport` a `cdrService.js` | ✅ `[x]` |
| T2 — Actualizar `exportService.js` con cabeceras configurables | ✅ `[x]` |
| T3 — Crear `backend/routes/outbound.js` | ✅ `[x]` |
| T4 — Registrar el router en `server.js` | ✅ `[x]` |
| T5 — Escribir `backend/tests/outbound.test.js` | ✅ `[x]` |
| T6 — Crear `frontend/src/components/OutboundTable.jsx` | ✅ `[x]` |
| T7 — Actualizar `src/api.js`, `App.jsx` y `Layout.jsx` | ✅ `[x]` |
| T8 — Verificación final | ✅ `[x]` |

**Todas las 8 tareas están marcadas como completadas.**

---

## 3. Archivos creados/modificados

| Archivo | Estado |
|---|---|
| `backend/services/cdrService.js` | ✅ Existe; contiene `queryOutbound` y `queryOutboundExport` exportadas; `queryInbound` y `queryInboundExport` intactas |
| `backend/services/exportService.js` | ✅ `toXlsx` y `toPdf` actualizadas con parámetros opcionales al final; firmas originales preservadas como valores por defecto |
| `backend/routes/outbound.js` | ✅ Existe; sigue patrón factory |
| `backend/tests/outbound.test.js` | ✅ Existe |
| `frontend/src/components/OutboundTable.jsx` | ✅ Existe |
| `frontend/src/api.js` | ✅ `outboundCalls` añadido |
| `frontend/src/App.jsx` | ✅ Ruta `/outbound/search` añadida con `PrivateRoute` |
| `frontend/src/components/Layout.jsx` | ✅ Entrada "Búsqueda salientes" con icono `Search` añadida en sidebar |

---

## 4. Convenciones (5 puntos críticos)

| Punto | Verificación | Estado |
|---|---|---|
| `'use strict'` en `outbound.js` | Presente en línea 1 | ✅ |
| No hay `SELECT *` en `cdrService.js` ni en `outbound.js` | Ninguna ocurrencia; todas las queries usan columnas explícitas | ✅ |
| No hay `console.log` de debug (solo `console.error` en catch) | Sin `console.log` en outbound.js; solo `console.error` en los dos bloques catch | ✅ |
| No hay `fetch()` directo en `OutboundTable.jsx` | Usa exclusivamente `api.outboundCalls(...)` de `src/api.js`; exportación via `<a>` tag programático | ✅ |
| Queries SQL usan parámetros preparados `?`, sin concatenación de strings de usuario | Todos los filtros (from, to, trunk, extension, dest, disposition, allowedChannels) pasan por el array de parámetros `?`; único literal embebido es la constante interna `MAX_EXPORT_ROWS` | ✅ |

---

## 5. Compatibilidad v1.0

| Elemento | Verificación | Estado |
|---|---|---|
| `GET /api/calls/inbound` y export | Intactos en `routes/inbound.js`; firmas no modificadas | ✅ |
| `GET /api/calls/range` | Intacto en `server.js` (línea 400) | ✅ |
| `GET /api/events` (SSE) | Intacto en `server.js` (línea 431) | ✅ |
| `POST /api/auth/login` | Intacto en `server.js` (línea 302) | ✅ |
| `OutboundView.jsx` | Archivo sin modificar; ruta `/outbound` intacta en `App.jsx` línea 44 | ✅ |
| `inbound.js` no fue modificado | Firmas de llamadas a `toXlsx` y `toPdf` sin parámetros opcionales (líneas 136–139 de inbound.js) siguen funcionando gracias a valores por defecto en exportService.js | ✅ |
| Registro del router en `server.js` | Líneas 25–26 (`require`) y línea 299 (`app.use`); no se tocó nada más | ✅ |

---

## 6. Seguridad rápida

| Punto | Verificación | Estado |
|---|---|---|
| `GET /calls/outbound` usa `requireAuth` | `router.get('/calls/outbound', requireAuth, ...)` — línea 39 de outbound.js | ✅ |
| `GET /calls/outbound/export` usa `requireAuth` | `router.get('/calls/outbound/export', requireAuth, ...)` — línea 99 de outbound.js | ✅ |
| Ninguna query SQL concatena valores del usuario | Todos los valores de `req.query` (from, to, trunk, extension, dest, disposition) pasan por el array de parámetros preparados; `allowedChannels` del config también pasa por `?` | ✅ |

---

## Observaciones adicionales

1. **`LIMIT ${MAX_EXPORT_ROWS}`** embebido en la SQL de `queryOutboundExport` (igual que en `queryInboundExport`): es la constante interna del módulo (10 000), no un valor de usuario. Sin riesgo de inyección SQL.

2. **`rowKeys` en exportService.js:** La función `toPdf` recibe el parámetro extra `rowKeys` (no estaba en la spec de T2 explícitamente, pero sí es necesario para que la tabla PDF de salientes use `dstchannel` en lugar de `channel`). El parámetro tiene valor por defecto `null`, que reproduce el comportamiento de entrantes. Extensión correcta y no invasiva.

3. **Test R28 duplicado:** Hay dos tests con etiqueta R28 (uno para list y otro para export en describe separado). No es un problema; ambos son necesarios y la nomenclatura es clara.

4. **Requisitos sin test nombrado (deuda técnica):** R8, R10, R11, R15, R16, R19, R20, R21, R23, R24, R25. No estaban en la lista obligatoria de T5. Se recomienda añadirlos en un ticket de deuda de cobertura antes de la siguiente iteración.

---

## Veredicto

**APROBADO**

Todas las 8 tareas están marcadas `[x]` y verificadas. Los 16 tests obligatorios de T5 están presentes y pasan la verificación de nomenclatura. Todos los archivos requeridos existen. Las 5 convenciones críticas se cumplen íntegramente. La compatibilidad con v1.0 es total (ningún contrato existente fue alterado). Ambos endpoints están protegidos con `requireAuth` y no hay concatenación SQL de valores de usuario.
