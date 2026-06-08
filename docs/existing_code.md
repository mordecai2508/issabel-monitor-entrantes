# docs/existing_code.md — Inventario del código existente (v1.0)

> **Leer antes de implementar cualquier feature nueva.**
> Este archivo evita reimplementar lo que ya existe.

---

## Repositorio base

`https://github.com/mordecai2508/issabel-monitor-entrantes`

Stack: Node.js + Express + express-session + bcryptjs + mysql2 (backend)  
React 18 + Vite + Tailwind CSS + Recharts + React Router v6 (frontend)  
Docker: un solo contenedor que sirve frontend compilado desde el backend.

---

## Backend — `backend/server.js` (509 líneas, monolítico)

### Configuración (`config.json`)
El sistema usa un único `config.json` para todo:
- Credenciales de BD MySQL (host, port, user, password, database, timezone)
- Puerto del servidor y secret de sesión
- Lista de canales (troncales) permitidos
- Alias de canales (`channelAliases`)
- Lista de colas (`queues`) y destinos de llamadas perdidas (`lostDestinations`)
- Usuarios del sistema (array `users` con id, username, password-hashed, role)

**Las features nuevas que necesiten persistencia deben usar SQLite local**
(`backend/db/monitor.sqlite`) en lugar de seguir ampliando config.json.

### Pool MySQL
```js
const pool = mysql.createPool({ host, port, user, password, database, timezone, ... });
```
Se conecta a la BD de Issabel (tabla `cdr` de `asteriskcdrdb`). Solo lectura.

### Funciones de query CDR (reutilizar, no reimplementar)
| Función | Qué hace |
|---|---|
| `extractChannel(raw)` | Limpia el nombre del canal Asterisk: `SIP/trunk-00a1b2` → `SIP/trunk` |
| `passesFilter(ch, allowedChannels, direction)` | Filtra canales por dirección (in/out/null) |
| `queryStats(pool, from, to, allowedChannels, direction)` | Agrega disposiciones por período |
| `queryChannels(pool, from, to, allowedChannels, direction)` | Agrega por canal |
| `queryHourly(pool, from, to, allowedChannels, direction)` | Agrega por hora del día |
| `queryQueues(pool, from, to, allowedChannels, queues, lostDests)` | Agrega por cola |
| `fetchData(from, to)` | Llama a todas las anteriores en paralelo (Promise.all) |
| `todayRange()` | Devuelve `{ from, to }` para el día actual (medianoche local) |
| `toMySQLDate(d)` | Convierte Date → string MySQL `YYYY-MM-DD HH:MM:SS` |

### Endpoints existentes
| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| POST | `/api/auth/login` | No | Login, crea sesión |
| POST | `/api/auth/logout` | Sí | Destruye sesión |
| GET | `/api/auth/me` | Sí | Devuelve usuario de sesión |
| GET | `/api/calls/today` | Sí | Estadísticas del día actual |
| GET | `/api/calls/range` | Sí | Estadísticas por rango ?from=&to= |
| GET | `/api/events` | Sí | SSE: `init` + `update` cada `pollIntervalMs` |
| GET | `/api/admin/users` | Admin | Lista usuarios |
| GET | `/api/config/public` | No | Nombre de la app |
| PUT | `/api/admin/app` | Admin | Actualiza nombre de la app |
| GET | `/api/admin/channels` | Admin | Lista canales con alias |
| PUT | `/api/admin/channels/:channel` | Admin | Actualiza alias de canal |

### SSE (Server-Sent Events)
El backend mantiene un `Set sseClients`. Emite:
- `init` al conectar un nuevo cliente (datos del día actual)
- `update` en cada ciclo del `setInterval` (pollMs)

Las nuevas features que necesiten emitir eventos SSE (`pbx_status`, `alert`)
deben reutilizar la función `broadcast(event, data)` ya existente.

### Middlewares de auth existentes
```js
requireAuth(req, res, next)   // 401 si no hay sesión
requireAdmin(req, res, next)  // 403 si no es admin
```

---

## Frontend — `frontend/src/`

