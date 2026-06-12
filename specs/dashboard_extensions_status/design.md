# design.md — dashboard_extensions_status

> Feature ID: 18 | Revisión: 2026-06-12

---

## 1. Endpoints nuevos

Montado bajo `/api` mediante `app.use('/api', require('./routes/pbx')(pool, config, db, requireAuth, broadcast, pbxHealthService, amiExtensionsService))`. Se reutiliza el mismo `routes/pbx.js` ya creado por `pbx_health` (feature 14, `done`) — ver §6.2 para la justificación de no crear `routes/ami.js` separado.

| Método | Ruta | Auth | Payload entrada | Payload salida | HTTP |
|---|---|---|---|---|---|
| GET | `/api/pbx/extensions` | `requireAuth` | — | `{ ok: true, data: { total: number, active: number, extensions: [{ extension: string, status: 'active'\|'inactive' }], available: boolean } }` | 200 / 401 |

Notas:
- Siempre HTTP 200 para usuarios autenticados, incluso cuando `available: false` (AMI no configurado o caído) — un fallo/ausencia de AMI es un **resultado** válido de la consulta, no un error del endpoint (R9, R10), igual patrón que `/api/pbx/health` con `connected: false`.
- El único caso de error HTTP es la falta de sesión (401, R8).
- No se usa `requireAdmin`: igual que `/api/pbx/health`, es información de monitoreo visible para cualquier usuario autenticado (`admin` u `operador`), consistente con `/api/calls/today` y `/api/pbx/health`.
- No colisiona con `/api/pbx/health` ni `/api/pbx/sync` (mismo prefijo `/api/pbx/*`, sufijo distinto).

---

## 2. Cambios BD

### 2.1 SQLite local

**Ninguno.** El estado `{ total, active, extensions, available }` es efímero/cacheado en memoria (igual razonamiento que `pbxHealthService` en `specs/pbx_health/design.md §2`): refleja "¿qué extensiones están registradas ahora?", no un histórico. No se crea ninguna tabla nueva en `backend/db/setup.js`.

### 2.2 `config.json` / `config.example.json`

Se añade un nuevo bloque de nivel superior `ami`, análogo a `db` pero para AMI (TCP, puerto típico `5038`), con credenciales **separadas** de las de `db`:

```json
{
  "ami": {
    "host": "192.168.x.x",
    "port": 5038,
    "username": "monitor-readonly",
    "password": "yourpassword"
  }
}
```

- En `config.example.json`: bloque `ami` con valores placeholder (mismo estilo que el bloque `db` existente), comentado únicamente a través de los valores de ejemplo (el formato JSON no admite comentarios reales).
- En `config.json` real (gitignored): el administrador rellena `host`/`port`/`username`/`password` de un usuario AMI configurado en `manager.conf` de Issabel con permisos mínimos de lectura (`read = system,call,...` sin `write`), siguiendo R5/R19.
- Si el bloque `ami` no existe, o existe pero le faltan `host`/`port`/`username`/`password`, el sistema lo trata como "no configurado" (R2) — no se lanza error de arranque, igual que si `db` tuviera un host inválido (el server ya tolera eso para CDR).

**No se reutiliza ni se modifica el bloque `db` existente** (R1) — son credenciales y protocolos distintos (MySQL `asteriskcdrdb` de solo lectura vs. AMI TCP de Asterisk).

### 2.3 Queries CDR

No aplica. Esta feature no toca la tabla `cdr` ni el pool MySQL (R19) — toda la consulta de extensiones ocurre vía el protocolo AMI sobre una conexión TCP independiente.

---

## 3. Dependencias npm nuevas

| Paquete | Versión aprox. | Justificación |
|---|---|---|
| `asterisk-manager` | `^0.2.0` | Cliente Node.js para el protocolo AMI (Asterisk Manager Interface) sobre TCP. Es la librería más usada y mantenida del ecosistema Node para AMI (usada históricamente por proyectos FreePBX/Issabel community tooling), expone una API basada en eventos (`ami.on('managerevent', ...)`) y soporta el envío de acciones (`ami.action({ Action: 'PJSIPShowEndpoints' }, callback)`) con callback/promesa. No requiere compilación nativa (paquete JS puro), por lo que no introduce riesgos de build adicionales en el contenedor Docker (a diferencia de paquetes con bindings nativos). |

