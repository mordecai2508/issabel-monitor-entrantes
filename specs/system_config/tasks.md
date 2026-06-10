# tasks.md — system_config

> Feature ID: 13 | Orden de implementación | Revisión: 2026-06-10

El implementer sigue estas tareas en orden. Marca `[x]` al completar cada una.

---

- [x] **T1. Instalar dependencia npm `multer`**
  - Desde `backend/`: `npm install multer@^1.4.5-lts.1` (ver `design.md §3`).
  - Verificar que queda registrada en `backend/package.json` → `dependencies`.

- [x] **T2. Crear directorio `backend/uploads/` con `.gitkeep`**
  - Crear `backend/uploads/.gitkeep` (vacío). El `.gitignore` raíz ya contiene `backend/uploads/*` y `!backend/uploads/.gitkeep`, por lo que no se requiere ningún cambio en `.gitignore`.

- [x] **T3. Crear/actualizar tablas en `backend/db/setup.js`**
  - Añadir, dentro de `initDb(config)`, tres bloques `db.exec(\`CREATE TABLE IF NOT EXISTS ...\`)` según `design.md §2`:
    - `system_config (key TEXT PRIMARY KEY, value TEXT)`.
    - `extensions_config (extension TEXT PRIMARY KEY, display_name TEXT, hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1)))`.
    - `trunks_config (trunk TEXT PRIMARY KEY, hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1)))`.
  - No modificar las tablas `users`/`audit_log` ni la lógica de migración existente.

- [x] **T4. Crear `backend/services/configService.js`**
  - `'use strict'` al inicio.
  - Implementar y exportar:
    - `getConfigValue(db, key, fallback = null)` y `setConfigValue(db, key, value)` (`design.md §2.1`).
    - `getGeneralConfig(db, { fallbackAppName, fallbackTimezone })` → `{ companyName, timezone, language, themeColors: { primary, accent }, logoPath }` aplicando los defaults de `design.md §4.2` (R3).
    - `updateGeneralConfig(db, fields)` → valida y persiste solo los campos provistos (`companyName`, `timezone`, `language`, `themeColors`) según las reglas de validación R5–R8 (`design.md §4.2`); lanza un error tipado/objeto `{ status: 400, message }` si la validación falla, sin escribir nada.
    - `setLogoPath(db, absolutePath)` / `getLogoPath(db)` / `clearLogoPath(db)`.
    - `upsertExtensionOverride(db, extension, { displayName, hidden })` y `getExtensionOverrides(db, extensions)` (consulta `IN (?, ?, ...)` con parámetros, `design.md §4.3`); aplica la regla de borrado R26.
    - `upsertTrunkOverride(db, trunk, hidden)` y `getTrunkOverrides(db, trunks)`; aplica la regla de borrado R31.
  - No ejecutar SQL nuevo sobre `cdr`.

- [x] **T5. Crear `backend/routes/config.js`**
  - `'use strict'` al inicio.
  - Patrón factory: `module.exports = function configRouter(pool, config, db, requireAuth, requireAdmin, getAppName) { ... }`.
  - Configurar `multer` con `diskStorage` apuntando a `backend/uploads/`, `fileFilter` (solo `image/png`/`image/jpeg`) y `limits.fileSize = 2 * 1024 * 1024` (`design.md §4.1`).
  - Implementar los 8 endpoints de `design.md §1`:
    - `GET /admin/config` (R1–R3).
    - `PATCH /admin/config` (R4–R10).
    - `POST /admin/config/logo` (R11–R16) — capturar errores de `multer` (`fileFilter`/`LIMIT_FILE_SIZE`) y traducirlos a HTTP 400 con `{ ok: false, error: '...' }`; al éxito, eliminar el logo previo (R15).
    - `GET /admin/config/logo` (R17–R19) — `fs.createReadStream` + `Content-Type` según extensión.
    - `PATCH /admin/extensions/:ext` (R20–R26).
    - `GET /admin/extensions` (soporte UI, `design.md §1` y `§4.3`) — usa `statsService.queryRankings(pool, from, to, 'extension', 50)` con rango de los últimos 30 días (mismo cálculo que `routes/stats.js`); si `!dbOk`, devuelve `{ ok: true, data: [], dbUnavailable: true }`.
    - `PATCH /admin/trunks/:trunk` (R27–R31).
    - `GET /admin/trunks` (soporte UI, análogo a `GET /admin/extensions` pero con `'trunk'`).
  - Todos los endpoints de escritura usan `requireAdmin`; `GET /admin/config/logo` usa `requireAuth` (R19); el resto de `GET` usa `requireAdmin` (son pantallas admin-only).
  - Respuestas siguiendo el formato estándar `{ ok: true, data: ... }` / `{ ok: false, error: '...' }`.

