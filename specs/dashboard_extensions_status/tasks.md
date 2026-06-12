# tasks.md — dashboard_extensions_status

> Feature ID: 18 | Orden de implementación | Revisión: 2026-06-12

El implementer sigue estas tareas en orden. Marca `[x]` al completar cada una.

---

- [x] **T1. `npm install asterisk-manager` en `backend/`**
  - Añadir `asterisk-manager` (`^0.2.0`) a `backend/package.json` (`dependencies`), según `design.md §3`.
  - Confirmar que no requiere compilación nativa (paquete JS puro) y que `npm install` no falla en el entorno del proyecto.

- [x] **T2. Actualizar `config.example.json` y documentar `config.json`**
  - Añadir el bloque `ami` de nivel superior a `backend/config.example.json` con valores placeholder (`host`, `port: 5038`, `username`, `password`), análogo al bloque `db` existente — `design.md §2.2`.
  - **No modificar** `backend/config.json` real (gitignored) — el administrador lo rellena manualmente; si existe en el entorno de desarrollo, opcionalmente añadir un bloque `ami` vacío/comentado de ejemplo, pero no es obligatorio para los tests (R2/R9 deben funcionar con `ami` ausente).
  - No tocar ningún otro bloque de `config.example.json` (`db`, `server`, `app`, `channels`, etc.) — cambio puramente aditivo.

- [x] **T3. (No aplica) Sin cambios en `backend/db/setup.js`**
  - Confirmar en `design.md §2.1` que no se crean tablas SQLite nuevas. El estado de extensiones vive en memoria dentro del servicio (T4). No modificar `backend/db/setup.js`.

- [x] **T4. Crear `backend/services/amiExtensionsService.js`**
  - `'use strict'` al inicio.
  - Patrón factory: `module.exports = function createAmiExtensionsService(amiConfig, options = {})`.
  - Validar `amiConfig`: si `amiConfig` es `null`/`undefined` o le falta `host`/`port`/`username`/`password`, marcar como "no configurado" — estado inicial `{ total: 0, active: 0, extensions: [], available: false }`, sin intentar conectar (R2, R9, `design.md §4.1`).
  - Si está configurado, crear la instancia de `asterisk-manager` (`new AsteriskManager(port, host, username, password, true)`), con manejo del evento `error` que registra (`console.error`, sin exponer `username`/`password`, R20) y marca `available: false` sin lanzar excepción no capturada (R11).
  - Implementar `async function check()`:
    - No configurado → devuelve el estado fijo `{ total: 0, active: 0, extensions: [], available: false }` (R9), sin tocar la red.
    - Configurado → ejecuta la acción AMI `PJSIPShowEndpoints` con timeout acotado (p. ej. 5000 ms vía `Promise.race`, R13, `design.md §4.1`).
    - Éxito → parsea la respuesta a `{ extension, status }[]` según `design.md §4.2` (acumular `EndpointList` hasta `EndpointListComplete`, normalizar `status` a `'active'`/`'inactive'`), calcula `total`/`active`, actualiza estado interno con `available: true`.
    - Fallo/timeout → registra el error (`console.error`, sin credenciales) y **conserva el estado anterior si `available` ya era `true`**; si nunca hubo éxito, mantiene `{ total: 0, active: 0, extensions: [], available: false }` (R10, R11).
    - Devuelve una copia del nuevo estado.
  - Implementar `function getStatus()`: devuelve una copia síncrona del estado en memoria (sin I/O) — usado por R6.
  - Implementar `function start(intervalMs)`: arranca un `setInterval` propio que llama a `check()` periódicamente (default sugerido 30000 ms, `design.md §4.3`); si no configurado, puede ser no-op. Devolver `stop()` para limpieza en tests.
  - Exportar `{ check, getStatus, start }`.
  - No usar el pool MySQL ni tocar `cdr` (R19). No emitir comandos de escritura AMI (R5).

- [x] **T5. Ampliar `backend/routes/pbx.js`**
  - Ampliar el factory existente: `module.exports = function pbxRouter(pool, config, db, requireAuth, broadcast, pbxHealthService, amiExtensionsService)` — añadir `amiExtensionsService` como último argumento (cambio aditivo, no reordenar los existentes).
  - Añadir `GET /pbx/extensions` (R6-R10):
    - `requireAuth`.
    - `const status = amiExtensionsService.getStatus();` (síncrono, sin `await` de red — R6).
    - `res.json({ ok: true, data: status });` (siempre HTTP 200 para usuarios autenticados, incluso `available: false` — R9/R10).
  - `try/catch`; en caso de excepción inesperada, `res.status(500).json({ ok: false, error: 'Error al obtener el estado de las extensiones' })` y `console.error('[pbx] ...', err.message)`.
  - No modificar los handlers existentes `GET /pbx/health` / `POST /pbx/sync` (R18).