**Alternativa descartada — implementar el cliente AMI a mano con `net.Socket`:** el protocolo AMI usa un formato de líneas tipo "INI" con eventos asíncronos multiplexados sobre la misma conexión (respuestas a acciones intercaladas con eventos `managerevent`); reimplementar el parsing/framing del protocolo y la correlación `ActionID` → respuesta es trabajo no trivial y propenso a bugs sutiles (timeouts, eventos parciales, reconexión). `asterisk-manager` ya resuelve esto con ~10 años de uso en producción por la comunidad Issabel/FreePBX, y es JS puro (sin riesgo de TypeScript ni de build nativo). Se descarta la implementación manual por costo/riesgo desproporcionado frente al alcance de la feature.

No se requieren otras dependencias nuevas: el endpoint reutiliza `requireAuth`, `broadcast` y el patrón factory ya existentes.

---

## 4. Lógica no obvia

### 4.1 `backend/services/amiExtensionsService.js` — ciclo de vida de la conexión AMI

- Factory: `module.exports = function createAmiExtensionsService(amiConfig, options = {})`.
- Estado interno en memoria: `{ total: 0, active: 0, extensions: [], available: false }`, inicializado así si `amiConfig` no está configurado (R2/R9) — **nunca se intenta conectar** en ese caso.
- Si `amiConfig` está configurado (`host`, `port`, `username`, `password` todos presentes):
  - Crea una instancia de `asterisk-manager` (`new AsteriskManager(port, host, username, password, true)`), con `events: false`/mínimo necesario — no se necesita suscripción a eventos en vivo de Asterisk, solo ejecutar la acción `PJSIPShowEndpoints` periódicamente (consistente con R5: solo lectura, sin necesidad de un stream de eventos persistente que añadiría complejidad innecesaria).
  - Maneja el evento `error` de la conexión AMI con un handler que registra el fallo (`console.error`) y marca `available: false` sin lanzar excepción no capturada (R11).
- `async function check()`:
  - Si no configurado → devuelve el estado `{ total: 0, active: 0, extensions: [], available: false }` directamente, sin tocar la red (R9).
  - Si configurado, ejecuta la acción AMI `PJSIPShowEndpoints` (o equivalente `SIPshowregistry`/`PJSIPShowRegistrationsOutbound` según lo que exponga el PBX — ver §4.2) con un timeout acotado (p. ej. 5000 ms vía `Promise.race`, mismo patrón que `pbxHealthService` en `specs/pbx_health/design.md §6.1`).
  - Éxito → parsea la lista de endpoints (§4.2), actualiza `{ total, active, extensions, available: true }` en el estado interno.
  - Fallo/timeout → **conserva el estado anterior si `available` ya era `true`** (R10: "retain the previously cached successful result"), o si nunca hubo éxito, mantiene `{ total: 0, active: 0, extensions: [], available: false }`. En ambos casos registra el error con `console.error('[ami] ...', err.message)` sin exponer `username`/`password` en el mensaje (R20).
  - Devuelve una copia del estado actualizado.
- `function getStatus()`: devuelve una copia síncrona del estado en memoria (sin I/O) — usado por `GET /api/pbx/extensions` (R6).
- `function start(intervalMs)`: arranca un `setInterval` propio que llama a `check()` periódicamente; devuelve `stop()` para limpieza en tests. Si `amiConfig` no está configurado, `start()` puede ser un no-op (no crea timer) — optimización opcional, no estrictamente requerida pero evita timers inútiles.
- Exporta `{ check, getStatus, start }`.

### 4.2 Parseo de `PJSIPShowEndpoints` → `{ extension, status }`

`asterisk-manager` ejecuta acciones tipo "lista" (`PJSIPShowEndpoints`) devolviendo, vía callback/evento, una secuencia de respuestas intermedias (`EndpointList`) seguidas de un evento final (`EndpointListComplete`). El servicio:

1. Envía la acción `{ Action: 'PJSIPShowEndpoints' }`.
2. Acumula cada evento `EndpointList` recibido antes de `EndpointListComplete` (o usa la API de callback agregado de `asterisk-manager` si la expone — verificar versión instalada; si no, acumular manualmente vía `ami.on('managerevent', ...)` filtrando por `event === 'EndpointList'`/`'EndpointListComplete'` y `ActionID` correlacionado).
3. Por cada `EndpointList`, extrae:
   - `extension`: campo `ObjectName` (o `Resource`, según versión de Asterisk) — identificador del endpoint PJSIP, normalmente el número de extensión.
   - `status`: el campo `DeviceState` (valores típicos `NOT_INUSE`, `UNAVAILABLE`, `INUSE`, `RINGING`, etc.) o `Contacts`/`Registered` según la versión — se normaliza:
     - `status: 'active'` si el endpoint reporta al menos un contacto registrado (`Contacts !== ''`/`Registered === 'Yes'`/`DeviceState !== 'UNAVAILABLE'`, según el campo disponible — el implementer debe verificar el formato real contra el PBX de pruebas y documentar en el código qué campo se usó).
     - `status: 'inactive'` en caso contrario (incluye `UNAVAILABLE`, sin contactos, o `DeviceState` ausente).
