# design.md — system_config

> Feature ID: 13 | Revisión: 2026-06-10

---

## 1. Endpoints nuevos

Todos los endpoints se montan bajo `/api` mediante `app.use('/api', require('./routes/config')(pool, config, db, requireAuth, requireAdmin, getAppName))`, siguiendo el patrón factory existente. Ninguno de estos endpoints reutiliza las rutas `/api/admin/app` o `/api/admin/channels*` (feature #6), que permanecen intactas (ver §7).

| Método | Ruta | Auth | Payload entrada | Payload salida | HTTP |
|---|---|---|---|---|---|
| GET | `/api/admin/config` | `requireAdmin` | — | `{ ok: true, data: { companyName, timezone, language, themeColors: { primary, accent }, logoUrl } }` | 200 / 401 / 403 |
| PATCH | `/api/admin/config` | `requireAdmin` | `{ companyName?, timezone?, language?, themeColors? }` (al menos uno) | `{ ok: true, data: { companyName, timezone, language, themeColors, logoUrl } }` | 200 / 400 / 401 / 403 |
| POST | `/api/admin/config/logo` | `requireAdmin` | `multipart/form-data`, campo de archivo `logo` (PNG/JPG ≤ 2 MB) | `{ ok: true, data: { logoUrl } }` | 200 / 400 / 401 / 403 |
| GET | `/api/admin/config/logo` | `requireAuth` | — | Stream binario de la imagen (`Content-Type: image/png` o `image/jpeg`) | 200 / 401 / 404 |
| PATCH | `/api/admin/extensions/:ext` | `requireAdmin` | `{ displayName?, hidden? }` (al menos uno) | `{ ok: true, data: { extension, displayName, hidden } }` | 200 / 400 / 401 / 403 |
| GET | `/api/admin/extensions` | `requireAdmin` | — | `{ ok: true, data: [ { extension, displayName, hidden, total } ] }` (combina ranking CDR `statsService.queryRankings(..., 'extension', ...)` de los últimos 30 días con overrides de `extensions_config`) | 200 / 401 / 403 |
| PATCH | `/api/admin/trunks/:trunk` | `requireAdmin` | `{ hidden }` (requerido) | `{ ok: true, data: { trunk, hidden } }` | 200 / 400 / 401 / 403 |
| GET | `/api/admin/trunks` | `requireAdmin` | — | `{ ok: true, data: [ { trunk, hidden, total } ] }` (combina ranking CDR `statsService.queryRankings(..., 'trunk', ...)` de los últimos 30 días con overrides de `trunks_config`) | 200 / 401 / 403 |

Notas:
- `:ext` y `:trunk` se reciben URL-encoded y se decodifican con `decodeURIComponent`, igual que `PUT /api/admin/channels/:channel`.
- `logoUrl` es la ruta pública relativa servida por el propio backend, p. ej. `/api/admin/config/logo` (no se expone la ruta absoluta del filesystem al frontend).
- `GET /api/admin/extensions` y `GET /api/admin/trunks` son endpoints auxiliares de soporte para la pantalla de "Personalización" (R34): permiten al frontend listar qué extensiones/troncales existen (según actividad CDR reciente) sin tener que consultar `/api/stats/rankings` directamente desde el componente de configuración. Se documentan aquí porque son necesarios para R34, aunque no aparecen explícitamente en los `acceptance` de `feature_list.json`; son de solo lectura y no introducen escritura nueva en CDR.

---

## 2. Cambios BD SQLite

Todas las tablas se crean con `CREATE TABLE IF NOT EXISTS` en `backend/db/setup.js`, siguiendo el patrón existente (`users`, `audit_log`).

### 2.1 `system_config` (key-value, ya anticipada por `reportService.getBranding`)

```sql
CREATE TABLE IF NOT EXISTS system_config (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

Claves utilizadas por esta feature:

| key | value (texto) | Notas |
|---|---|---|
| `companyName` | nombre de empresa | Leído por `reportService.getBranding` (feature #12, ya implementado) |
| `logoPath` | ruta absoluta del archivo en `backend/uploads/` | Leído por `reportService.getBranding`; debe ser una ruta de filesystem válida para que `fs.existsSync` funcione tal como espera `reportService.js` |
| `timezone` | offset UTC, p. ej. `-05:00` | Nuevo, solo usado por esta feature (ver §6 — no reemplaza `config.json.db.timezone`) |
| `language` | `es` \| `en` | Nuevo |
| `themeColorPrimary` | color hex, p. ej. `#3b82f6` | Nuevo |
| `themeColorAccent` | color hex, p. ej. `#1e3a5f` | Nuevo |

Esta tabla **ya es esperada** por `backend/services/reportService.js::getBranding(db, fallbackAppName)` (verificada vía `sqlite_master` antes de consultar). Con esta DDL, en cuanto existan filas `companyName`/`logoPath`, los reportes (#12) las recogerán automáticamente sin ningún cambio adicional en `reports_module`.

Acceso recomendado vía un pequeño helper en `backend/services/configService.js`:

```js
function getConfigValue(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setConfigValue(db, key, value) {
  db.prepare(
    `INSERT INTO system_config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}
```

### 2.2 `extensions_config` (overrides de extensión)

```sql
CREATE TABLE IF NOT EXISTS extensions_config (
  extension    TEXT PRIMARY KEY,
  display_name TEXT,
  hidden       INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))
);
```

- `extension` corresponde al valor `src` de `cdr`, igual que `name` en `statsService.queryRankings(pool, from, to, 'extension', limit)`.
- Una fila solo existe si hay un override (`display_name` no nulo y/o `hidden = 1`). Si el administrador limpia `displayName` y pone `hidden = false`, la fila se elimina (R26).

### 2.3 `trunks_config` (overrides de visibilidad de troncal)

```sql
CREATE TABLE IF NOT EXISTS trunks_config (
  trunk  TEXT PRIMARY KEY,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))
);
```

- `trunk` corresponde al valor `name` devuelto por `statsService.queryRankings(pool, from, to, 'trunk', limit)` (canal normalizado, p. ej. `SIP/troncal-pstn`), **no** necesariamente igual a las entradas de `config.channels`/`channelAliases` (feature #6), que pueden usar otra normalización (`extractChannel`). Ver §6 para la convivencia entre ambos conceptos.
- Una fila solo existe si `hidden = 1` (R31). No se almacena `display_name` aquí: el renombrado de troncales sigue siendo responsabilidad de `channelAliases` / `PUT /api/admin/channels/:channel` (feature #6, sin cambios).

### 2.4 Índices

No se requieren índices adicionales: las tres tablas son pequeñas tablas de configuración con `PRIMARY KEY` ya indexada y se consultan por clave exacta.

---

## 3. Dependencias npm nuevas

| Paquete | Versión aprox. | Justificación |
|---|---|---|
| `multer` | `^1.4.5-lts.1` | Necesario para procesar `multipart/form-data` en `POST /api/admin/config/logo` (R11–R14). Es el middleware estándar de facto para subida de archivos en Express y no introduce dependencias de compilación nativa adicionales (a diferencia de `sharp`, que NO se usa aquí — no se requiere redimensionar el logo, solo validarlo y almacenarlo tal cual). |

No se requieren otras dependencias: la validación de tamaño/MIME se hace con las opciones nativas de `multer` (`limits.fileSize`, `fileFilter`) y `fs` para servir/eliminar archivos.

---

## 4. Lógica no obvia

### 4.1 Validación y almacenamiento del logo

- `multer.diskStorage` configurado con `destination: backend/uploads/` y `filename` generado de forma determinística, p. ej. `logo-<timestamp>.<ext>` (evita colisiones y cachés de navegador obsoletas).
- `fileFilter`: rechaza (con `cb(new Error(...), false)`) cualquier archivo cuyo `mimetype` no sea `image/png` ni `image/jpeg` (R12). Multer invoca el callback de error de Express; el router debe capturarlo y responder HTTP 400 con el formato estándar `{ ok: false, error: '...' }` (no dejar que Express devuelva el error HTML por defecto).
- `limits: { fileSize: 2 * 1024 * 1024 }` (2 MB) — si se excede, `multer` emite el error `LIMIT_FILE_SIZE`, que el router traduce a HTTP 400 (R13).
- Tras un upload exitoso:
  1. Leer el `logoPath` previo desde `system_config` (si existe).
  2. Guardar el nuevo archivo (ya hecho por `multer` antes del handler).
  3. `setConfigValue(db, 'logoPath', <ruta absoluta del nuevo archivo>)`.
  4. Si existía un `logoPath` previo y apunta a un archivo distinto del nuevo, `fs.unlink` del archivo anterior (best-effort, con `try/catch` y `console.error` si falla) — R15.
- `GET /api/admin/config/logo`: lee `logoPath` de `system_config`; si es `null` o `!fs.existsSync(logoPath)` → HTTP 404 (R18). Si existe, determina `Content-Type` por extensión (`.png` → `image/png`, `.jpg`/`.jpeg` → `image/jpeg`) y hace `fs.createReadStream(logoPath).pipe(res)`.
- `GET /api/admin/config` devuelve `logoUrl: '/api/admin/config/logo'` si `logoPath` está configurado y el archivo existe; `null` en caso contrario. El frontend usa esta URL directamente como `src` de `<img>` (con `credentials: 'include'` ya cubierto por la sesión de cookie).

### 4.2 Defaults y fallback de `companyName`/`timezone`/`language`

- `GET /api/admin/config`:
  - `companyName`: `getConfigValue(db, 'companyName')` → si no existe, fallback a `getAppName()` (la misma función ya existente en `server.js`, recibida como dependencia del router) — R3.
  - `timezone`: `getConfigValue(db, 'timezone')` → si no existe, fallback a `config.db.timezone` (de `config.json`, solo lectura) — R3.
  - `language`: `getConfigValue(db, 'language', 'es')` — R3.
  - `themeColors`: `{ primary: getConfigValue(db, 'themeColorPrimary', '#3b82f6'), accent: getConfigValue(db, 'themeColorAccent', '#1e3a5f') }` (paleta default = colores Tailwind ya usados en el frontend, p. ej. `blue-600`/`#1e3a5f` usado en `exportService`/sidebar).