### Estructura de componentes
```
src/
├── App.jsx                    # Router + rutas protegidas
├── api.js                     # fetch wrapper (base URL + credentials)
├── main.jsx                   # Entry point
├── index.css                  # Tailwind directives
├── contexts/
│   └── AuthContext.jsx        # Provee user, login(), logout(), loading
├── hooks/
│   └── useSSE.js              # Conecta a /api/events, expone data
└── components/
    ├── Layout.jsx             # Shell: sidebar + header + outlet
    ├── Login.jsx              # Formulario de login
    ├── Dashboard.jsx          # Vista principal con KPIs + gráficos
    ├── StatCard.jsx           # Card de KPI individual
    ├── HourlyChart.jsx        # Barras por hora (Recharts)
    ├── DispositionChart.jsx   # Pie de disposiciones (Recharts)
    ├── ChannelTable.jsx       # Tabla de actividad por canal
    ├── InboundView.jsx        # Vista entrantes con date picker
    ├── OutboundView.jsx       # Vista salientes con date picker
    ├── HistoricalView.jsx     # Vista histórica con date picker
    └── ChannelAliasManager.jsx # Panel admin de alias
```

### `api.js` — helper de fetch
```js
// Todas las llamadas al backend pasan por este helper.
// NUNCA hacer fetch() directo en componentes.
import { get, post, put, patch, del } from './api';
```

### `AuthContext.jsx`
Expone: `user` (objeto con id, username, role), `login(u,p)`, `logout()`, `loading`.
Lectura: `useAuth()` hook.

### `useSSE.js`
Conecta a `/api/events`, parsea eventos `init`/`update`, expone `data` y `connected`.

### Rutas del router (App.jsx)
| Ruta | Componente | Rol |
|---|---|---|
| `/login` | Login | Todos (sin auth) |
| `/` | Dashboard | Autenticado |
| `/inbound` | InboundView | Autenticado |
| `/outbound` | OutboundView | Autenticado |
| `/historical` | HistoricalView | Autenticado |
| `/admin/channels` | ChannelAliasManager | Admin |

Las **nuevas pantallas** deben añadirse como rutas en `App.jsx` y como
ítems en el sidebar de `Layout.jsx`, siguiendo el mismo patrón.

---

## Limitaciones conocidas de v1.0 a tener en cuenta

1. **Usuarios en config.json**: Las features `user_management` y posteriores deben
   migrar esto a SQLite (`backend/db/monitor.sqlite`).
2. **Sin tests**: El proyecto no tiene tests. Cada feature nueva DEBE incluirlos.
3. **Monolítico server.js**: No hay separación de capas. Las nuevas features pueden
   añadir archivos en `backend/routes/`, `backend/services/`, `backend/db/` sin
   necesidad de refactorizar el server.js existente (modo extensión progresiva).
4. **Sin TypeScript**: El proyecto es JavaScript puro. No introducir TypeScript.
5. **CDR es de solo lectura**: Nunca escribir en la BD de Issabel. Solo `SELECT`.

---

## Esquema de la tabla CDR de Issabel (solo lectura)

```sql
-- asteriskcdrdb.cdr (tabla principal)
calldate    DATETIME     -- Fecha y hora de la llamada
clid        VARCHAR(80)  -- Caller ID
src         VARCHAR(80)  -- Número origen
dst         VARCHAR(80)  -- Número destino
dcontext    VARCHAR(80)  -- Contexto destino
channel     VARCHAR(80)  -- Canal origen (e.g. SIP/trunk-00a1b2c3)
dstchannel  VARCHAR(80)  -- Canal destino
lastapp     VARCHAR(80)  -- Última aplicación Asterisk
lastdata    VARCHAR(80)  -- Datos de la última aplicación
duration    INT          -- Duración total (segundos)
billsec     INT          -- Segundos de conversación real
disposition VARCHAR(45)  -- ANSWERED | NO ANSWER | BUSY | FAILED
amaflags    INT
accountcode VARCHAR(20)
uniqueid    VARCHAR(32)  -- ID único de la llamada
userfield   VARCHAR(255)
```