4. `total = extensions.length`, `active = extensions.filter(e => e.status === 'active').length`.

**Nota de implementación:** dado que el formato exacto de campos de `PJSIPShowEndpoints` puede variar levemente entre versiones de Asterisk/Issabel, el `implementer` debe validar contra una instancia real (o fixture capturado) durante T3, y documentar en un comentario del código qué campo se usa para `status`. Esto no cambia la forma del contrato `{ extension, status }` expuesto por el endpoint (R7), solo el mapeo interno.

### 4.3 Integración con el ciclo de polling existente (sin duplicar timers)

**Mismo patrón que `pbxHealthService`** (`specs/pbx_health/design.md §6.2`): `amiExtensionsService` tiene su **propio** `setInterval`, independiente del `setInterval` de `/api/events` (`fetchData`/`broadcast('update', ...)`) y también independiente del timer de `pbxHealthService`.

- Intervalo sugerido: igual o cercano al de `pbxHealthService` (p. ej. 15-30 s) — el estado de registro de extensiones cambia con poca frecuencia (un teléfono se registra/desregistra al encender/apagar o perder red), por lo que no necesita ser tan agresivo como un health-check de conectividad; un valor por defecto de 30 s (igual a `pollIntervalMs` por defecto) es razonable y configurable vía `options.intervalMs` del factory, sin añadir una nueva clave a `config.json` (se puede hardcodear un default razonable; no es un requisito de la feature exponerlo como configuración).
- `GET /api/pbx/extensions` lee `getStatus()` (síncrono, sin I/O) — no dispara una consulta AMI por request (R6), igual que `pbxHealthService.getStatus()`.
- No se modifica el `setInterval` existente de `/api/events` ni el de `pbxHealthService`.
- Los tres timers (`/api/events` polling, `pbxHealthService`, `amiExtensionsService`) son independientes y no comparten recursos críticos: el primero usa el pool MySQL, los otros dos usan, respectivamente, `pool.query('SELECT 1')` (muy barato) y la conexión AMI TCP (protocolo distinto, sin contención con MySQL).

---

## 5. Componentes frontend

### 5.1 `frontend/src/components/Dashboard.jsx` — dos nuevos `StatCard`

Se añaden dos indicadores junto a los KPIs existentes (`Total llamadas`, `Contestadas`, `Perdidas`, etc., líneas ~135-146 de `Dashboard.jsx`):

```jsx
<StatCard label="Extensiones" value={extensionsTotal} icon={Users} color="slate" />
<StatCard label="Activas"     value={extensionsActive} icon={UserCheck} color="green" />
```

- Iconos: `Users`/`UserCheck` de `lucide-react` (ya instalado), o equivalentes disponibles — a discreción del implementer si esos nombres exactos no existen en la versión instalada.
- Si `available === false` (R16): se muestran ambos valores como `0` (consistente con el contrato del endpoint, que ya devuelve `0` en ese caso) — opcionalmente con un estilo visual atenuado (p. ej. `opacity-50` o un tooltip "Estado de extensiones no disponible"), sin bloquear el render del resto de `StatCard`/gráficos.
- Si la petición HTTP falla a nivel de red (R17): mismo tratamiento que `available: false` — estado neutro, valores `0` o placeholder, sin lanzar excepción que rompa el árbol de componentes (usar `try/catch` o `.catch()` en la llamada a `api.js`, con estado local `extensionsData` inicializado a `{ total: 0, active: 0, extensions: [], available: false }`).

### 5.2 Origen de datos: REST polling (no SSE)

**Decisión:** `Dashboard.jsx` obtiene `{ total, active, available }` mediante una llamada REST a `GET /api/pbx/extensions` vía `api.js`, con un `setInterval` propio en el frontend (p. ej. cada 30 s, igual al `pollIntervalMs` por defecto), **no** mediante un nuevo evento SSE.

- Carga inicial: al montar `Dashboard.jsx`, llama a `api.pbxExtensions()` y guarda el resultado en estado local (`extensionsData`).
- Refresco periódico: `setInterval(() => api.pbxExtensions().then(...).catch(...), 30000)`, limpiado en el `useEffect` cleanup.
- Ver §6.1 para la justificación de REST polling vs. extender el evento SSE `update`/`init`.