- [x] **T6. Registrar el servicio AMI en `server.js`**
  - Dentro de `startServer()`, junto a la instanciación de `pbxHealthService`:
    ```js
    const createAmiExtensionsService = require('./services/amiExtensionsService');
    const amiExtensionsService = createAmiExtensionsService(config.ami);
    amiExtensionsService.start(30_000); // o el default elegido en T4
    app.use('/api', require('./routes/pbx')(pool, config, db, requireAuth, broadcast, pbxHealthService, amiExtensionsService));
    ```
  - Si `app.use('/api', require('./routes/pbx')(...))` ya está montado para `pbx_health`, **actualizar esa línea existente** para pasar el nuevo argumento `amiExtensionsService` — no duplicar el `app.use` (R18, `design.md §6.2`).
  - No modificar el `setInterval` existente de `/api/events` ni el de `pbxHealthService`.
  - Solo estas líneas/adiciones; no modificar ninguna otra parte de `server.js`.

- [x] **T7. Escribir tests `backend/tests/ami.test.js`** (o ampliar `backend/tests/pbx.test.js` si el implementer lo considera más cohesivo, dado que comparten router)
  - Framework: Jest + Supertest, mock de `asterisk-manager` (sin conexión AMI real), siguiendo el patrón de `backend/tests/pbx.test.js`.
  - Cubrir, nombrando cada `it` con el `R<n>` correspondiente:
    - `R1`/`R2` — `createAmiExtensionsService(undefined)` y `createAmiExtensionsService({})` (sin `host`/`port`/etc.) → `getStatus()` devuelve `{ total: 0, active: 0, extensions: [], available: false }` sin lanzar excepción ni intentar conectar (verificar que el mock de `asterisk-manager` no se invoca).
    - `R7` — `GET /api/pbx/extensions` con sesión válida y `amiExtensionsService` mockeado para devolver un estado con `available: true`, `total: 3`, `active: 2`, `extensions: [...]` → 200, `data` tiene exactamente esa forma.
    - `R8` — `GET /api/pbx/extensions` sin sesión → 401.
    - `R9` — AMI no configurado (`config.ami` ausente/`{}`) → `GET /api/pbx/extensions` con sesión válida → 200, `{ ok: true, data: { total: 0, active: 0, extensions: [], available: false } }`.
    - `R10`/`R11` — invocar directamente `amiExtensionsService.check()` con el mock de `asterisk-manager` simulando un fallo de conexión (evento `error` o acción que rechaza/timeout) → el estado resultante mantiene `available: false` (si nunca hubo éxito) o conserva el estado previo (si hubo éxito antes); verificar que no se lanza excepción no capturada y que se llamó a `console.error` (o spy equivalente) sin incluir `username`/`password` en el mensaje (R20).
    - `R6` — `GET /api/pbx/extensions` no dispara una nueva consulta AMI por request: mockear `amiExtensionsService.check` con un spy, llamar al endpoint dos veces, y verificar que `check` no se invoca desde el handler (solo `getStatus`).
    - `R12`/`R13` — `check()` con un mock que tarda más que el timeout configurado → resultado `available: false` (o estado previo conservado) en un tiempo acotado (no espera indefinidamente); usar `jest.useFakeTimers()` si es necesario.
    - `R18` — smoke test: `GET /api/calls/today` (mockeado) y `GET /api/pbx/health` siguen respondiendo con su forma habitual tras ampliar `routes/pbx.js` (no-regresión).
  - No hacer conexiones AMI reales; usar mocks/fixtures de `asterisk-manager` (p. ej. `jest.mock('asterisk-manager', () => jest.fn(() => ({ on: jest.fn(), action: jest.fn(), ... })))`).
  - Si T7 introduce timers reales (`setInterval`/timeouts) usar `jest.useFakeTimers()` o llamar a `stop()` del servicio al finalizar cada test para evitar handles abiertos que cuelguen Jest.

- [x] **T8. Añadir `pbxExtensions()` a `frontend/src/api.js`**
  - `pbxExtensions: () => req('GET', '/api/pbx/extensions')`, según `design.md §5.3`.

