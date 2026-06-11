# Review — pbx_health — APROBADO

## Trazabilidad
| R<n> | Test/Evidencia | Estado |
|---|---|---|
| R1 | `backend/tests/pbx.test.js` — "R1/R3/R4 - sesión válida y pool.query exitoso retorna 200 con connected=true, lastError=null, lastCheck ISO 8601 y latencyMs >= 0" | ✅ |
| R2 | `backend/tests/pbx.test.js` — "R2 - sin sesión retorna 401 sin datos de estado" (verifica `res.body.data === undefined`) | ✅ |
| R3 | `backend/tests/pbx.test.js` — "R3 - sin verificación previa, GET /api/pbx/health la realiza de forma síncrona (lastCheck nunca null)"; implementación `ensureChecked()` en `pbxHealthService.js:83-88` | ✅ |
| R4 | `backend/tests/pbx.test.js` — "R4 - una segunda solicitud reutiliza el resultado de la verificación previa (no llama pool.query de nuevo)" — verifica `poolQueryImpl` se llama 1 sola vez | ✅ |
| R5 | `backend/tests/pbx.test.js` — "R5/R7 - pool.query falla retorna 200..." y "R5 - sesión válida y pool.query exitoso fuerza una nueva verificación..." (verifica `check()` se invoca, no `ensureChecked()`) | ✅ |
| R6 | `backend/tests/pbx.test.js` — "R6 - sin sesión retorna 401 sin realizar verificación" (verifica `poolQueryImpl` no llamado) | ✅ |
| R7 | `backend/tests/pbx.test.js` — "R5/R7 - pool.query falla retorna 200 con connected=false y lastError no vacío" (status 200, no error HTTP) | ✅ |
| R8 | `backend/tests/pbx.test.js` — "R8/R9/R10 - pool.query nunca resuelve: check() retorna connected=false..."; `pbxHealthService.start()` arranca verificación periódica independiente | ✅ |
| R9 | (idem R8) — `Promise.race` + `setTimeout(timeoutMs)` rechaza con `'Timeout al verificar la conexión'` (`pbxHealthService.js:51-63`); test confirma `lastError` matchea `/timeout/i` | ✅ |
| R10 | (idem R8) — `latencyMs = Date.now() - startedAt` calculado tras éxito/fallo/timeout (`pbxHealthService.js:65`); test confirma `latencyMs` numérico ≥ 0 también en el caso de timeout | ✅ |
| R11 | `backend/tests/pbx.test.js` — "R11 - una transición connected=true -> connected=false dispara broadcast('pbx_status', { connected: false, ... }) exactamente una vez" | ✅ |
| R12 | `backend/tests/pbx.test.js` — "R12 - una verificación con el mismo connected que la anterior NO dispara un nuevo broadcast" (3 checks, 1 sola llamada a broadcast) | ✅ |
| R13 | `backend/tests/pbx.test.js` — "R13 - la primera verificación desde el arranque NO dispara broadcast" | ✅ |
| R14 | `frontend/src/components/Layout.jsx:151-153` monta `<PbxStatus pbxStatus={pbxStatus} />` dentro del `<aside>`, visible en todo layout autenticado (todas las rutas protegidas usan `Layout`). `PbxStatus.jsx:59-78` define 3 estados visuales distintos (verde "PBX conectado" / rojo "PBX desconectado" / neutro). Sin test automatizado de frontend (proyecto sin Vitest configurado — confirmado en `CLAUDE.md`). | ✅ |
| R15 | `PbxStatus.jsx:33-40` — `useEffect` de montaje llama `api.pbxHealth()` y setea `status` con el resultado (carga inicial). | ✅ |
| R16 | `Layout.jsx:51-62` — callback `onPbxStatus`: si `prevConnectedRef.current === true && data.connected === false` → `setToast({ type: 'error', message: 'Se perdió la conexión con el PBX.' })` y actualiza el indicador vía `setPbxStatus(data)`. | ✅ |
| R17 | `Layout.jsx:56-57` — transición `false → true` dispara `setToast({ type: 'success', message: 'Conexión con el PBX restablecida.' })` (cumple el "MAY" de R17 con un toast adicional de éxito). | ✅ |
| R18 | `PbxStatus.jsx:47-57` — `handleSync()` setea `syncing=true` (botón con spinner `animate-spin`, `disabled={syncing}`), llama `api.pbxSync()`, actualiza `status` (y por tanto `lastCheck`/`lastError`/`latencyMs` mostrados) con el resultado, y `finally` resetea `syncing=false`. | ✅ |
| R19 | `PbxStatus.jsx:37` y `:53` — `catch` de `api.pbxHealth()`/`api.pbxSync()` setea `status = null`, lo que renderiza el badge neutro ("Verificando…"/"Estado desconocido") en vez de "conectado"; no hay throw no capturado que pueda romper el resto de la interfaz. | ✅ |
| R20 | Diff de `backend/server.js`: handlers de `/api/calls/today`, `/api/calls/range` y el `setInterval` de poll de `/api/events` permanecen sin cambios (verificado con `git diff` — ninguna línea de esos bloques aparece en el diff). Único cambio en `/api/events` es la línea añadida `data.pbxStatus = pbxHealthService.getStatus();` antes del `init`. Cubierto además por `pbx.test.js` ("R20 - GET /api/calls/today sigue respondiendo..." y "R20 - GET /api/events sigue emitiendo el evento init..."), y por la suite completa 209/209 (incluye los tests preexistentes de `inbound`, `outbound`, `stats`, `users`, `reports`, `config`, `dashboard_lost_destinations`, todos en verde). | ✅ |
| R21 | `pbxHealthService.js:52` — única query `pool.query('SELECT 1')`, sin parámetros ni referencia a `cdr` ni a ninguna tabla. Confirmado por inspección del archivo completo (no hay otra query). | ✅ |
| R22 | `pbxHealthService.start(intervalMs)` arranca su propio `setInterval` (`pbxHealthService.js:90-98`), completamente independiente del `setInterval` de poll de `/api/events` (`server.js:482`, no modificado). Verificado por diff: el bloque de poll permanece línea-por-línea idéntico. | ✅ |
| R23 | `backend/tests/pbx.test.js` — "R23 - init.pbxStatus tiene la forma { connected, lastCheck, lastError, latencyMs }"; implementación `server.js:467` (`data.pbxStatus = pbxHealthService.getStatus();`) dentro del bloque `init` existente, sin eliminar/renombrar claves previas (`stats`, `channels`, `hourly`, `generatedAt`). | ✅ |