- [x] **T6. Registrar el router y crear `backend/uploads/` en `server.js`**
  - Dentro de `startServer()`, junto a los demás `app.use('/api', ...)`, añadir:
    ```js
    const configRouter = require('./routes/config');
    app.use('/api', configRouter(pool, config, db, requireAuth, requireAdmin, getAppName));
    ```
  - Asegurar (si no existe ya por T2) que `backend/uploads/` exista en disco al arrancar — si `multer`'s `diskStorage.destination` no crea el directorio automáticamente, añadir un `fs.mkdirSync(UPLOADS_DIR, { recursive: true })` defensivo dentro de `routes/config.js` (no en `server.js`, para no tocar su estructura — solo la línea de `require`/`app.use`).
  - Solo estas líneas; no modificar ninguna otra parte de `server.js`.

- [x] **T7. Escribir tests `backend/tests/config.test.js`**
  - Framework: Jest + Supertest, SQLite `:memory:` (o archivo temporal) para `db`, mock de `pool.query` para los endpoints `GET /admin/extensions`/`GET /admin/trunks` (sin BD real de Issabel, patrón de `stats.test.js`).
  - Cubrir, nombrando cada `it` con el `R<n>` correspondiente:
    - `R1`/`R3` — `GET /api/admin/config` como admin retorna defaults cuando no hay filas en `system_config`.
    - `R2` — `GET /api/admin/config` sin sesión → 401; como `operador` → 403.
    - `R4` — `PATCH /api/admin/config` actualiza `companyName`, `timezone`, `language`, `themeColors` (uno y combinados) y persiste solo los campos provistos.
    - `R5`–`R8` — cada validación inválida (`companyName` vacío, `timezone` con formato incorrecto, `language` no soportado, `themeColors.primary`/`accent` no hex) → 400, sin persistir cambios.
    - `R9` — `PATCH /api/admin/config` sin sesión → 401; como `operador` → 403.
    - `R10` — tras `PATCH /api/admin/config` con `companyName`, `reportService.getBranding(db, fallbackAppName)` devuelve el nuevo `companyName` (test de integración directo al servicio, sin pasar por reports).
    - `R11` — `POST /api/admin/config/logo` con PNG/JPG válido ≤ 2MB → 200, archivo creado en `backend/uploads/`, `system_config.logoPath` actualizado.
    - `R12` — archivo con MIME no permitido (p. ej. `text/plain`) → 400, no se crea archivo ni se actualiza `logoPath`.
    - `R13` — archivo > 2MB → 400, no se crea archivo ni se actualiza `logoPath`.
    - `R14` — request sin archivo → 400.
    - `R15` — segunda subida exitosa elimina el archivo de logo anterior del filesystem.
    - `R16` — `POST /api/admin/config/logo` sin sesión → 401; como `operador` → 403.
    - `R17` — `GET /api/admin/config/logo` con logo configurado y archivo presente → 200, `Content-Type` correcto.
    - `R18` — sin logo configurado, o `logoPath` apunta a archivo inexistente → 404.
    - `R19` — `GET /api/admin/config/logo` sin sesión → 401.
    - `R20` — `PATCH /api/admin/extensions/:ext` con `displayName` y/o `hidden` → 200, fila creada/actualizada en `extensions_config`.
    - `R21` — `:ext` vacío → 400.
    - `R22` — `displayName` no string → 400, sin persistir.
    - `R23` — `hidden` no booleano → 400, sin persistir.
    - `R24` — body sin `displayName` ni `hidden` → 400.
    - `R25` — `PATCH /api/admin/extensions/:ext` sin sesión → 401; como `operador` → 403.
    - `R26` — limpiar `displayName` y `hidden=false` elimina la fila de `extensions_config`.
    - `R27` — `PATCH /api/admin/trunks/:trunk` con `hidden=true`/`false` → 200, fila creada/eliminada en `trunks_config`.
    - `R28` — `hidden` ausente o no booleano → 400, sin persistir.
    - `R29` — `:trunk` vacío → 400.
    - `R30` — `PATCH /api/admin/trunks/:trunk` sin sesión → 401; como `operador` → 403.
    - `R31` — `hidden=false` sobre troncal previamente oculta sin otros overrides elimina la fila.
    - `R39` — smoke test: `GET /api/config/public`, `PUT /api/admin/app`, `GET /api/admin/channels`, `PUT /api/admin/channels/:channel` siguen respondiendo igual que antes (no-regresión).
  - No hacer requests reales a la BD de Issabel; usar mocks/fixtures de `pool.query`.