- [x] **T9. Añadir indicadores "Extensiones"/"Activas" a `frontend/src/components/Dashboard.jsx`**
  - Estado local `extensionsData` inicializado a `{ total: 0, active: 0, extensions: [], available: false }`.
  - `useEffect` con carga inicial (`api.pbxExtensions()`) + `setInterval` cada 30 s (limpiado en cleanup), con `.catch()` que deja `extensionsData` en el estado neutro `available: false` sin lanzar (R17, `design.md §5.2`).
  - Renderizar dos `StatCard` adicionales: `label="Extensiones"` (`value={extensionsData.total}`) y `label="Activas"` (`value={extensionsData.active}`), con iconos `Users`/`UserCheck` de `lucide-react` o equivalentes disponibles (`design.md §5.1`).
  - Si `extensionsData.available === false`, aplicar un estilo visual atenuado opcional (R16) sin condicionar el render del resto de `StatCard`/gráficos existentes.
  - No modificar la lógica de `useSSE`/`init`/`update` ni el resto de KPIs/gráficos existentes (R18).

- [x] **T10. Verificación final**
  - Ejecutar `npm test` desde `backend/`: todos los tests deben pasar en verde, incluyendo `ami.test.js`/`pbx.test.js` ampliado y los existentes (no-regresión de `users.test.js`, `inbound.test.js`, `outbound.test.js`, `stats.test.js`, `reports.test.js`, `config.test.js`, `pbx.test.js`).
  - Ejecutar `npm run build` en `frontend/`: build de Vite sin errores.
  - Ejecutar `./init.sh`: debe terminar en verde.
  - Confirmar manualmente: con `config.ami` ausente/vacío, `GET /api/pbx/extensions` devuelve `{ ok: true, data: { total: 0, active: 0, extensions: [], available: false } }` y el dashboard muestra "Extensiones"/"Activas" en `0` sin romper el resto de KPIs (R9, R16).
  - Confirmar manualmente (si hay un PBX Issabel/Asterisk de pruebas accesible): con `config.ami` configurado correctamente, `GET /api/pbx/extensions` devuelve `total`/`active` reales y `available: true`, y el dashboard refleja esos valores tras el siguiente ciclo de refresco (R7, R14, R15).
  - Confirmar manualmente: apuntar `config.ami` a un host/credenciales inválidos → `GET /api/pbx/extensions` sigue devolviendo HTTP 200 con `available: false` (o el último estado bueno conocido), el servidor no se cae, y `/api/calls/today`/`/api/events`/`/api/pbx/health` siguen funcionando con normalidad (R10, R11, R18).

---

## Correcciones post-review (trazabilidad R12/R14-R17/R19/R20)

El `reviewer` rechazó la primera implementación (T1-T10, todas `[x]`) solo por
trazabilidad: 7 de 20 requisitos (R12, R14, R15, R16, R17, R19, R20) no tenían
un `it('R<n> - ...')` nombrado. Código funcional ya correcto, sin cambios.

- [x] **T11. `backend/tests/ami.test.js` — añadir tests nombrados R12/R19/R20**
  - `R12` (x2): `amiExtensionsService.start()` arranca su propio `setInterval`,
    independiente de cualquier timer del ciclo SSE de `/api/events` (con
    `jest.useFakeTimers()` + `jest.advanceTimersByTimeAsync()`, verificando
    consultas AMI periódicas y que `stop()` detiene el ciclo).
  - `R19` (x3): la firma de `createAmiExtensionsService` no declara/usa
    `pool`; `check()` nunca invoca `pool.query` (configurado/no configurado/
    éxito/fallo); `GET /api/pbx/extensions` responde solo vía `getStatus()`
    sin tocar `pool`.
  - `R20` (x2): extraído a su propio describe — `getStatus()` y los logs de
    `console.error` no contienen `username`/`password` AMI tras un fallo;
    `GET /api/pbx/extensions` no expone credenciales en la respuesta.
  - No se modificó `amiExtensionsService.js`, `routes/pbx.js` ni `server.js`.

- [x] **T12. Configurar Vitest en `frontend/` y añadir tests R14-R17**
  - Dependencias dev: `vitest`, `@testing-library/react`,
    `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`.
  - Script `"test": "vitest run"` en `frontend/package.json`.
  - `frontend/vitest.config.js` (config separada de `vite.config.js`,
    entorno `jsdom`, `setupFiles: ['./src/test/setup.js']`).
  - `frontend/src/components/Dashboard.test.jsx`: 4 tests (`R14`-`R17`),
    mockeando `src/api.js`, `useSSE` y los componentes de gráficos
    (`DispositionChart`/`HourlyChart`/`ChannelTable`).

- [x] **T13. Verificación final post-correcciones**
  - `cd backend && npm test` → 271/271 verdes.
  - `cd frontend && npm run build` → sin errores.
  - `cd frontend && npm test` (vitest) → 4/4 verdes.
  - `./init.sh` → 25/25 (no invoca `npm test` de frontend; fuera de alcance
    modificarlo).