### 5.3 `frontend/src/api.js` — nueva función

```js
pbxExtensions: () => req('GET', '/api/pbx/extensions'),
```

### 5.4 Navegación

No se añaden rutas nuevas ni entradas de sidebar — los dos indicadores se integran como `StatCard` adicionales dentro de `Dashboard.jsx` (pantalla ya existente), sin tocar `App.jsx` ni `Layout.jsx`.

---

## 6. Decisión técnica clave

### 6.1 REST polling vs. extender SSE (`init`/`update` o nuevo evento)

**Opción elegida:** endpoint REST `GET /api/pbx/extensions` consultado por `Dashboard.jsx` con su propio `setInterval` (§5.2).

**Alternativas descartadas:**

- **Añadir `extensionsStatus` al payload `init`/`update` de `/api/events`** (mismo patrón que `pbxStatus` en R23 de `pbx_health`): se descarta porque (a) el payload `update` ya es relativamente grande (incluye `stats`, `channels`, `hourly`) y se difunde a **todos** los clientes SSE conectados en cada ciclo — añadir datos de extensiones que cambian con mucha menor frecuencia que las estadísticas de llamadas sería desproporcionado; (b) acoplaría el ciclo de `fetchData()` (CDR/MySQL) con el resultado de una fuente completamente distinta (AMI/TCP), complicando el manejo de errores independientes (si AMI falla, no debe afectar el payload `update` que sí depende de CDR); (c) un endpoint REST cacheado (R6) es más simple de testear de forma aislada (Supertest + mock de AMI) sin necesitar levantar una conexión SSE en los tests.
- **Nuevo evento SSE dedicado (`extensions_status`), siguiendo el patrón `pbx_status`:** técnicamente viable y consistente con `pbx_health`, pero `pbx_status` se justifica porque es un evento **basado en cambios** (solo se emite cuando cambia `connected`, R11-R13 de `pbx_health`) — de baja frecuencia por diseño. El estado de extensiones (`total`/`active`) podría cambiar con mayor frecuencia relativa (extensiones que se registran/desregistran a lo largo del día) y un esquema "solo emitir en cambio" añadiría complejidad de diffing en el backend sin un beneficio claro sobre un simple polling REST de 30 s, que es exactamente la cadencia que ya usa el resto del dashboard antes de la introducción de SSE (y que sigue siendo la cadencia de `pollIntervalMs`). Se prioriza simplicidad y aislamiento de fallos (R11/R17) sobre la consistencia formal con `pbx_status`.

Documentado como posible mejora futura: si en producción el polling REST de `Dashboard.jsx` resulta redundante, podría migrarse a un evento SSE `extensions_status` basado en cambios, reutilizando `broadcast()` — sin requerir cambios en el contrato de `GET /api/pbx/extensions` (que seguiría existiendo para la carga inicial/fallback, R7).

### 6.2 Reutilizar `backend/routes/pbx.js` vs. crear `backend/routes/ami.js`

**Opción elegida:** añadir `GET /pbx/extensions` al `routes/pbx.js` ya existente (creado por `pbx_health`, feature 14, `done`), ampliando su factory para recibir un nuevo argumento `amiExtensionsService`.

**Alternativa descartada — `backend/routes/ami.js` separado:** se descarta porque (a) ambos endpoints (`/api/pbx/health`, `/api/pbx/sync`, `/api/pbx/extensions`) comparten el prefijo `/api/pbx/*` y el mismo propósito general ("estado del PBX"), por lo que agruparlos en un único router es más coherente con la convención de nombres de rutas (`docs/conventions.md`: "Rutas API kebab-case", agrupadas por dominio); (b) crear un router nuevo para un solo endpoint añade un `app.use('/api', ...)` adicional sin beneficio claro; (c) el factory de `routes/pbx.js` ya recibe `(pool, config, db, requireAuth, broadcast, pbxHealthService)` — añadir `amiExtensionsService` como séptimo argumento es un cambio aditivo y de bajo riesgo, mientras que separar en dos routers no reduce el acoplamiento (ambos servicios son independientes entre sí, solo comparten el prefijo de ruta).

**Importante — no se fusionan los *servicios*:** `pbxHealthService` (verifica MySQL) y `amiExtensionsService` (consulta AMI) permanecen como módulos completamente independientes en `backend/services/`, cada uno con su propio estado, timer y manejo de errores (R11). Solo comparten el archivo de rutas como punto de entrada HTTP.

### 6.3 Conceptos "extensión" — `dashboard_extensions_status` vs. `system_config`

