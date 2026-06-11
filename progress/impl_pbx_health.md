# impl_pbx_health.md — Informe de implementación (feature #14, pbx_health)

> Implementer | Revisión: 2026-06-10

---

## Archivos creados

| Archivo | Descripción |
|---|---|
| `backend/services/pbxHealthService.js` | Servicio factory con estado en memoria (`{connected, lastCheck, lastError, latencyMs}`), `check()` (`SELECT 1` con timeout vía `Promise.race`, 5000 ms), `getStatus()`, `ensureChecked()`, `start(intervalMs)` (timer propio, default 15000 ms, devuelve `stop()`). Broadcast `pbx_status` solo en transiciones (R11/R12/R13). |
| `backend/routes/pbx.js` | Router factory `(pool, config, db, requireAuth, pbxHealthService)`. `GET /pbx/health` (`ensureChecked`), `POST /pbx/sync` (`check`). Respuestas `{ ok: true, data: ... }`, try/catch con `console.error('[pbx] ...')`. |
| `backend/tests/pbx.test.js` | 14 tests Jest + Supertest, mocks de `pool.query`, sin timers reales colgados (verificado con `--detectOpenHandles`). |
| `frontend/src/components/PbxStatus.jsx` | Indicador verde/rojo/neutro, carga inicial vía `api.pbxHealth()`, actualización por prop `pbxStatus` (SSE), botón de sincronización manual (`api.pbxSync()`) con spinner. |
| `frontend/src/components/Toast.jsx` | Toast genérico flotante (`error`/`success`/`info`), auto-dismiss 5s, botón de cierre manual. |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/server.js` | Movido el bloque `sseClients`/`broadcast` antes del bloque `app.use('/api', ...)` existente (mismo código, sin cambios funcionales). Añadido: instanciación de `pbxHealthService` (`createPbxHealthService(pool, broadcast)`), `pbxHealthService.start(15_000)`, montaje de `app.use('/api', require('./routes/pbx')(...))`. En el handler `/api/events`, añadida la línea `data.pbxStatus = pbxHealthService.getStatus();` antes de escribir el evento `init`. El `setInterval` existente de `/api/events` (poll `update`) **no se modificó**. |
| `frontend/src/hooks/useSSE.js` | Añadido el callback opcional `onPbxStatus` a la firma `useSSE(url, { onInit, onUpdate, onPbxStatus })` y el listener `es.addEventListener('pbx_status', ...)`. `onInit`/`onUpdate` sin cambios. |
| `frontend/src/components/Layout.jsx` | Añadida una instancia de `useSSE('/api/events', { onPbxStatus })`, estado `pbxStatus`/`toast`/`prevConnectedRef`, montaje de `<PbxStatus pbxStatus={pbxStatus} />` en el footer del `<aside>` (junto al bloque de usuario) y `<Toast />` condicional al final del layout para transiciones conectado↔desconectado (R16/R17). Sin cambios en `<nav>`, rutas ni lógica de `appName`/logout existentes. |
| `frontend/src/api.js` | Añadidas `pbxHealth: () => req('GET', '/api/pbx/health')` y `pbxSync: () => req('POST', '/api/pbx/sync')`. |

---

## Tabla de trazabilidad R<n> → test → archivo:línea

| Requisito | Test | Archivo:línea (aprox.) |
|---|---|---|
| R1 | `R1/R3/R4 - sesión válida y pool.query exitoso retorna 200 con connected=true, lastError=null, lastCheck ISO 8601 y latencyMs >= 0` | `backend/tests/pbx.test.js:62` |
| R2 | `R2 - sin sesión retorna 401 sin datos de estado` | `backend/tests/pbx.test.js:79` |
| R3 | `R3 - sin verificación previa, GET /api/pbx/health la realiza de forma síncrona (lastCheck nunca null)` | `backend/tests/pbx.test.js:90` |
| R4 | `R4 - una segunda solicitud reutiliza el resultado de la verificación previa (no llama pool.query de nuevo)` | `backend/tests/pbx.test.js:103` |
| R5 | `R5/R7 - pool.query falla retorna 200 con connected=false y lastError no vacío` y `R5 - sesión válida y pool.query exitoso fuerza una nueva verificación...` | `backend/tests/pbx.test.js:120`, `:136` |
| R6 | `R6 - sin sesión retorna 401 sin realizar verificación` | `backend/tests/pbx.test.js:148` |
| R7 | `R5/R7 - pool.query falla retorna 200 con connected=false y lastError no vacío` | `backend/tests/pbx.test.js:120` |
| R8 | `R8/R9/R10 - pool.query nunca resuelve: check() retorna connected=false con lastError describiendo el timeout y latencyMs >= 0` | `backend/tests/pbx.test.js:163` |
| R9 | (idem) | `backend/tests/pbx.test.js:163` — implementación: `backend/services/pbxHealthService.js` (`Promise.race` + `setTimeout` rechaza con `'Timeout al verificar la conexión'`) |
| R10 | (idem) — `latencyMs = Date.now() - startedAt` calculado en `finally` | `backend/services/pbxHealthService.js:62` |
| R11 | `R11 - una transición connected=true -> connected=false dispara broadcast("pbx_status", { connected: false, ... }) exactamente una vez` | `backend/tests/pbx.test.js:189` |
| R12 | `R12 - una verificación con el mismo connected que la anterior NO dispara un nuevo broadcast` | `backend/tests/pbx.test.js:204` |
| R13 | `R13 - la primera verificación desde el arranque NO dispara broadcast` | `backend/tests/pbx.test.js:178` |
| R14 | Componente `frontend/src/components/PbxStatus.jsx` montado en `frontend/src/components/Layout.jsx:152` (visible en todo layout autenticado). Sin test automatizado de frontend (proyecto sin Vitest configurado). |
| R15 | `PbxStatus.jsx` — `useEffect` inicial llama `api.pbxHealth()` (`frontend/src/components/PbxStatus.jsx:33-39`). |
| R16 | `Layout.jsx` — `onPbxStatus`: transición `true→false` dispara `setToast({ type: 'error', ... })` (`frontend/src/components/Layout.jsx:54-55`). |
| R17 | `Layout.jsx` — transición `false→true` dispara `setToast({ type: 'success', ... })` (`frontend/src/components/Layout.jsx:56-57`). |
| R18 | `PbxStatus.jsx` — `handleSync()` llama `api.pbxSync()`, estado `syncing` (spinner), actualiza `status` con la respuesta (`frontend/src/components/PbxStatus.jsx:46-54`). |
| R19 | `PbxStatus.jsx` — catch de `api.pbxHealth()`/`api.pbxSync()` deja `status = null` → estado neutro "Verificando…"/"Estado desconocido" (`frontend/src/components/PbxStatus.jsx:36-37`, `:51-52`). |
| R20 | `R20 - GET /api/calls/today sigue respondiendo con su forma habitual` y `R20 - GET /api/events sigue emitiendo el evento init con su forma habitual` | `backend/tests/pbx.test.js:222`, `:236`. No-regresión también confirmada por la suite completa (209/209 tests, incluyendo `inbound`, `outbound`, `stats`, `users`, `reports`, `config`, `dashboard_lost_destinations`). |
| R21 | Implementación: única query `pool.query('SELECT 1')` sin parámetros, sin tocar `cdr` (`backend/services/pbxHealthService.js:50`). Cubierto indirectamente por todos los tests de `pbx.test.js` (mocks de `pool.query`, ninguno referencia `cdr`). |
| R22 | Diseño: timer propio `setInterval` en `pbxHealthService.start()`, independiente del `setInterval` de `/api/events` (no modificado, ver diff de `server.js`). Sin test directo de "no degradación" (fuera de alcance de tests unitarios); verificado por revisión de diff (`setInterval` de poll de `update` permanece línea-por-línea idéntico). |
| R23 | `R23 - init.pbxStatus tiene la forma { connected, lastCheck, lastError, latencyMs }` | `backend/tests/pbx.test.js:255` |

---

## Resultado de verificación

### `cd backend && npm test`
```
Test Suites: 8 passed, 8 total
Tests:       209 passed, 209 total
```
(195 tests existentes + 14 nuevos de `pbx.test.js`, todos en verde — no-regresión confirmada)

### `cd frontend && npm run build`
```
✓ 2318 modules transformed.
✓ built in 11.58s
```
Sin errores. (Warning preexistente de chunk size > 500kB, no relacionado con esta feature).

### `./init.sh` (raíz del repo)
```
✅ Todo verde: 25/25 checks pasaron
El entorno está listo.
```

### Verificación adicional manual
- `node --check backend/server.js` → sintaxis OK.
- `require('./services/pbxHealthService')` y `require('./routes/pbx')` cargan sin errores.
- Arranque real de `backend/server.js` con `config.json` actual: conecta a MySQL (`[DB] Conexión exitosa a MySQL.`), arranca sin errores con `pbxHealthService.start(15_000)` activo, y el `setInterval` de poll (`pollMs=30s`) sigue intacto.
- No se realizó verificación end-to-end vía HTTP de `/api/pbx/health`/`/api/pbx/sync` con sesión real (no se dispone de credenciales en texto plano para `config.json`); cubierto por los 14 tests de `pbx.test.js` con mocks de `pool.query`.

---

## Notas de implementación

- **Reordenamiento en `server.js`**: el bloque `sseClients`/`broadcast` se movió (sin cambios de código) de la sección "SSE — actualizaciones en tiempo real" (después de `/api/calls/range`) a justo después de los `app.use('/api', ...)` existentes, para que `broadcast` esté disponible al instanciar `pbxHealthService`. El `setInterval` de poll y el handler `/api/events` permanecen en su ubicación original, solo con la línea adicional `data.pbxStatus = pbxHealthService.getStatus()`.
- **Timeout cleanup**: se añadió `clearTimeout(timeoutHandle)` en un bloque `finally` dentro de `check()` para evitar "open handles" de Jest cuando `pool.query` resuelve antes que el timeout — verificado con `--detectOpenHandles` (0 handles abiertos).
- **Frontend**: `PbxStatus.jsx` se ubicó en el footer del `<aside>` de `Layout.jsx`, junto al bloque de usuario (una de las dos ubicaciones sugeridas en `design.md §5.1`). No se añadieron rutas nuevas en `App.jsx` ni ítems de `<nav>` (R5.5 del diseño).
- No se instalaron dependencias npm nuevas (T1) ni se modificó `backend/db/setup.js` (T2), conforme a `design.md §2/§4`.
