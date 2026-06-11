# design.md — alerts_monitoring

> Feature ID: 15 | Revisión: 2026-06-10

---

## 1. Endpoints nuevos

Todos los endpoints se montan bajo `/api` mediante:

```js
app.use('/api', require('./routes/alerts')(pool, config, db, requireAuth, requireAdmin, alertService));
```

`alertService` es el servicio creado en §6.1, que a su vez recibe `pbxHealthService`
y `broadcast` como dependencias (mismo patrón que `pbxHealthService` recibe `broadcast`
en `pbx_health`). El router `routes/alerts.js` no necesita acceso directo a
`pbxHealthService` ni a `broadcast` — solo llama a funciones expuestas por
`alertService`.

### 1.1 Gestión de reglas (admin)

| Método | Ruta | Auth | Payload entrada | Payload salida | HTTP |
|---|---|---|---|---|---|
| GET | `/api/admin/alerts/rules` | `requireAdmin` | — | `{ ok: true, data: [ { id, type, threshold, enabled, notify_email } ] }` | 200 / 401 / 403 |
| POST | `/api/admin/alerts/rules` | `requireAdmin` | `{ type, threshold?, enabled?, notify_email? }` | `{ ok: true, data: { id, type, threshold, enabled, notify_email } }` | 201 / 400 / 401 / 403 |
| PATCH | `/api/admin/alerts/rules/:id` | `requireAdmin` | `{ threshold?, enabled?, notify_email? }` (al menos uno) | `{ ok: true, data: { id, type, threshold, enabled, notify_email } }` | 200 / 400 / 401 / 403 / 404 |
| DELETE | `/api/admin/alerts/rules/:id` | `requireAdmin` | — | `{ ok: true, data: { id } }` | 200 / 401 / 403 / 404 |

Notas:
- `type` es inmutable tras la creación (no se acepta en `PATCH`); para cambiar
  el tipo de una regla, se borra y se crea una nueva. Esto evita ambigüedad
  sobre qué significa `threshold` al cambiar de tipo a mitad de vida de la
  regla.
- `threshold` es **requerido y numérico ≥ 0** para `type` ∈
  {`lost_spike`, `trunk_down`} (R5). Para `type` ∈ {`pbx_disconnect`,
  `ext_unreachable`} es opcional/ignorado (no afecta la evaluación, ver §6.3
  y §6.6).
- `enabled` por defecto `true` si no se provee en `POST` (R3).
- `notify_email`: `null`/cadena vacía = sin notificación (R28); si se provee
  no vacío, debe matchear una validación simple de formato de e-mail
  (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, R6).

### 1.2 Alertas activas (cualquier usuario autenticado)

| Método | Ruta | Auth | Payload entrada | Payload salida | HTTP |
|---|---|---|---|---|---|
| GET | `/api/alerts/active` | `requireAuth` | — | `{ ok: true, data: [ { id, rule_id, type, description, created_at, resolved } ] }` | 200 / 401 |
| PATCH | `/api/alerts/:id/resolve` | `requireAuth` | — (body vacío, ignorado) | `{ ok: true, data: { id, rule_id, type, description, created_at, resolved, resolved_at } }` | 200 / 401 / 404 / 409 |

Notas:
- `GET /api/alerts/active` no requiere `requireAdmin`: ver alertas activas es
  información de monitoreo (consistente con `/api/pbx/health`, también
  `requireAuth`), igual criterio que `pbx_health` (§"Endpoints nuevos" de su
  design.md).
- `PATCH /api/alerts/:id/resolve` también es `requireAuth` (no admin-only):
  cualquier usuario que vea el panel de "Alertas Activas" puede resolverlas
  — consistente con que el panel (R34) es visible para todos los roles
  autenticados. Si en el futuro se requiere restringir la resolución a admin,
  es un cambio de un solo middleware sin impacto en el resto del diseño.
- HTTP 409 en `PATCH /api/alerts/:id/resolve` cuando `resolved` ya es `true`
  (R33) — cuerpo `{ ok: false, error: 'La alerta ya fue resuelta' }`.

---

## 2. Cambios BD SQLite

Ambas tablas se crean con `CREATE TABLE IF NOT EXISTS` en `backend/db/setup.js`,
siguiendo el patrón existente (`users`, `audit_log`, `system_config`,
`extensions_config`, `trunks_config`). Se basan en el DDL ya anticipado en
`docs/architecture.md`, con ajustes menores (`CHECK` constraints, índices,
`resolved_at`).

