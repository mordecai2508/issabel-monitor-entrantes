# Implementación — system_config

## Archivos creados/modificados

| Acción | Archivo |
|--------|---------|
| Modificado | `backend/package.json` (dependencia `multer@^1.4.5-lts.1`) |
| Creado | `backend/uploads/.gitkeep` |
| Modificado | `backend/db/setup.js` (tablas `system_config`, `extensions_config`, `trunks_config`) |
| Creado | `backend/services/configService.js` |
| Creado | `backend/routes/config.js` |
| Modificado | `backend/server.js` (require + mount de `configRouter`) |
| Creado | `backend/tests/config.test.js` |
| Modificado | `frontend/src/api.js` (métodos `adminConfig`, `updateAdminConfig`, `uploadLogo`, `adminExtensions`, `updateExtension`, `adminTrunks`, `updateTrunkVisibility`) |
| Creado | `frontend/src/components/SystemConfig.jsx` |
| Modificado | `frontend/src/App.jsx` (import + ruta `/admin/config`) |
| Modificado | `frontend/src/components/Layout.jsx` (NavItem "Configuración", icono `Settings`) |
| Modificado | `specs/system_config/tasks.md` (T1-T11 marcadas `[x]`) |

## Trazabilidad R<n> → test → archivo:línea

| Requisito | Test / Implementación | Archivo:línea |
|---|---|---|
| R1 | `R1/R3 - admin recibe 200 con valores por defecto cuando no hay filas en system_config` | tests/config.test.js:178; impl: routes/config.js:110 |
| R2 | `R2 - sin sesión devuelve 401` / `R2 - operador recibe 403` | tests/config.test.js:197, 203 |
| R3 | defaults (`getAppName()`, `config.db.timezone`, `'es'`, colores por defecto) | tests/config.test.js:178; impl: services/configService.js:52 |
| R4 | `R4 - actualiza solo companyName...` / `...timezone, language y themeColors combinados` / `...persiste solo el campo provisto...` | tests/config.test.js:213, 227, 241; impl: routes/config.js:120 |
| R5 | `R5 - companyName vacío devuelve 400 sin persistir` | tests/config.test.js:255; impl: services/configService.js:76 |
| R6 | `R6 - timezone con formato incorrecto devuelve 400 sin persistir` | tests/config.test.js:266; impl: services/configService.js:76 |
| R7 | `R7 - language no soportado devuelve 400 sin persistir` | tests/config.test.js:277; impl: services/configService.js:76 |
| R8 | `R8 - themeColors.primary no hex devuelve 400...` / `...accent no hex devuelve 400...` / `R5/R6/R7/R8 - PATCH inválido no persiste OTROS campos válidos en el mismo body` | tests/config.test.js:288, 301, 314; impl: services/configService.js:76 |
| R9 | `R9 - sin sesión devuelve 401` / `R9 - operador recibe 403` | tests/config.test.js:330, 336 |
| R10 | `R10 - tras PATCH companyName, getBranding devuelve el nuevo nombre` | tests/config.test.js:346 |
| R11 | `R11 - sube PNG válido <= 2MB, devuelve 200, crea archivo y persiste logoPath` | tests/config.test.js:364; impl: routes/config.js:140 |
| R12 | `R12 - MIME no permitido (text/plain) devuelve 400, no crea archivo ni actualiza logoPath` | tests/config.test.js:382 |
| R13 | `R13 - archivo > 2MB devuelve 400, no crea archivo ni actualiza logoPath` | tests/config.test.js:396 |
| R14 | `R14 - request sin archivo devuelve 400` | tests/config.test.js:412 |
| R15 | `R15 - segunda subida exitosa elimina el archivo de logo anterior` | tests/config.test.js:420; impl: routes/config.js:140-178 |
| R16 | `R16 - sin sesión devuelve 401` / `R16 - operador recibe 403` | tests/config.test.js:445, 453 |
| R17 | `R17 - logo configurado y archivo presente devuelve 200 con Content-Type correcto` | tests/config.test.js:470; impl: routes/config.js:179 |
| R18 | `R18 - sin logo configurado devuelve 404` / `R18 - logoPath apunta a archivo inexistente devuelve 404` | tests/config.test.js:485, 492 |
| R19 | `R19 - sin sesión devuelve 401` (endpoint usa `requireAuth`) | tests/config.test.js:501; impl: routes/config.js:179 |
| R20 | `R20 - displayName y hidden crean/actualizan fila en extensions_config` | tests/config.test.js:511; impl: routes/config.js:200 |
| R21 | `R21 - :ext vacío (espacio en blanco tras decodeURIComponent) devuelve 400` | tests/config.test.js:527; impl: routes/config.js:200 |
| R22 | `R22 - displayName no string devuelve 400 sin persistir` | tests/config.test.js:535 |
| R23 | `R23 - hidden no booleano devuelve 400 sin persistir` | tests/config.test.js:546 |
| R24 | `R24 - body sin displayName ni hidden devuelve 400` | tests/config.test.js:557 |
| R25 | `R25 - sin sesión devuelve 401` / `R25 - operador recibe 403` | tests/config.test.js:563, 569 |
| R26 | `R26 - limpiar displayName y hidden=false elimina la fila` | tests/config.test.js:575; impl: services/configService.js:170 |
| R27 | `R27 - hidden=true crea fila en trunks_config` / `R27 - hidden=false elimina fila en trunks_config` | tests/config.test.js:631, 646; impl: routes/config.js:254 |
| R28 | `R28 - hidden ausente devuelve 400 sin persistir` / `R28 - hidden no booleano devuelve 400 sin persistir` | tests/config.test.js:665, 678 |
| R29 | `R29 - :trunk vacío (espacio en blanco tras decodeURIComponent) devuelve 400` | tests/config.test.js:691; impl: routes/config.js:254 |
| R30 | `R30 - sin sesión devuelve 401` / `R30 - operador recibe 403` | tests/config.test.js:699, 707 |
| R31 | `R31 - hidden=false sobre troncal previamente oculta sin otros overrides elimina la fila` | tests/config.test.js:715; impl: services/configService.js:231 |
| R32 | Pantalla "Configuración" admin-only con tabs General/Personalización/Apariencia | frontend/src/components/SystemConfig.jsx:565 (TABS), :571 (componente principal); ruta admin-only en App.jsx:54 |
| R33 | Tab General: companyName/timezone/language + "Guardar" → `PATCH /api/admin/config` | frontend/src/components/SystemConfig.jsx:72 (GeneralTab) |
| R34 | Tab Personalización: subida/preview de logo, tabla de extensiones (rename/hidden) y tabla de troncales (hidden) | frontend/src/components/SystemConfig.jsx:145 (LogoUploader), :233 (ExtensionsTable), :361 (TrunksTable), :416 (PersonalizationTab) |
| R35 | Tab Apariencia: color pickers primary/accent + "Guardar" → `PATCH /api/admin/config` con `themeColors` | frontend/src/components/SystemConfig.jsx:490 (AppearanceTab) |
| R36 | `SuccessBanner`/`ErrorBanner` inline (sin `alert()`) en las tres tabs | frontend/src/components/SystemConfig.jsx:15 (SuccessBanner), :29 (ErrorBanner); usados en GeneralTab, PersonalizationTab, AppearanceTab |
| R37 | Validación cliente de tipo/tamaño de logo antes de enviar (PNG/JPG, ≤2MB) | frontend/src/components/SystemConfig.jsx:145 (LogoUploader, `MAX_LOGO_SIZE`/`ALLOWED_LOGO_TYPES`) |
| R38 | NavItem "Configuración" (icono `Settings`) visible solo para `role === 'admin'` | frontend/src/components/Layout.jsx:123 |
| R39 | `R39 - no-regresión de endpoints existentes`: `GET /api/config/public`, `PUT /api/admin/app`, `GET /api/admin/channels`, `PUT /api/admin/channels/:channel` siguen respondiendo igual | tests/config.test.js:772-773 y siguientes (suite completa) |
| R40 | Sin SQL de escritura sobre `cdr`; `GET /admin/extensions`/`GET /admin/trunks` solo usan `statsService.queryRankings` (read-only, ya existente) | impl: routes/config.js:228, 275; services/configService.js (sin queries a `cdr`) |
| R41 | Toda la configuración nueva se persiste en SQLite (`system_config`, `extensions_config`, `trunks_config`), no en `config.json` | impl: backend/db/setup.js (tablas nuevas), services/configService.js (todas las funciones operan sobre `db`) |
| R42 | `GET`/`PATCH /api/admin/config` solo acceden a SQLite local (sin queries a Issabel) | impl: routes/config.js:110, 120; services/configService.js:52, 76 — verificado indirectamente por tiempos de respuesta de la suite (sin mocks de `pool.query` en estos endpoints) |