## No-regresión v1.0: ✅
- `cd backend && npm test` → **209/209 passing** (8 test suites), incluye los 14 tests nuevos de `pbx.test.js` y los 195 preexistentes.
- `cd frontend && npm run build` → build de Vite sin errores (2318 módulos, solo warning preexistente de chunk size, no relacionado).
- `./init.sh` → **25/25 checks en verde**.
- Diff de `backend/server.js` revisado línea por línea: el bloque `sseClients`/`broadcast` se movió **sin cambios de código** (idéntico) a justo después de los `app.use('/api', ...)` existentes, para que `broadcast` esté disponible al instanciar `pbxHealthService`. El handler `/api/events` y el `setInterval` de poll (`pollMs`) permanecen en su ubicación original; único añadido: `data.pbxStatus = pbxHealthService.getStatus();` antes de `init`. No se tocaron `/api/calls/today`, `/api/calls/range`, rutas de auth, ni middlewares `requireAuth`/`requireAdmin` (definidos antes del nuevo bloque, en el orden correcto).
- El registro nuevo en `server.js` se limita a: el bloque movido (sin cambios funcionales) + 5 líneas nuevas (broadcast helper ya existía, instanciación de `pbxHealthService`, `start(15_000)`, `app.use('/api', require('./routes/pbx')...)`) + 1 línea (`data.pbxStatus = ...`). Cumple con "mínimo diff" según `tasks.md` T5.

## Convenciones: ✅
- `backend/services/pbxHealthService.js` y `backend/routes/pbx.js` empiezan con `'use strict'`.
- `backend/routes/pbx.js` sigue el patrón factory `(pool, config, db, requireAuth, pbxHealthService) => router`.
- Única query SQL: `pool.query('SELECT 1')` — sin `SELECT *`, sin concatenación de strings.
- Sin `console.log` de debug en los archivos nuevos (`pbxHealthService.js`, `routes/pbx.js`, `pbx.test.js`); solo `console.error('[pbx] ...')` y `console.error('[pbxHealth] check: ...')` en catch/handlers de error.
- `PbxStatus.jsx` usa exclusivamente `api.pbxHealth()`/`api.pbxSync()` de `src/api.js` — sin `fetch()` directo.
- Sin TypeScript introducido (todos los archivos nuevos son `.js`/`.jsx`).
- Sin escrituras a la BD de Issabel (`pool.query('SELECT 1')` es de solo lectura, no depende de tablas/esquema de `asteriskcdrdb`).
- `lucide-react` (iconos `Wifi`, `WifiOff`, `HelpCircle`, `RefreshCw`, `CheckCircle2`, `XCircle`, `Info`, `X`) ya es dependencia existente del frontend (`package.json`) — sin dependencias nuevas, conforme a T1.
- `backend/db/setup.js` sin cambios (T2 confirmado vía `git diff`).

## Seguridad: ✅
- `GET /api/pbx/health` y `POST /api/pbx/sync` usan `requireAuth` (`backend/routes/pbx.js:18,29`).
- Sin body/params/query relevantes en estos endpoints — no aplica validación adicional de inputs.
- Sin subida de archivos (n/a para esta feature).

## Tests: ✅ (209/209 passing)

## Tasks (tasks.md): T1–T9 todas marcadas `[x]`, confirmadas mediante inspección de artefactos:
- T1/T2: sin dependencias nuevas, `backend/db/setup.js` sin cambios.
- T3: `pbxHealthService.js` implementa `check`, `getStatus`, `ensureChecked`, `start` exactamente según spec.
- T4: `routes/pbx.js` implementa ambos endpoints con el formato estándar `{ ok, data }` / `{ ok: false, error }`.
- T5: registro en `server.js` mínimo, reordenamiento `sseClients`/`broadcast` confirmado idéntico, `init` incluye `pbxStatus`, `setInterval` de poll intacto.
- T6: 14 tests cubriendo R1-R13, R20, R23, todos pasan.
- T7/T8: `PbxStatus.jsx`, `Toast.jsx`, `api.js` (pbxHealth/pbxSync), `useSSE.js` (onPbxStatus aditivo), `Layout.jsx` (monta PbxStatus + Toast, sin nuevas rutas/nav).
- T9: `npm test` (209/209), `npm run build` (sin errores), `./init.sh` (25/25 verde) — todos confirmados de forma independiente por este review.

---

**Decisión: APROBADO.**
**SIGUIENTE PASO OBLIGATORIO:** git add -A && git commit -m "feat(pbx_health): Monitoreo de salud de la conexión PBX"
Solo después del commit: marcar done en feature_list.json e iniciar la siguiente feature.
