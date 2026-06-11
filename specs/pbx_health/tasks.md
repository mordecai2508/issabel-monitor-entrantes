# tasks.md — pbx_health

> Feature ID: 14 | Orden de implementación | Revisión: 2026-06-10

El implementer sigue estas tareas en orden. Marca `[x]` al completar cada una.

---

- [x] **T1. (No aplica) Sin dependencias npm nuevas**
  - Confirmar en `design.md §4` que no se requiere `npm install` adicional (backend ni frontend). No hay acción de instalación que ejecutar.

- [x] **T2. (No aplica) Sin cambios en `backend/db/setup.js`**
  - Confirmar en `design.md §2` que no se crean tablas nuevas. El estado de salud PBX vive en memoria dentro del servicio (T3). No modificar `backend/db/setup.js`.

- [x] **T3. Crear `backend/services/pbxHealthService.js`**
  - `'use strict'` al inicio.
  - Patrón factory: `module.exports = function createPbxHealthService(pool, broadcast, options = {})`.
  - Mantener estado interno en memoria: `{ connected: boolean, lastCheck: string|null, lastError: string|null, latencyMs: number|null }`, inicializado a `{ connected: false, lastCheck: null, lastError: null, latencyMs: null }`.
  - Implementar `async function check()`:
    - Mide tiempo de inicio, ejecuta `pool.query('SELECT 1')` con un timeout acotado (p. ej. 5000 ms vía `Promise.race`, `design.md §6.1`).
    - Calcula `latencyMs` (tiempo transcurrido hasta éxito, fallo o timeout) — R10.
    - Éxito → `connected: true`, `lastError: null`.
    - Fallo/timeout → `connected: false`, `lastError: <mensaje descriptivo>` — R9.
    - Actualiza `lastCheck` con la fecha/hora actual en ISO 8601.
    - Si el nuevo `connected` difiere del valor previo (y NO es la primera verificación desde el arranque), llama a `broadcast('pbx_status', getStatus())` — R11, R12, R13.
    - Devuelve el nuevo estado.
  - Implementar `function getStatus()`: devuelve una copia del estado actual en memoria (síncrono, sin I/O) — usado por R4, R23.
  - Implementar `async function ensureChecked()`: si `lastCheck === null`, llama a `check()` y espera su resultado; si no, devuelve `getStatus()` directamente — usado por R3.
  - Implementar `function start(intervalMs)`: arranca un `setInterval` propio que llama a `check()` periódicamente (default sugerido: 15000 ms, `design.md §6.2`); devolver una función `stop()` para limpiar el timer (útil en tests).
  - Exportar `{ check, getStatus, ensureChecked, start }` (o un objeto/instancia equivalente).
  - No tocar `dbOk`, `fetchData`, ni ninguna query sobre `cdr` — única query: `SELECT 1` (R21).

- [x] **T4. Crear `backend/routes/pbx.js`**
  - `'use strict'` al inicio.
  - Patrón factory: `module.exports = function pbxRouter(pool, config, db, requireAuth, pbxHealthService)`.
  - `GET /pbx/health` (R1–R4):
    - `requireAuth`.
    - `const status = await pbxHealthService.ensureChecked();`
    - `res.json({ ok: true, data: status });`
  - `POST /pbx/sync` (R5–R7):
    - `requireAuth`.
    - `const status = await pbxHealthService.check();`
    - `res.json({ ok: true, data: status });` (siempre HTTP 200, incluso si `connected: false` — R7).
  - Respuestas siguiendo el formato estándar `{ ok: true, data: ... }`.
  - `try/catch` en ambos handlers; en caso de excepción inesperada (no relacionada con la propia verificación, p. ej. error de programación), `res.status(500).json({ ok: false, error: 'Error al verificar el estado del PBX' })` y `console.error('[pbx] ...', err.message)`.

- [x] **T5. Registrar el servicio y el router en `server.js`**
  - Dentro de `startServer()`, junto a la creación de `db` y antes/cerca de los demás `app.use('/api', ...)`:
    ```js
    const createPbxHealthService = require('./services/pbxHealthService');
    const pbxHealthService = createPbxHealthService(pool, broadcast);
    pbxHealthService.start(15_000); // o el valor por defecto elegido en T3
    app.use('/api', require('./routes/pbx')(pool, config, db, requireAuth, pbxHealthService));
    ```
  - **Importante:** `broadcast` se define dentro del bloque "SSE — actualizaciones en tiempo real" (línea ~436-443 de `server.js`), que está *después* del bloque actual de `app.use('/api', ...)` (línea ~308-313). Reordenar únicamente lo necesario para que `broadcast` y `pbxHealthService`/`app.use('/api', require('./routes/pbx')...)` estén disponibles en el orden correcto, sin reestructurar el resto de `server.js` (mover el bloque `sseClients`/`broadcast` más arriba, o instanciar `pbxHealthService` y montar su router después de definir `broadcast` — cualquiera de las dos formas es aceptable, priorizando el mínimo diff).
  - Dentro del handler `GET /api/events` (línea ~445-470), añadir al payload `init` ya enviado la clave `pbxStatus: pbxHealthService.getStatus()` (R23) — sin eliminar ni renombrar ninguna clave existente del objeto `data`.
  - No modificar el `setInterval` existente de `/api/events` (línea ~472-483).
  - Solo estas líneas/adiciones; no modificar ninguna otra parte de `server.js`.