### 2.1 `alert_rules`

```sql
CREATE TABLE IF NOT EXISTS alert_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT    NOT NULL CHECK (type IN ('trunk_down', 'ext_unreachable', 'lost_spike', 'pbx_disconnect')),
  threshold    REAL,
  enabled      INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  notify_email TEXT
);
```

- `threshold` es `REAL` y nullable a nivel de columna (permite `NULL` para
  `pbx_disconnect`/`ext_unreachable`); la validación de "requerido para
  `lost_spike`/`trunk_down`" (R5) ocurre en `alertService`/router, no en la
  BD, siguiendo el mismo patrón que `configService.updateGeneralConfig`
  (validación en JS antes de persistir).
- `notify_email` es `TEXT` nullable; `''`/`NULL` ambos significan "sin
  notificación" (normalizado a `NULL` al persistir).

### 2.2 `alerts`

```sql
CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id     INTEGER REFERENCES alert_rules(id),
  type        TEXT    NOT NULL,
  description TEXT,
  resolved    INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
```

- `rule_id` no tiene `ON DELETE CASCADE`: al borrar una regla (R9), las
  alertas históricas generadas por ella permanecen (con `rule_id` apuntando a
  un id que ya no existe en `alert_rules` — SQLite no impone FK por defecto
  sin `PRAGMA foreign_keys = ON`, que este proyecto no activa, así que esto no
  requiere manejo especial).
- `type` se desnormaliza (copiado de `alert_rules.type` en el momento de
  creación) para que `GET /api/alerts/active` no necesite `JOIN` y para que el
  histórico conserve el tipo aunque la regla se borre después.

### 2.3 Índices

```sql
CREATE INDEX IF NOT EXISTS idx_alerts_resolved
ON alerts (resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_rule_unresolved
ON alerts (rule_id, resolved);
```

- `idx_alerts_resolved`: acelera `GET /api/alerts/active`
  (`WHERE resolved = 0 ORDER BY created_at DESC`).
- `idx_alerts_rule_unresolved`: acelera la comprobación de "ya existe una
  alerta no resuelta para este `rule_id`" (R15) en cada ciclo de evaluación.

### 2.4 Migración

No hay migración de datos existentes (tablas nuevas, vacías al crearse). No
se modifican `users`, `audit_log`, `system_config`, `extensions_config`,
`trunks_config`.

---

## 3. Queries CDR nuevas

### 3.1 `lost_spike` — conteo de llamadas perdidas en ventana reciente

Nueva función en `backend/services/cdrService.js` (o, si no existe aún ese
archivo con ese nombre exacto, en `backend/services/alertService.js` como
helper privado — ver §6.1 sobre ubicación):

```sql
SELECT COUNT(*) AS lost_count
FROM cdr
WHERE calldate >= ?
  AND calldate <= ?
  AND (
    disposition = 'NO ANSWER'
    OR dst IN (?)  -- placeholders repetidos según config.lostDestinations
  )
```

- Parámetros: `[windowStart, windowEnd, ...lostDestinations]` — todos vía `?`
  (ninguna concatenación de strings), consistente con `docs/conventions.md`.
- `windowStart`/`windowEnd` se calculan en JS con `toMySQLDate`/lógica
  equivalente a la ya existente en `server.js` (reutilizar `toMySQLDate`,
  pasada como dependencia o reimplementada de forma idéntica en
  `cdrService.js` — ver §6.5 para evitar duplicación).
- Reutiliza el mismo criterio de "perdida" que `queryStats` desde
  `dashboard_lost_destinations` (NO ANSWER **o** `dst` en
  `lostDestinations`), para que el número mostrado en una alerta `lost_spike`
  sea coherente con el KPI "Perdidas" del dashboard.

### 3.2 `trunk_down` — última actividad de un canal/troncal

```sql
SELECT MAX(calldate) AS last_activity
FROM cdr
WHERE channel LIKE ? OR dstchannel LIKE ?
```

- Parámetros: `[<canal>%, <canal>%]` — el valor de `<canal>` es el prefijo de
  canal normalizado (mismo formato que produce `extractChannel`, p. ej.
  `SIP/troncal-pstn`). Se usa `LIKE 'SIP/troncal-pstn%'` porque `channel`/
  `dstchannel` en `cdr` incluyen el sufijo hex/numérico por llamada
  (`SIP/troncal-pstn-00a1b2c3`) que `extractChannel` normalmente recorta —
  aquí se compara contra el valor crudo de `cdr`, así que se usa `LIKE` con
  el prefijo en vez de igualdad exacta.