- [x] **T8. Añadir funciones nuevas en `frontend/src/api.js`**
  - Implementar `adminConfig`, `updateAdminConfig`, `uploadLogo`, `adminExtensions`, `updateExtension`, `adminTrunks`, `updateTrunkVisibility` según `design.md §5.2`.

- [x] **T9. Crear `frontend/src/components/SystemConfig.jsx`**
  - Tabs `General` | `Personalización` | `Apariencia` (R32).
  - Tab General: formulario `companyName`/`timezone`/`language` + guardar (R33, R36).
  - Tab Personalización: subida/preview de logo con validación cliente (R34, R37), tabla de extensiones (renombrar/ocultar) y tabla de troncales (ocultar/mostrar) (R34).
  - Tab Apariencia: selectores de color `primary`/`accent` + guardar (R35, R36).
  - Banner de error/éxito inline (no `alert()`), siguiendo el patrón de `ChannelAliasManager.jsx`/`UserManagement.jsx`.

- [x] **T10. Añadir ruta en `frontend/src/App.jsx` y entrada en sidebar de `frontend/src/components/Layout.jsx`**
  - En `App.jsx`: importar `SystemConfig` y añadir `<Route path="admin/config" element={<AdminRoute><SystemConfig /></AdminRoute>} />` junto a las demás rutas admin-only.
  - En `Layout.jsx`: añadir `<NavItem to="/admin/config" icon={Settings} label="Configuración" />` (icono `Settings` de `lucide-react`) dentro del bloque `{user?.role === 'admin' && (...)}` (R38).

- [x] **T11. Verificación final**
  - Ejecutar `npm test` desde `backend/`: todos los tests deben pasar en verde, incluyendo `config.test.js` y los existentes (no-regresión de `users.test.js`, `inbound.test.js`, `outbound.test.js`, `stats.test.js`, `reports.test.js`).
  - Ejecutar `npm run build` en `frontend/`: build de Vite sin errores.
  - Ejecutar `./init.sh`: debe terminar en verde.
  - Confirmar manualmente que `/api/config/public`, `/api/admin/app`, `/api/admin/channels[/:channel]` y `/api/events` siguen respondiendo igual que antes (R39).
  - Confirmar manualmente que la pantalla `/admin/config` permite: editar y guardar datos generales, subir/ver un logo, renombrar/ocultar una extensión y ocultar/mostrar una troncal — y que tras configurar `companyName`/logo, un reporte generado vía `/api/reports/:type/pdf` (#12) los refleja sin cambios adicionales.