- [x] **T6. Escribir tests `backend/tests/pbx.test.js`**
  - Framework: Jest + Supertest, mock de `pool.query` (sin requests reales a Issabel), siguiendo el patrón de `backend/tests/users.test.js`/`stats.test.js`.
  - Cubrir, nombrando cada `it` con el `R<n>` correspondiente:
    - `R1`/`R3`/`R4` — `GET /api/pbx/health` con sesión válida y `pool.query` simulando éxito → 200, `data.connected === true`, `data.lastError === null`, `data.lastCheck` es un ISO 8601 válido, `data.latencyMs` es un número ≥ 0.
    - `R2` — `GET /api/pbx/health` sin sesión → 401.
    - `R5`/`R7` — `POST /api/pbx/sync` con `pool.query` simulando un fallo de conexión (rejected promise) → 200, `data.connected === false`, `data.lastError` es un string no vacío.
    - `R6` — `POST /api/pbx/sync` sin sesión → 401.
    - `R8`/`R9`/`R10` — invocar directamente `pbxHealthService.check()` (sin pasar por HTTP) con `pool.query` simulando un timeout (promesa que nunca resuelve o tarda más que el límite configurado) → resultado `connected: false`, `lastError` describe el timeout, `latencyMs` es un número ≥ 0.
    - `R11`/`R12`/`R13` — invocar `pbxHealthService.check()` dos veces con resultados distintos (éxito → fallo) y verificar que `broadcast` (mock) se llama exactamente una vez con `('pbx_status', expect.objectContaining({ connected: false }))`; luego una tercera llamada con el mismo resultado (fallo → fallo) y verificar que `broadcast` NO se llama de nuevo; y verificar que la primera llamada a `check()` tras crear el servicio (sin estado previo) NO dispara `broadcast`.
    - `R20` — smoke test: `GET /api/calls/today` (mockeado) y `GET /api/events` (conexión SSE) siguen respondiendo con su forma habitual tras montar `routes/pbx.js` (no-regresión).
    - `R23` — el evento `init` de `GET /api/events` incluye una clave `pbxStatus` con la forma `{ connected, lastCheck, lastError, latencyMs }`.
  - No hacer requests reales a la BD de Issabel; usar mocks/fixtures de `pool.query` (incluyendo un mock que rechaza para simular `connected: false`).
  - Si T6 introduce timers reales (`setInterval`/timeouts) usar `jest.useFakeTimers()` o llamar a `stop()` del servicio al finalizar cada test para evitar handles abiertos que cuelguen Jest.

- [x] **T7. Crear componentes frontend**
  - `frontend/src/components/PbxStatus.jsx` (R14, R15, R18, R19) — indicador verde/rojo/neutro, carga inicial vía `api.pbxHealth()`, botón de sincronización manual vía `api.pbxSync()` con estado de carga, según `design.md §5.1`.
  - `frontend/src/components/Toast.jsx` (R16, R17) — componente genérico de notificación flotante con auto-dismiss, según `design.md §5.3`.
  - Añadir en `frontend/src/api.js`: `pbxHealth()` (`GET /api/pbx/health`) y `pbxSync()` (`POST /api/pbx/sync`), según `design.md §5.4`.

- [x] **T8. Integrar `PbxStatus.jsx` en `Layout.jsx`; extender `useSSE.js`**
  - `frontend/src/hooks/useSSE.js`: añadir el callback opcional `onPbxStatus` para el evento `pbx_status`, sin alterar `onInit`/`onUpdate` (`design.md §5.2`).
  - `frontend/src/components/Layout.jsx`: montar `<PbxStatus />` (visible en toda pantalla autenticada, R14), instanciando `useSSE('/api/events', { onPbxStatus })` para recibir actualizaciones (`design.md §6.3`). Renderizar `<Toast />` cuando `onPbxStatus` indique una transición conectado→desconectado (R16) o desconectado→conectado (R17).
  - No se añaden rutas nuevas en `App.jsx` ni entradas de `<nav>` en `Layout.jsx` (`design.md §5.5`).

- [x] **T9. Verificación final**
  - Ejecutar `npm test` desde `backend/`: todos los tests deben pasar en verde, incluyendo `pbx.test.js` y los existentes (no-regresión de `users.test.js`, `inbound.test.js`, `outbound.test.js`, `stats.test.js`, `reports.test.js`, `config.test.js`).
  - Ejecutar `npm run build` en `frontend/`: build de Vite sin errores.
  - Ejecutar `./init.sh`: debe terminar en verde.
  - Confirmar manualmente que `/api/calls/today`, `/api/calls/range` y `/api/events` (`init`/`update`) siguen respondiendo igual que antes, con `init` incluyendo además `pbxStatus` (R20, R23).
  - Confirmar manualmente: con la BD de Issabel accesible, el indicador en `Layout.jsx` muestra "conectado" (verde); al hacer inaccesible la BD (p. ej. detener el contenedor MySQL o apuntar `config.json` a un host inválido y reiniciar), tras el siguiente ciclo de verificación el indicador cambia a "desconectado" (rojo) y aparece el toast de desconexión (R16); el botón de sincronización manual (`POST /api/pbx/sync`) refleja el estado real al pulsarlo en ambos escenarios (R18).