- Si `last_activity` es `NULL` o `last_activity < (ahora - threshold
  minutos)`, la regla dispara una alerta (R21).
- **Configuración del canal a vigilar**: el valor de `<canal>` para una regla
  `trunk_down` se almacena en `alert_rules.notify_email`... **no** — se
  descarta esa idea (mezclaría dos conceptos). Dado que `docs/architecture.md`
  define `alert_rules` con únicamente `id, type, threshold, enabled,
  notify_email` y la feature_list no pide una columna adicional, esta spec
  **no añade una columna `target`/`channel`** a `alert_rules`. En su lugar,
  para esta iteración, las reglas `trunk_down` se evalúan contra **todos los
  canales/troncales configurados en `config.channels`** (lista ya existente,
  reutilizada de `allowedChannels` en `server.js`): si `config.channels` está
  vacío, la regla `trunk_down` no genera alertas (no hay "todas las
  troncales" sin lista explícita) y esto se documenta como limitación
  adicional (ver §6.6). Esta decisión evita ampliar el esquema de
  `alert_rules` más allá de lo especificado en `feature_list.json`/
  `docs/architecture.md`, a costa de que `trunk_down` sea "por troncal
  configurada", no "por troncal seleccionable en la UI de la regla". Si en el
  futuro se requiere una regla por troncal individual, se podría añadir una
  columna opcional `target TEXT` a `alert_rules` — explícitamente fuera de
  alcance aquí.

---

## 4. Dependencias npm nuevas

| Paquete | Versión aprox. | Justificación |
|---|---|---|
| `nodemailer` | `^6.9.x` | Envío de correos SMTP para R26/R27. Es la librería estándar de facto para SMTP en Node, sin dependencias nativas. Mencionada explícitamente en el criterio de aceptación de `feature_list.json` ("nodemailer/SMTP configurable"). |

No se requieren otras dependencias:
- La evaluación periódica usa `setInterval` nativo (igual que
  `pbxHealthService`).
- Las queries CDR usan `pool.query` con `?` (mysql2/promise, ya existente).
- El frontend reutiliza Tailwind + `lucide-react` (ya instalados, mismo
  patrón que `PbxStatus.jsx`/`Toast.jsx`).

---

## 5. Componentes frontend

### 5.1 `frontend/src/components/AlertsPanel.jsx`

Pantalla nueva, ruta `/alerts` (cualquier usuario autenticado, R34).

- **Carga inicial**: `api.activeAlerts()` (`GET /api/alerts/active`) al
  montar; guarda la lista en estado local `alerts`.
- **Render**: tabla/lista de tarjetas, una fila por alerta activa, columnas:
  - `type` (con etiqueta legible: "Troncal fuera de servicio",
    "Pico de llamadas perdidas", "PBX desconectado",
    "Extensión sin registrar").
  - `description`.
  - `created_at` (formateado, p. ej. `toLocaleString`).
  - Botón "Resolver" → `api.resolveAlert(id)` (`PATCH
    /api/alerts/:id/resolve`); en éxito, elimina la alerta de `alerts`
    (R35) sin recargar la página; en error, banner inline (no `alert()`).
- **Tiempo real (R36)**: se suscribe al evento `alert` vía `useSSE`
  (extensión §5.2). Al recibir un evento `alert` con `resolved: false`,
  antepone la alerta a `alerts` si no existe ya un elemento con el mismo
  `id` (evita duplicados si el usuario disparó la acción que generó la
  alerta y además recibe el broadcast).
- Si `alerts` está vacío, muestra un mensaje "Sin alertas activas" (no un
  estado de error).

### 5.2 `frontend/src/components/AlertRulesManager.jsx`

Pantalla nueva, admin-only, ruta `/admin/alerts` (R37).

- **Carga inicial**: `api.adminAlertRules()` (`GET
  /api/admin/alerts/rules`).
- **Listado**: tabla con columnas `type` (etiqueta legible + nota de
  limitación para `trunk_down`/`ext_unreachable`, ver R22/R24), `threshold`,
  `enabled` (toggle), `notify_email`, acciones (editar/eliminar).
- **Crear regla**: formulario con `type` (select de los 4 valores fijos),
  `threshold` (input numérico, requerido/visible solo si `type` ∈
  {`lost_spike`, `trunk_down`}), `notify_email` (input email opcional).
  Para `type = 'ext_unreachable'`, el formulario muestra una nota explicando
  que la regla se guarda pero no se evalúa en esta versión (R24); para
  `type = 'trunk_down'`, una nota explicando que se basa en ausencia de
  actividad CDR sobre `config.channels`, no en el estado real de registro
  SIP (R22).
- **Editar/eliminar**: mismo patrón que `ChannelAliasManager.jsx`/
  `UserManagement.jsx` (edición inline o modal simple, banner inline de
  error/éxito, sin `alert()`).
- `enabled` se edita con un toggle que llama
  `api.updateAlertRule(id, { enabled })` inmediatamente (sin botón "Guardar"
  separado), igual patrón que `trunks_config.hidden` en `SystemConfig.jsx`.

### 5.3 `frontend/src/hooks/useSSE.js` — extensión

Añadir manejo del evento `alert`, siguiendo el mismo patrón que
`pbx_status`:

```js
es.addEventListener('alert', (e) => {
  const data = JSON.parse(e.data);
  onAlert?.(data);
});
```

- Se añade el callback opcional `onAlert` a la firma de
  `useSSE(url, { onInit, onUpdate, onPbxStatus, onAlert })`, sin alterar
  `onInit`/`onUpdate`/`onPbxStatus` existentes (compatibilidad, §7).
- `AlertsPanel.jsx` instancia su propio `useSSE('/api/events', { onAlert })`.
  Igual que se documentó en `pbx_health` §6.3, esto puede coexistir con otras
  conexiones SSE abiertas por `Dashboard.jsx`/`Layout.jsx`/
  `HistoricalView.jsx` — aceptable por las mismas razones (conexiones
  concurrentes ya soportadas por `sseClients` como `Set`).
- **Notificación global (opcional, no bloqueante para R34-R36)**: dado que
  `Layout.jsx` ya mantiene una instancia de `useSSE` para `pbx_status`
  (`pbx_health`), se puede añadir `onAlert` a esa misma instancia para
  mostrar un `Toast.jsx` (ya existente, reutilizado) cuando llega una nueva
  alerta mientras el usuario no está en `/alerts` — mejora de UX coherente
  con `docs/conventions.md` ("Mensajes de error: toast o banner inline"), se
  deja a criterio del implementer sin ser un requisito numerado.

### 5.4 `frontend/src/api.js` — nuevas funciones

```js
activeAlerts:     ()           => req('GET',   '/api/alerts/active'),
resolveAlert:     (id)         => req('PATCH', `/api/alerts/${id}/resolve`),
adminAlertRules:  ()           => req('GET',   '/api/admin/alerts/rules'),
createAlertRule:  (data)       => req('POST',  '/api/admin/alerts/rules', data),
updateAlertRule:  (id, data)   => req('PATCH', `/api/admin/alerts/rules/${id}`, data),
deleteAlertRule:  (id)         => req('DELETE', `/api/admin/alerts/rules/${id}`),
```

### 5.5 Navegación

- `frontend/src/App.jsx`:
  - `import AlertsPanel from './components/AlertsPanel'`
  - `import AlertRulesManager from './components/AlertRulesManager'`
  - `<Route path="alerts" element={<PrivateRoute><AlertsPanel /></PrivateRoute>} />`
    (dentro del bloque ya envuelto por `PrivateRoute`/`Layout`, igual patrón
    que `reports`/`historical/analytics`).
  - `<Route path="admin/alerts" element={<AdminRoute><AlertRulesManager /></AdminRoute>} />`
    junto a `admin/config`/`admin/users`.
- `frontend/src/components/Layout.jsx`:
  - `<NavItem to="/alerts" icon={Bell} label="Alertas" />` en la sección
    "Monitoreo" (junto a Dashboard/Histórico/Reportes), ícono `Bell` de
    `lucide-react` (ya disponible).
  - `<NavItem to="/admin/alerts" icon={BellRing} label="Reglas de alerta" />`
    (o ícono equivalente) dentro del bloque `{user?.role === 'admin' && (...)}`,
    junto a "Canales"/"Usuarios"/"Configuración".

---

## 6. Decisión técnica clave

### 6.1 Ubicación y forma de `alertService`

**Opción elegida:** `backend/services/alertService.js`, factory que recibe
`(pool, config, db, broadcast, pbxHealthService, mailService)` y expone:

```js
{
  start(intervalMs?: number): () => void,  // arranca su propio setInterval, devuelve stop()
  evaluateOnce(): Promise<void>,           // un ciclo de evaluación (usado por start() y por tests)
  getActiveAlerts(): object[],
  resolveAlert(id): object,                // lanza { status, message } si no existe / ya resuelta
  listRules(): object[],
  createRule(fields): object,
  updateRule(id, fields): object,
  deleteRule(id): object,
}
```

Mismo estilo que `pbxHealthService` (factory + estado/timer propio +
funciones síncronas de lectura sobre SQLite vía `better-sqlite3`, que es
síncrono).

### 6.2 Ciclo de evaluación propio, sin duplicar timers existentes

**Opción elegida:** un `setInterval` **propio** dentro de `alertService`,
arrancado con `alertService.start(intervalMs)` desde `server.js`, igual
patrón que `pbxHealthService.start(15_000)`.

- **Frecuencia**: por defecto, igual a `config.server.pollIntervalMs`
  (30 s) si está definido, o `30_000` ms si no — esto satisface literalmente
  el criterio de aceptación "El backend evalúa las reglas en cada ciclo de
  polling" en términos de **frecuencia equivalente**, sin que el código de
  `alertService` dependa del `setInterval` concreto de `/api/events` ni se
  ejecute dentro de su callback.
- **Por qué no reutilizar el `setInterval` de `/api/events` directamente**:
  ese timer (a) solo corre su callback `if (sseClients.size > 0)` — la
  evaluación de alertas **debe** ejecutarse aunque no haya clientes SSE
  conectados (una troncal caída de madrugada sin nadie viendo el dashboard
  igual debe generar alerta y, potencialmente, enviar el correo); (b) acoplar
  la evaluación de reglas (que puede incluir una query CDR adicional, R16) al
  ciclo de `fetchData()` (ya costoso, 9 queries en paralelo) introduciría
  latencia/contención innecesaria en el pipeline de actualización del
  dashboard, violando el espíritu de RNF-02 ("Dashboard: respuesta < 5 s").
  Mantener el timer separado preserva "una responsabilidad por timer" —
  mismo principio aplicado en `pbx_health` §6.2.
- **Por qué no reutilizar el timer de `pbxHealthService` (15 s)**: ese timer
  está dimensionado para detectar caídas de conexión rápidamente con una
  operación barata (`SELECT 1`); la evaluación de `lost_spike`/`trunk_down`
  hace queries más costosas sobre `cdr` y no necesita esa cadencia. Forzar
  ambas responsabilidades al mismo timer acoplaría su frecuencia
  innecesariamente y violaría el principio de timers independientes ya
  establecido por `pbx_health`.
- **Resultado**: tres timers independientes coexisten — `setInterval` de
  `/api/events` (30 s, broadcast `update`, gated por `sseClients.size`),
  `pbxHealthService` (15 s, `SELECT 1`, broadcast `pbx_status` solo en
  transición), `alertService` (30 s por defecto, evaluación de reglas,
  broadcast `alert` solo al crear/resolver). Los tres comparten el mismo
  `pool` MySQL (ya dimensionado con `connectionLimit: 10`) y la misma función
  `broadcast`. Ninguno modifica a los otros dos.

### 6.3 Integración de `pbx_disconnect` con `pbxHealthService`

**Opción elegida:** `alertService` recibe la instancia de `pbxHealthService`
(ya creada en `server.js`, §6.1 de `pbx_health`'s design.md) como
**dependencia inyectada** en su factory. En cada ciclo de `evaluateOnce()`,
para cada regla habilitada de `type = 'pbx_disconnect'`:

1. Llama a `pbxHealthService.getStatus()` — **lectura síncrona del estado en
   memoria, sin I/O, sin disparar un nuevo `SELECT 1`** (no se usa
   `ensureChecked()` ni `check()`).
2. Si `status.connected === false`:
   - Si no existe una alerta no resuelta para esa `rule_id` → crear alerta
     (R14/R18), con `description` que incluya `status.lastError` y
     `status.lastCheck`.
   - Si ya existe una alerta no resuelta para esa `rule_id` → no hacer nada
     (R15, evita duplicados).
3. Si `status.connected === true` y existe una alerta no resuelta para esa
   `rule_id` → marcarla como resuelta automáticamente (R19).

**Por qué este enfoque y no una suscripción a eventos:**
- `pbxHealthService` no expone actualmente un emisor de eventos
  (`EventEmitter`); solo expone `getStatus()` (síncrono) y llama a
  `broadcast('pbx_status', ...)` directamente en transición. Convertirlo en
  un `EventEmitter` sería modificar un servicio recién implementado y
  mergeado fuera del alcance estricto de esta feature, con riesgo de
  regresión sobre `pbx_health` (ya `done`).
- Leer `getStatus()` en cada ciclo de `alertService` (cada 30 s) es
  suficiente: una transición de `pbxHealthService` (detectada cada 15 s por
  su propio timer) será observada por `alertService` en, como mucho, su
  siguiente ciclo (≤ 30 s después) — latencia aceptable para una alerta
  (no es un requisito de tiempo real estricto, a diferencia de R11/R12 de
  `pbx_health`, que sí exigen broadcast inmediato del **estado de
  conectividad en sí**, ya cubierto por `pbx_status`).
- **No se duplica el mecanismo de `pbxHealthService`**: `alertService` nunca
  llama `pool.query('SELECT 1')` ni `pbxHealthService.check()`/
  `ensureChecked()` — solo lee el estado ya mantenido (`getStatus()`).
- **Alternativa descartada — pasar un callback `onStatusChange` a
  `pbxHealthService.start()`:** requeriría modificar la firma de
  `pbxHealthService.start()` (tocar código de `pbx_health`, ya `done`); el
  enfoque de "leer `getStatus()` en cada ciclo propio" logra el mismo
  resultado funcional sin tocar `pbxHealthService.js` en absoluto.

### 6.4 Detección de `lost_spike`

**Opción elegida:**
- **Ventana**: rolling window de los **últimos 60 minutos** (constante
  `LOST_SPIKE_WINDOW_MINUTES = 60`, no configurable por regla en esta
  iteración — el campo configurable de la regla es solo `threshold`, el
  conteo). Se recalcula `[ahora - 60min, ahora]` en cada ciclo de evaluación
  (cada `intervalMs`, §6.2).
- **Query**: §3.1 (`COUNT(*)` de `cdr` con `disposition = 'NO ANSWER' OR dst
  IN (lostDestinations)`), reutilizando `config.lostDestinations` (mismo
  default `['s','hang','hangup']` que `queryStats`).
- **Condición de alerta**: `lost_count >= rule.threshold` → genera alerta con
  `description` tipo `"Se detectaron <lost_count> llamadas perdidas en los
  últimos 60 minutos (umbral: <threshold>)"`.
- **Resolución**: a diferencia de `pbx_disconnect` (R19, auto-resolución),
  `lost_spike` **no se auto-resuelve** — un pico de llamadas perdidas es un
  evento puntual que requiere revisión humana (botón "Resolver" manual, R31).
  Mientras exista una alerta `lost_spike` no resuelta para esa `rule_id`, no
  se generan duplicados (R15) aunque el conteo siga por encima del umbral en
  ciclos sucesivos.
- **Por qué 60 minutos fijo y no configurable por regla**: `feature_list.json`
  especifica los campos de `alert_rules` como `id, type, threshold, enabled,
  notify_email` — no incluye una columna de "ventana de tiempo". Añadir una
  columna `window_minutes` ampliaría el esquema más allá de lo documentado en
  `docs/architecture.md`/`feature_list.json`. Se elige una constante
  razonable (60 min) documentada en código, dejando como mejora futura
  explícita hacerla configurable si se requiere (análogo a la decisión sobre
  `target`/canal en `trunk_down`, §3.2).

### 6.5 Reutilización de `toMySQLDate`/cálculo de ventanas

**Opción elegida:** `alertService.js` calcula sus propias ventanas de tiempo
con `new Date()` y formatea a `'YYYY-MM-DD HH:MM:SS'` mediante una función
`toMySQLDate` **idéntica** a la de `server.js`. Dado que `server.js` no
exporta `toMySQLDate` (es una función interna del módulo monolítico, por
diseño no se reestructura `server.js`, CLAUDE.md), y que `docs/architecture.md`
ya prevé `backend/services/cdrService.js` como wrapper de las funciones CDR
existentes, esta spec propone:

- Si `backend/services/cdrService.js` **no existe aún** (verificar al
  implementar — no se confirmó su existencia en esta spec), `alertService.js`
  incluye una copia local mínima de `toMySQLDate` (≈ 5 líneas, sin lógica de
  negocio, idéntica a la de `server.js`) — una pequeña duplicación aceptable
  para no reestructurar `server.js` ni introducir un import circular.
- Si `cdrService.js` ya existe con una función equivalente exportada,
  `alertService.js` la reutiliza directamente.

Esto es coherente con la regla "no reescribas lo que ya funciona" — no se
modifica `server.js` para exportar `toMySQLDate`.

### 6.6 `trunk_down` y `ext_unreachable` — alcance

- **`trunk_down`**: soportado de forma **best-effort** vía ausencia de
  actividad `cdr` (§3.2, R20-R22). Limitaciones documentadas:
  - No refleja el estado real de registro SIP/IAX (requeriría AMI, no
    disponible).
  - Se evalúa contra `config.channels` (lista ya existente); si está vacía,
    la regla no genera alertas — documentado en la UI (R22) y en
    `requirements.md` (R20-R22).
- **`ext_unreachable`**: **fuera de alcance de evaluación** en esta
  iteración (R23-R24). El CRUD de reglas (`/api/admin/alerts/rules*`) acepta
  y persiste este `type` para no romper la UI de gestión de reglas ni el
  contrato `type IN (...)` documentado en `docs/architecture.md`, pero
  `alertService.evaluateOnce()` **omite explícitamente** las reglas de este
  tipo (ni siquiera intenta una query) — un `switch`/`if` con un `default`
  que no hace nada para `ext_unreachable`, con un comentario explicando la
  limitación y referenciando esta sección del design.md.
  - **Por qué no se elimina `ext_unreachable` del `CHECK` de `alert_rules`**:
    `docs/architecture.md` lo incluye explícitamente en la lista de tipos
    válidos (`CREATE TABLE ... type TEXT NOT NULL -- 'trunk_down' |
    'ext_unreachable' | 'lost_spike' | 'pbx_disconnect'`), y el criterio de
    aceptación de `feature_list.json` menciona "extensión sin registrar"
    como uno de los 4 tipos de regla configurables. Quitarlo del `CHECK`
    rompería la coherencia con `docs/architecture.md` y reduciría
    artificialmente las opciones del formulario de creación de reglas. Se
    prefiere "aceptar y persistir, pero no evaluar" + documentación clara en
    UI/spec, sobre "rechazar en el `CHECK`" o "inventar una fuente de datos".

### 6.7 Configuración SMTP

**Opción elegida:** la configuración SMTP vive en **`config.json`**, bajo una
nueva clave de nivel superior `smtp` (objeto), **no** en SQLite ni en
variables de entorno:

```json
"smtp": {
  "host": "smtp.example.com",
  "port": 587,
  "secure": false,
  "user": "alerts@example.com",
  "password": "...",
  "from": "Issabel Monitor <alerts@example.com>"
}
```

- **Por qué `config.json` y no SQLite**: `config.json` ya es la fuente de
  verdad para credenciales/secretos de infraestructura (`db.password`,
  `server.sessionSecret`) — `docs/existing_code.md` indica que **nuevas
  entidades de negocio** van a SQLite, pero credenciales de servicios
  externos (SMTP es análogo a la conexión MySQL) son coherentes con
  `config.json`, que ya está gitignored y documentado como "nunca commitear".
  Guardar una contraseña SMTP en SQLite (`system_config`, texto plano) sería
  menos consistente con el manejo actual de secretos que `config.json`
  (ambos en texto plano hoy, pero `config.json` es el lugar establecido para
  credenciales).
- **Por qué no variables de entorno**: el proyecto no usa `.env`/
  `process.env` para configuración en ningún punto existente (todo vía
  `config.json` cargado por `loadConfig()`); introducir un mecanismo de
  configuración paralelo solo para SMTP sería inconsistente.
- **`backend/config.example.json`**: se añade el bloque `smtp` con valores de
  ejemplo (placeholders), siguiendo el patrón de `db`/`server`. Si `smtp` no
  está presente o `smtp.host` está vacío, `mailService` se considera "no
  configurado" y R26/R27 aplican: el envío se omite/falla silenciosamente
  (logueado), sin bloquear la creación de la alerta ni el broadcast SSE.

**Mock en tests:**
- `backend/services/mailService.js` exporta una factory
  `createMailService(smtpConfig)` que internamente crea un transporter de
  `nodemailer` (`nodemailer.createTransport(smtpConfig)`) **solo si
  `smtpConfig?.host` está definido**; si no, expone un transporter "no-op"
  que resuelve inmediatamente sin enviar nada (cumple R28 implícitamente
  cuando SMTP no está configurado globalmente, además del caso por-regla de
  `notify_email` vacío).
- En `backend/tests/alerts.test.js`, el mailService se inyecta como
  dependencia de `alertService` (factory recibe `mailService` como
  parámetro, §6.1) y se sustituye por un mock (`{ sendAlertEmail: jest.fn()
  }`) — **no se crea ningún transporter SMTP real ni se contacta un
  servidor SMTP real en tests**, consistente con
  `docs/conventions.md` ("No hacer requests reales... usar mocks").
- `mailService.sendAlertEmail({ to, subject, text })` devuelve una `Promise`;
  `alertService` la envuelve en `try/catch` (R27) — un mock que rechaza
  (`mockRejectedValue`) permite testear el flujo de fallo sin romper la
  persistencia/broadcast de la alerta.

---

## 7. Compatibilidad v1.0

- **`GET /api/calls/today`, `GET /api/calls/range`, `GET /api/events`,
  `setInterval` de poll (`update`)** — sin cambios. `alertService` no
  modifica `fetchData`, `queryStats`, `queryChannels`, `queryHourly`,
  `queryQueues`, `extractChannel`, `passesFilter`, `todayRange`,
  `toMySQLDate` (copia local si aplica, §6.5, no modifica el original).
- **`pbxHealthService`** — sin cambios de código. `alertService` solo llama
  `getStatus()` (función ya pública, de solo lectura, sin I/O). El timer de
  15 s y su lógica de transición/broadcast `pbx_status` permanecen
  intactos (§6.3).
- **`sseClients`/`broadcast(event, data)`** — reutilizados sin modificar su
  firma; `alert` es simplemente un nuevo valor de `event` entre los ya
  soportados (`init`, `update`, `pbx_status`).
- **`backend/db/setup.js`** — solo se añaden dos bloques `CREATE TABLE IF NOT
  EXISTS` (`alert_rules`, `alerts`) y dos `CREATE INDEX IF NOT EXISTS`; no se
  modifican `users`, `audit_log`, `system_config`, `extensions_config`,
  `trunks_config` ni la lógica de migración existente.
- **`config.json`/`config.example.json`** — se añade el bloque opcional
  `smtp` (§6.7); no se modifican `db`, `server`, `app`, `channels`,
  `channelAliases`, `queues`, `lostDestinations`, `users`. `loadConfig()` no
  necesita cambios estructurales: `smtp` es simplemente otra clave de nivel
  superior leída por `mailService`, igual que `config.queues`/
  `config.lostDestinations` ya son leídas por `server.js`.
- **`frontend/src/hooks/useSSE.js`** — extensión aditiva (`onAlert`
  opcional, §5.3); `Dashboard.jsx`, `HistoricalView.jsx`, `Layout.jsx` y
  cualquier otro consumidor actual siguen funcionando idénticamente sin pasar
  el nuevo callback.
- **`frontend/src/components/Layout.jsx`** — solo se añaden dos `NavItem`
  nuevos (`/alerts`, `/admin/alerts`); no se modifica `<PbxStatus/>`,
  `<Toast/>`, ni la lógica de `appName`/logout/`pbxStatus` ya presente
  (salvo, opcionalmente, pasar `onAlert` a la instancia de `useSSE` ya
  existente en `Layout.jsx` para el toast global mencionado en §5.3 — cambio
  aditivo, no rompe `onPbxStatus`).
- **`frontend/src/App.jsx`** — solo se añaden dos `<Route>` nuevas
  (`alerts`, `admin/alerts`), sin tocar rutas existentes.
- **Patrón factory `(pool, config, db, ...)`** — `routes/alerts.js` sigue el
  mismo patrón que `routes/pbx.js`/`routes/config.js` (factory que recibe
  dependencias explícitas, incluyendo `requireAdmin` y `alertService`).
- **Ningún endpoint nuevo** (`/api/admin/alerts/rules*`, `/api/alerts/*`)
  colisiona con rutas existentes (`/api/admin/users*`, `/api/admin/config*`,
  `/api/pbx/*`, `/api/calls/*`, `/api/stats/*`, `/api/reports/*`,
  `/api/events`, `/api/auth/*`).
- **Ningún endpoint escribe en la BD de Issabel** — todas las queries CDR
  nuevas (§3) son `SELECT` con parámetros `?`.