## Resultado de verificación (T11)

- **Backend tests**: `cd backend && npx jest --forceExit` → **180/180 passing** (6 test suites), incluye:
  - `tests/config.test.js`: **50/50 passing**
  - `users.test.js`, `inbound.test.js`, `outbound.test.js`, `stats.test.js`, `reports.test.js`: sin regresión, todos verdes
- **Frontend build**: `cd frontend && npm run build` → **sin errores** (warning de chunk size >500kB pre-existente, causado por Recharts, no introducido por esta feature)
- **`./init.sh`** (desde la raíz del repo): **25/25 checks ✅**, incluyendo "Feature in_progress: system_config", "tests backend: verde", "build frontend: sin errores"
- **No-regresión confirmada**: `/api/config/public`, `/api/admin/app`, `/api/admin/channels[/:channel]` responden con su contrato original (suite R39); `/api/events` (SSE) y el resto de rutas montadas no fueron tocadas.

## Notas de implementación

- **T1**: `multer@^1.4.5-lts.1` instalado y registrado en `backend/package.json` → `dependencies` (versión exacta indicada por `design.md §3`; genera warning de deprecación 1.x→2.x, no bloqueante).
- **T3**: las 3 tablas nuevas (`system_config`, `extensions_config`, `trunks_config`) se añaden con `CREATE TABLE IF NOT EXISTS` dentro de `initDb(config)`, sin tocar `users`/`audit_log` ni la lógica de migración existente. Verificado contra `backend/db/monitor.sqlite` real: las 6 tablas (`audit_log`, `extensions_config`, `sqlite_sequence`, `system_config`, `trunks_config`, `users`) coexisten sin conflicto.
- **R10**: confirmado que `reportService.getBranding(db, fallbackAppName)` (feature #12, no modificado) lee `system_config.companyName`/`logoPath` correctamente tras un `PATCH /api/admin/config`, y degrada a `{ companyName: fallbackAppName, logoPath: null }` cuando la tabla está vacía — no se requirió ningún cambio en `reportService.js`.
- **R21/R29 (validación de parámetro de ruta vacío)**: Express no enruta peticiones con segmento de path vacío (`/admin/extensions/`) — devuelve 404 antes de ejecutar el handler. Solución: la validación en `routes/config.js` usa `if (!ext.trim())` / `if (!trunk.trim())`, y los tests usan `%20` (espacio URL-encoded, segmento no vacío para Express pero `decodeURIComponent` + `.trim()` lo reduce a cadena vacía) para ejercitar la rama 400.
- **`GET /admin/extensions`/`GET /admin/trunks`**: el factory `configRouter` no recibe `dbOk` (a diferencia de `reportsRouter`). Se envuelve `statsService.queryRankings` en try/catch; ante cualquier error de `pool.query` se devuelve `{ ok: true, data: [], dbUnavailable: true }` (con `console.error` del error original).
- Sin `SELECT *` ni concatenación de strings en SQL — todas las queries usan parámetros `?` (incluyendo `IN (?,?,...)` parametrizado en `getExtensionOverrides`/`getTrunkOverrides`).
- Sin escritura sobre `asteriskcdrdb.cdr` en ningún punto de la feature.
- Sin `console.log` de depuración; solo `console.error` en catch blocks (subida de logo, fallo de borrado de logo anterior, fallo de `queryRankings`).