Para evitar confusión con `GET /api/admin/extensions` de `system_config` (feature 13, `done`, ver `specs/system_config/design.md §1`):

| | `GET /api/admin/extensions` (system_config, admin) | `GET /api/pbx/extensions` (esta feature) |
|---|---|---|
| Fuente de datos | CDR (`asteriskcdrdb.cdr`, vía `statsService.queryRankings(..., 'extension', ...)`) + overrides en SQLite (`extensions_config`) | AMI (`PJSIPShowEndpoints`), sin tocar CDR ni SQLite |
| Significado de "extensión" | Número que aparece como `src` en registros CDR de los últimos 30 días (actividad histórica de llamadas) | Endpoint PJSIP/SIP configurado en el PBX (`pjsip.conf`/`Endpoint`), independientemente de si ha hecho llamadas |
| Significado de "activa"/`total` | No aplica directamente — son filas de ranking con `total` = número de llamadas | `total` = nº de endpoints PJSIP configurados; `active` = nº de esos endpoints actualmente registrados (con contacto AMI) |
| Auth | `requireAdmin` | `requireAuth` (cualquier usuario) |
| Uso en UI | Pantalla de administración "Personalización" (renombrar/ocultar extensiones en reportes) | Dos `StatCard` en el dashboard principal ("Extensiones"/"Activas") |

**No hay solapamiento de rutas ni de campos de respuesta** — `/api/admin/extensions` devuelve un array de objetos `{ extension, displayName, hidden, total }` (ranking CDR), mientras que `/api/pbx/extensions` devuelve `{ total, active, extensions: [{extension, status}], available }` (estado AMI). Los nombres de los endpoints son suficientemente distintos (`/admin/extensions` vs. `/pbx/extensions`) para no generar ambigüedad en el código; en la UI, los labels "Extensiones"/"Activas" del dashboard (esta feature) son claramente un widget de monitoreo PBX, distinto de la tabla de administración de `SystemConfig.jsx` (feature 13).

Esta feature **no modifica** `routes/config.js`, `extensions_config`, ni `GET/PATCH /api/admin/extensions*` (feature 13, `done`).

---

## 7. Compatibilidad v1.0

- `GET /api/calls/today`, `GET /api/calls/range`, `GET /api/events` — sin cambios; no se modifican `fetchData`, `queryStats`, `queryChannels`, `queryHourly`, `queryQueues`, `extractChannel`, `passesFilter`, `todayRange`, `toMySQLDate` (R18).
- `GET /api/pbx/health`, `POST /api/pbx/sync` (feature 14, `done`) — sin cambios de comportamiento; `routes/pbx.js` se amplía de forma aditiva (nuevo endpoint + nuevo argumento del factory `amiExtensionsService`), sin tocar los handlers existentes de `/pbx/health`/`/pbx/sync` ni `pbxHealthService` (R18).
- `GET/PATCH /api/admin/extensions*`, `extensions_config` (feature 13, `done`) — sin cambios; conceptos distintos, ver §6.3.
- `config.json`/`config.example.json` — cambio puramente aditivo: nuevo bloque de nivel superior `ami`, opcional. Si está ausente, el comportamiento es idéntico a v1.0 más el nuevo endpoint devolviendo `available: false` (R2, R9). No se modifica el bloque `db` ni ningún otro bloque existente.
- `backend/db/setup.js` — sin cambios (§2.1: no se crean tablas).
- `sseClients`/`broadcast(event, data)` — no se usan en esta feature (§6.1); no hay cambios al mecanismo SSE existente.
- `frontend/src/components/Dashboard.jsx` — cambio aditivo: dos `StatCard` nuevos + un `useEffect`/`setInterval` adicional para `api.pbxExtensions()`; no se modifica la lógica de `useSSE`/`init`/`update` existente ni el resto de KPIs/gráficos.
- `frontend/src/hooks/useSSE.js` — sin cambios (no se usa SSE para esta feature, §6.1).
- `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx` — sin cambios (§5.4).
- Patrón factory `(pool, config, db, requireAuth, ...)` — `routes/pbx.js` mantiene el mismo patrón, solo añade `amiExtensionsService` como argumento adicional al final de la lista, siguiendo la convención ya usada para `pbxHealthService`.
- Ningún endpoint nuevo (`/api/pbx/extensions`) colisiona con rutas existentes (`/api/admin/*`, `/api/calls/*`, `/api/stats/*`, `/api/reports/*`, `/api/events`, `/api/auth/*`, `/api/config/*`, `/api/pbx/health`, `/api/pbx/sync`).