- `PATCH /api/admin/config`: valida cada campo presente (R5–R8) **antes** de persistir nada (si cualquier campo es inválido, no se escribe ningún campo — operación atómica a nivel de validación). Tras validar, escribe cada campo provisto vía `setConfigValue`. La escritura de `companyName` hace que `reportService.getBranding` (#12) lo recoja en la siguiente llamada sin cambios adicionales (R10).
- Validación de `timezone` (R6): regex `^[+-]\d{2}:\d{2}$`.
- Validación de `themeColors` (R8): regex `^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$` aplicado a `primary` y `accent` por separado.

### 4.3 Overrides de extensión y troncal

- `PATCH /api/admin/extensions/:ext`:
  - Si la fila no existe y se provee algún campo, `INSERT`; si existe, `UPDATE` solo de los campos provistos (`COALESCE` o lectura previa + reescritura).
  - Tras aplicar los cambios, si el resultado es `display_name IS NULL/'' AND hidden = 0`, `DELETE FROM extensions_config WHERE extension = ?` (R26).
- `PATCH /api/admin/trunks/:trunk`:
  - Si `hidden = true`, `INSERT OR REPLACE INTO trunks_config (trunk, hidden) VALUES (?, 1)`.
  - Si `hidden = false`, `DELETE FROM trunks_config WHERE trunk = ?` (R31) — no se inserta una fila con `hidden = 0`.
- `GET /api/admin/extensions` / `GET /api/admin/trunks` (soporte de UI, R34): combinan `statsService.queryRankings(pool, from, to, 'extension'|'trunk', 50)` (rango = últimos 30 días, calculado igual que en `routes/stats.js`) con un `LEFT JOIN` en memoria contra `extensions_config`/`trunks_config` (consulta por `IN (...)` con los nombres devueltos por el ranking, usando parámetros `?` repetidos — nunca interpolación de strings). Si la consulta a Issabel falla (`!dbOk`), estos dos endpoints devuelven `{ ok: true, data: [] }` con un campo adicional `dbUnavailable: true` para que el frontend pueda seguir mostrando overrides ya guardados aunque no haya ranking fresco — esto es una decisión de UX, no bloqueante para los criterios de aceptación.

### 4.4 `extractChannel`/`passesFilter` y `trunks_config` — alcance

`hidden` en `trunks_config` **no** modifica las queries existentes `queryStats`/`queryChannels`/`queryHourly`/`queryQueues` ni `/api/calls/*` — esas siguen gobernadas por `config.channels`/`allowedChannels` (sin cambios, fuera del alcance de esta feature). `trunks_config.hidden` es metadato de presentación consumido únicamente por:
- `GET /api/admin/trunks` (para reflejar el estado actual en la UI de configuración), y
- (uso futuro opcional, no requerido por esta feature) cualquier vista que liste rankings de troncales y desee excluir las marcadas como ocultas en el frontend.

Esto evita tocar `fetchData`/`/api/events`/`/api/calls/*` y mantiene el alcance de la feature acotado a configuración y a las dos nuevas pantallas de soporte (R39, R40).

---

## 5. Componentes frontend

### 5.1 `frontend/src/components/SystemConfig.jsx`

Pantalla principal, accesible solo a `admin` (ruta `/admin/config`, ver §5.3). Estructura:

- Cabecera con título "Configuración" y selector de tabs (`General` | `Personalización` | `Apariencia`), estado local `activeTab`.
- Carga inicial: `api.adminConfig()` → `GET /api/admin/config` (una sola vez al montar; cada tab reutiliza el mismo estado `config`).
- Banner de error/éxito inline compartido (no `alert()`), reutilizando el patrón de `ChannelAliasManager.jsx`/`UserManagement.jsx`.

#### Tab "General"
- Formulario con campos: `companyName` (text input), `timezone` (text input con placeholder `-05:00` y validación de formato en cliente), `language` (select `es`/`en`).
- Botón "Guardar" → `api.updateAdminConfig({ companyName, timezone, language })` (`PATCH /api/admin/config`). Muestra spinner mientras está pendiente y confirmación al éxito (R33, R36).

#### Tab "Personalización"
- **Logo**: muestra el logo actual (`<img src="/api/admin/config/logo" />`, con manejo de error 404 → placeholder "Sin logo"), input `<input type="file" accept="image/png,image/jpeg">`, validación cliente de tipo/tamaño antes de enviar (R37), botón "Subir logo" → `api.uploadLogo(file)` (`POST /api/admin/config/logo`, `FormData`).
- **Extensiones**: tabla cargada vía `api.adminExtensions()` (`GET /api/admin/extensions`), columnas: extensión, nombre a mostrar (editable inline, mismo patrón que `ChannelAliasManager`), visible/oculta (toggle), guardado vía `api.updateExtension(ext, { displayName, hidden })` (`PATCH /api/admin/extensions/:ext`).
- **Troncales**: tabla cargada vía `api.adminTrunks()` (`GET /api/admin/trunks`), columnas: troncal, visible/oculta (toggle), guardado vía `api.updateTrunkVisibility(trunk, hidden)` (`PATCH /api/admin/trunks/:trunk`). El renombrado de troncales sigue ocurriendo en `/channels` (`ChannelAliasManager.jsx`, sin cambios) — esta tabla solo añade la columna de visibilidad.

#### Tab "Apariencia"
- Dos `<input type="color">` (o equivalente) para `themeColors.primary` y `themeColors.accent`, con vista previa de muestra (swatches).
- Botón "Guardar" → `api.updateAdminConfig({ themeColors: { primary, accent } })`.
- Nota de alcance: esta feature persiste y expone los colores vía API; la **aplicación visual global del tema** (inyección de variables CSS/Tailwind en runtime) queda fuera del alcance estricto de los criterios de aceptación de #13 (que piden persistencia y UI, no un re-theming completo del dashboard) y puede abordarse en una iteración futura sin requerir cambios de API adicionales.

### 5.2 `frontend/src/api.js` — nuevas funciones

```js
adminConfig:        ()                 => req('GET',   '/api/admin/config'),
updateAdminConfig:  (data)             => req('PATCH', '/api/admin/config', data),
uploadLogo:         (file) => {
  const formData = new FormData();
  formData.append('logo', file);
  return fetch('/api/admin/config/logo', { method: 'POST', credentials: 'include', body: formData })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    });
},
adminExtensions:    ()                 => req('GET',   '/api/admin/extensions'),
updateExtension:    (ext, data)        => req('PATCH', `/api/admin/extensions/${encodeURIComponent(ext)}`, data),
adminTrunks:        ()                 => req('GET',   '/api/admin/trunks'),
updateTrunkVisibility: (trunk, hidden) => req('PATCH', `/api/admin/trunks/${encodeURIComponent(trunk)}`, { hidden }),
```

`uploadLogo` no puede usar el helper genérico `req()` porque este fija `Content-Type: application/json`; se implementa con `fetch` directo dentro de `api.js` (sigue cumpliendo "todas las llamadas HTTP pasan por `src/api.js`").

### 5.3 Navegación

- `frontend/src/App.jsx`: añadir `import SystemConfig from './components/SystemConfig'` y la ruta `<Route path="admin/config" element={<AdminRoute><SystemConfig /></AdminRoute>} />`, junto a las demás rutas admin-only.
- `frontend/src/components/Layout.jsx`: añadir, en el bloque `{user?.role === 'admin' && (...)}`, un `<NavItem to="/admin/config" icon={Settings} label="Configuración" />` (ícono `Settings` de `lucide-react`, ya disponible en la librería usada).

---

## 6. Decisión técnica clave

**Qué se migra de `config.json` a SQLite y qué no:**

- **NO se migra** `config.app.name` (gestionado por `PUT /api/admin/app`) ni `config.channelAliases`/`config.channels` (gestionados por `GET/PUT /api/admin/channels[/:channel]`, feature #6, ya `done`). Ambos permanecen en `config.json` exactamente como están en v1.0.
- **system_config (#13) es una capa adicional, no un reemplazo.** Introduce:
  - Una nueva fuente de verdad en SQLite (`system_config`, `extensions_config`, `trunks_config`) para conceptos que **no existían** en v1.0: nombre de empresa "de marca" para reportes (`companyName`/`logoPath`, ya anticipados por `reportService.getBranding` de #12), zona horaria/idioma/colores de tema (nuevos), y overrides de "extensión" (concepto CDR `src`, distinto de "canal/troncal") y de visibilidad de troncal.
  - `GET /api/admin/config` consolida: si `system_config.companyName` no está definido, hace fallback a `getAppName()` (que sigue leyendo `config.app.name`). Esto da una experiencia de "un solo nombre de empresa" desde la perspectiva del usuario, aunque las dos fuentes (config.json vía `/api/admin/app` y SQLite vía `/api/admin/config`) coexistan a nivel de almacenamiento. Documentado explícitamente: si el admin actualiza `companyName` solo desde la pantalla de Configuración (PATCH `/api/admin/config`), el `appName` mostrado en el sidebar (`Layout.jsx`, vía `GET /api/config/public` / `PUT /api/admin/app`) **no cambia automáticamente** — son campos independientes con un fallback unidireccional. Esto es aceptable porque `/api/config/public` y `/api/admin/app` (#6) ya están `done` y no deben modificarse (R39); una unificación completa de "nombre de empresa" queda fuera de alcance de #13 y podría proponerse como mejora futura de #6.
  - `PUT /api/admin/channels/:channel` (alias de troncal) y `PATCH /api/admin/trunks/:trunk` (visibilidad de troncal) son **complementarios**: el primero controla el nombre mostrado (sigue en `config.json`), el segundo controla si se muestra u oculta (nuevo, en SQLite). La pantalla `/channels` (`ChannelAliasManager.jsx`) **no se reemplaza**; la nueva pestaña "Personalización" de `/admin/config` añade la gestión de visibilidad de troncales y la gestión (nueva) de extensiones, sin duplicar la edición de alias de troncal.

**Alternativa descartada:** migrar `channelAliases`/`config.channels` a `trunks_config` y hacer que `/admin/channels*` lean de SQLite. Se descarta porque (a) viola la regla "no reimplementar #6, ya `done`", (b) introduciría riesgo de romper `/api/admin/channels[/:channel]` y la UI `ChannelAliasManager.jsx` sin necesidad, y (c) el criterio de aceptación de #13 pide específicamente *nuevos* endpoints (`/api/admin/config*`, `/api/admin/extensions/:ext`, `/api/admin/trunks/:trunk`), no la modificación de los existentes.

---

## 7. Compatibilidad v1.0

- `GET /api/config/public` — sin cambios; sigue leyendo `config.app?.name` vía `getAppName()`.
- `PUT /api/admin/app` — sin cambios; sigue escribiendo `config.app.name` en `config.json`.
- `GET /api/admin/channels` y `PUT /api/admin/channels/:channel` — sin cambios; siguen operando sobre `config.channels`/`config.channelAliases` en `config.json`.
- `GET /api/events`, `/api/calls/today`, `/api/calls/range` — sin cambios; `fetchData`, `queryStats`, `queryChannels`, `queryHourly`, `queryQueues`, `extractChannel`, `passesFilter` no se modifican. `trunks_config.hidden` no se lee desde estas rutas (§4.4).
- `backend/services/reportService.js::getBranding` — sin cambios de código; empieza a devolver `companyName`/`logoPath` reales en cuanto existan filas en `system_config`, gracias a la DDL de §2.1 (esto es exactamente el comportamiento que `reports_module` (#12) ya documenta como dependencia opcional/futura).
- `backend/db/setup.js` — solo se añaden tres bloques `CREATE TABLE IF NOT EXISTS` nuevos (`system_config`, `extensions_config`, `trunks_config`); no se modifica la tabla `users` ni `audit_log` ni la lógica de migración existente.
- `backend/uploads/` — directorio nuevo, ya anticipado por `.gitignore` (`backend/uploads/*` + `!backend/uploads/.gitkeep`); esta feature crea el directorio real y su `.gitkeep`.
- Ningún endpoint nuevo de esta feature usa rutas ya ocupadas por `/api/admin/app`, `/api/admin/channels*`, `/api/admin/users*`, `/api/stats/*`, `/api/reports/*`, `/api/calls/*` — no hay colisiones de rutas.
