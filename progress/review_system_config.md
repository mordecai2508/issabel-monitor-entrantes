# Review — system_config — APROBADO

## Trazabilidad

| R<n> | Test | Estado |
|---|---|---|
| R1 | `R1/R3 - admin recibe 200 con valores por defecto cuando no hay filas en system_config` | ✅ |
| R2 | `R2 - sin sesión devuelve 401` / `R2 - operador recibe 403` | ✅ |
| R3 | `R1/R3 - admin recibe 200 con valores por defecto...` (defaults: appName, db.timezone, 'es', paleta default, logoUrl: null) | ✅ |
| R4 | `R4 - actualiza solo companyName...` / `...timezone, language y themeColors combinados` / `...persiste solo el campo provisto...` | ✅ |
| R5 | `R5 - companyName vacío devuelve 400 sin persistir` | ✅ |
| R6 | `R6 - timezone con formato incorrecto devuelve 400 sin persistir` | ✅ |
| R7 | `R7 - language no soportado devuelve 400 sin persistir` | ✅ |
| R8 | `R8 - themeColors.primary/accent no hex devuelve 400...` + `R5/R6/R7/R8 - PATCH inválido no persiste OTROS campos válidos en el mismo body` | ✅ |
| R9 | `R9 - sin sesión devuelve 401` / `R9 - operador recibe 403` | ✅ |
| R10 | `R10 - tras PATCH companyName, getBranding devuelve el nuevo nombre` (integración directa con `reportService.getBranding`, sin modificar #12) | ✅ |
| R11 | `R11 - sube PNG válido <= 2MB, devuelve 200, crea archivo y persiste logoPath` | ✅ |
| R12 | `R12 - MIME no permitido (text/plain) devuelve 400, no crea archivo ni actualiza logoPath` | ✅ |
| R13 | `R13 - archivo > 2MB devuelve 400, no crea archivo ni actualiza logoPath` | ✅ |
| R14 | `R14 - request sin archivo devuelve 400` | ✅ |
| R15 | `R15 - segunda subida exitosa elimina el archivo de logo anterior` | ✅ |
| R16 | `R16 - sin sesión devuelve 401` / `R16 - operador recibe 403` | ✅ |
| R17 | `R17 - logo configurado y archivo presente devuelve 200 con Content-Type correcto` | ✅ |
| R18 | `R18 - sin logo configurado devuelve 404` / `R18 - logoPath apunta a archivo inexistente devuelve 404` | ✅ |
| R19 | `R19 - sin sesión devuelve 401` (endpoint usa `requireAuth`, verificado en código) | ✅ |
| R20 | `R20 - displayName y hidden crean/actualizan fila en extensions_config` | ✅ |
| R21 | `R21 - :ext vacío (espacio en blanco tras decodeURIComponent) devuelve 400` | ✅ |
| R22 | `R22 - displayName no string devuelve 400 sin persistir` | ✅ |
| R23 | `R23 - hidden no booleano devuelve 400 sin persistir` | ✅ |
| R24 | `R24 - body sin displayName ni hidden devuelve 400` | ✅ |
| R25 | `R25 - sin sesión devuelve 401` / `R25 - operador recibe 403` | ✅ |
| R26 | `R26 - limpiar displayName y hidden=false elimina la fila` | ✅ |
| R27 | `R27 - hidden=true crea fila en trunks_config` / `R27 - hidden=false elimina fila en trunks_config` | ✅ |
| R28 | `R28 - hidden ausente devuelve 400 sin persistir` / `R28 - hidden no booleano devuelve 400 sin persistir` | ✅ |
| R29 | `R29 - :trunk vacío (espacio en blanco tras decodeURIComponent) devuelve 400` | ✅ |
| R30 | `R30 - sin sesión devuelve 401` / `R30 - operador recibe 403` | ✅ |
| R31 | `R31 - hidden=false sobre troncal previamente oculta sin otros overrides elimina la fila` | ✅ |
| R32 | `frontend/src/components/SystemConfig.jsx` — pantalla "Configuración" admin-only, tabs General/Personalización/Apariencia (`TABS`, ruta `admin/config` en `App.jsx` bajo `AdminRoute`) | ✅ (código fuente verificado) |
| R33 | `GeneralTab` (companyName/timezone/language + "Guardar" → `PATCH /api/admin/config`) | ✅ (código fuente verificado) |
| R34 | `LogoUploader` + `ExtensionsTable` (rename/hidden, `PATCH /api/admin/extensions/:ext`) + `TrunksTable` (hidden, `PATCH /api/admin/trunks/:trunk`), cargadas vía `api.adminExtensions()`/`api.adminTrunks()` | ✅ (código fuente verificado) |
| R35 | `AppearanceTab` — color pickers primary/accent + "Guardar" → `PATCH /api/admin/config` con `themeColors` | ✅ (código fuente verificado) |
| R36 | `SuccessBanner`/`ErrorBanner` inline (sin `alert()`), usados en las tres tabs vía `onSaved`/`onError` | ✅ (código fuente verificado) |
| R37 | `LogoUploader.handleFileChange` valida `ALLOWED_LOGO_TYPES`/`MAX_LOGO_SIZE` antes de habilitar "Subir logo"; ningún `fetch` ocurre si la validación falla | ✅ (código fuente verificado) |
| R38 | `Layout.jsx` — `<NavItem to="/admin/config" icon={Settings} label="Configuración" />` dentro del bloque `{user?.role === 'admin' && (...)}` | ✅ (código fuente verificado) |
| R39 | `R39 - no-regresión de endpoints existentes`: `GET /api/config/public`, `PUT /api/admin/app`, `GET /api/admin/channels`, `PUT /api/admin/channels/:channel` (mirroring exacto del código real de `server.js`, verificado línea por línea) | ✅ |
| R40 | Sin SQL de escritura sobre `cdr`; `GET /admin/extensions`/`GET /admin/trunks` solo usan `statsService.queryRankings` (read-only, ya existente) | ✅ (código verificado) |
| R41 | Toda la configuración nueva persiste en SQLite (`system_config`, `extensions_config`, `trunks_config`); `config.json` no se escribe desde `configService`/`routes/config.js` | ✅ (código verificado) |
| R42 | `GET`/`PATCH /api/admin/config` solo acceden a SQLite local — sin `await pool.query` en estas dos rutas | ✅ (código verificado) |

## No-regresión v1.0: ✅

- `cd backend && npx jest --forceExit` → **180/180 passing** (6 suites), incluyendo `config.test.js` (50/50) y sin regresión en `users.test.js`, `inbound.test.js`, `outbound.test.js`, `stats.test.js`, `reports.test.js`.
- `cd frontend && npm run build` → sin errores (warning preexistente de chunk size por Recharts, no introducido por esta feature).
- `./init.sh` desde la raíz → **25/25 checks ✅**.
- Diff de `backend/server.js` confirmado: solo se añade `const configRouter = require('./routes/config');` y `app.use('/api', configRouter(pool, config, db, requireAuth, requireAdmin, getAppName));`, junto a las líneas ya existentes de `reportsRouter` (#12, sin tocar). Ninguna otra línea modificada.
- `/api/config/public`, `/api/admin/app`, `/api/admin/channels[/:channel]` siguen operando exactamente igual (verificado: implementación mirror en `config.test.js` coincide línea por línea con `server.js:480-512`).
- `/api/events` (SSE) y `/api/calls/*` no fueron tocados — `routes/config.js` monta únicamente rutas nuevas (`/admin/config*`, `/admin/extensions*`, `/admin/trunks*`) sin colisión.
- `backend/services/reportService.js::getBranding` (#12) **no fue modificado** (sin diff); `system_config` usa exactamente las claves `companyName`/`logoPath` que `getBranding` ya esperaba, confirmado por `R10`.

## Convenciones: ✅

- Patrón factory `(pool, config, db, requireAuth, requireAdmin, getAppName) => router` en `backend/routes/config.js`.
- Sin `SELECT *` (verificado en `routes/config.js` y `services/configService.js` — todas las consultas usan columnas explícitas y parámetros `?`, incluyendo `IN (?,?,...)` parametrizado).
- Sin concatenación de strings en SQL.
- Sin `console.log` de debug (solo `console.error` en bloques `catch`).
- Sin fetch directo en componentes React — todas las llamadas pasan por `frontend/src/api.js` (incluido `uploadLogo`, que usa `fetch` directo dentro de `api.js`, tal como exige el patrón de `reportDownload`).
- Sin TypeScript introducido.
- Sin escrituras a `asteriskcdrdb.cdr` — `GET /admin/extensions`/`GET /admin/trunks` solo usan `statsService.queryRankings` (lectura existente).

## Seguridad: ✅

- Todos los endpoints de escritura (`PATCH /admin/config`, `POST /admin/config/logo`, `PATCH /admin/extensions/:ext`, `PATCH /admin/trunks/:trunk`) usan `requireAdmin`.
- `GET /api/admin/config/logo` usa `requireAuth` (R19), correcto según diseño.
- `GET /admin/extensions` y `GET /admin/trunks` usan `requireAdmin` (pantallas admin-only).
- Validación de input ocurre antes de tocar SQLite: `companyName`/`timezone`/`language`/`themeColors` validados en `configService.updateGeneralConfig` (atómico: si algún campo falla, no se persiste nada); `displayName`/`hidden` validados en el router antes de `upsertExtensionOverride`/`upsertTrunkOverride`; MIME y tamaño del logo validados por `multer` (`fileFilter` + `limits.fileSize = 2MB`), con traducción a HTTP 400 `{ ok: false, error }`.
- `multer` configurado con `diskStorage` (destino `backend/uploads/`, nombre determinístico `logo-<timestamp>.<ext>`), `fileFilter` restringido a `image/png`/`image/jpeg`, y `limits.fileSize`.

## Verificaciones específicas de la feature: ✅

- Las 3 tablas nuevas (`system_config`, `extensions_config`, `trunks_config`) se crean con `CREATE TABLE IF NOT EXISTS` en `backend/db/setup.js`, sin tocar `users`/`audit_log` ni la lógica de migración existente (diff confirmado: solo 3 bloques `db.exec` añadidos).
- `backend/uploads/.gitkeep` existe (vacío); `.gitignore` no fue modificado (ya contenía `backend/uploads/*` + `!backend/uploads/.gitkeep`).
- `multer@^1.4.5-lts.1` está en `backend/package.json` → `dependencies` (instalado: `1.4.5-lts.2`, satisface el rango), y `package-lock.json` actualizado en consecuencia.
- `system_config` usa exactamente las claves `companyName`/`logoPath` esperadas por `reportService.getBranding` (#12, sin modificar) — confirmado por `R10` y por inspección de `reportService.js:113-139` (sin diff respecto a HEAD).

## Tests: ✅ (180/180 passing, incluye config.test.js 50/50)

## Tasks: T1-T11 todas marcadas `[x]` en `specs/system_config/tasks.md`.

---

**Decisión: APROBADO.**

**SIGUIENTE PASO OBLIGATORIO:**
```
git add -A && git commit -m "feat(system_config): Configuración del sistema (empresa, logo, idioma, tema, extensiones y troncales)"
```
Solo después del commit: marcar `done` en `feature_list.json` e iniciar la siguiente feature.
