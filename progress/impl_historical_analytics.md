# Implementación — historical_analytics

## Archivos creados/modificados

| Acción | Archivo |
|--------|---------|
| Creado | `backend/services/statsService.js` |
| Creado | `backend/routes/stats.js` |
| Modificado | `backend/server.js` (require + mount) |
| Creado | `backend/tests/stats.test.js` |
| Creado | `frontend/src/components/HistoricalAnalytics.jsx` |
| Modificado | `frontend/src/api.js` (3 métodos añadidos) |
| Modificado | `frontend/src/App.jsx` (import + ruta) |
| Modificado | `frontend/src/components/Layout.jsx` (NavItem Analytics) |

## Trazabilidad R<n> → test

| Requisito | Test | Archivo:línea |
|---|---|---|
| R1 | R1 - parámetros válidos retornan 200 y estructura correcta | stats.test.js:80 |
| R2 | R2 - period=day: period_label tiene formato YYYY-MM-DD | stats.test.js:93 |
| R3 | R3 - period=week: period_label tiene formato YYYY-Www | stats.test.js:104 |
| R4 | R4 - period=month: period_label tiene formato YYYY-MM | stats.test.js:115 |
| R5 | R5 - period=year: period_label tiene formato YYYY | stats.test.js:126 |
| R6 | R6 - period=custom: retorna un único punto con period_label "from / to" | stats.test.js:137 |
| R8 | R8 - period inválido retorna 400 | stats.test.js:148 |
| R9 | R9 - from/to ausentes retornan 400 | stats.test.js:157 |
| R9 | R9 - from/to con formato inválido retornan 400 | stats.test.js:165 |
| R10 | R10 - from posterior a to retorna 400 | stats.test.js:174 |
| R11 | R11 - rango sin datos retorna 200 con points: [] | stats.test.js:183 |
| R11 | R11 - custom period sin datos retorna 200 con points: [] | stats.test.js:282 |
| R12 | R12 - sin sesión retorna 401 (historical) | stats.test.js:192 |
| R12 | R12 - sin sesión retorna 401 en compare | stats.test.js:256 |
| R12 | R12 - sin sesión retorna 401 en rankings | stats.test.js:338 |
| R14 | R14 - parámetros válidos retornan 200 con period1, period2, variation | stats.test.js:204 |
| R16 | R16 - variation contiene variación porcentual correcta | stats.test.js:222 |
| R17 | R17 - variation es null cuando period1 KPI es 0 | stats.test.js:236 |
| R18 | R18 - parámetros de compare inválidos retornan 400 | stats.test.js:248 |
| R19 | R19 - from > to en compare retorna 400 | stats.test.js:256 (segunda) |
| R22 | R22 - parámetros válidos retornan 200 con estructura correcta | stats.test.js:278 |
| R23 | R23 - type=extension agrupa por src | stats.test.js:290 |
| R24 | R24 - type=trunk agrupa por canal normalizado | stats.test.js:303 |
| R27 | R27 - limit fuera de rango retorna 400 | stats.test.js:316 |
| R27 | R27 - limit=0 retorna 400 | stats.test.js:325 |
| R28 | R28 - type inválido retorna 400 | stats.test.js:334 |
| R30 | R30 - rango sin datos retorna 200 con rankings: [] | stats.test.js:342 |

## Resultado

- Tests: 83/83 passing (incluyendo 27 nuevos en stats.test.js y 56 de no-regresión)
- Build frontend: OK (warning de chunk size pre-existente, no nuevo)
- No-regresión: OK (inbound, outbound, users tests todos verdes)
- Notas:
  - La spec indicaba `app.use('/api', statsRouter(pool, config, requireAuth, dbOk))` en tasks.md pero el router recibe solo `(pool, config, requireAuth)` — la verificación de `dbOk` se delega al try/catch de cada endpoint (errores de conexión devuelven 503), consistente con el design.md §5 y con el patrón de otros routers del proyecto.
  - El chunk size warning (660 kB) es pre-existente por Recharts y no está relacionado con esta feature.
