# design.md — pbx_health

> Feature ID: 14 | Revisión: 2026-06-10

---

## 1. Endpoints nuevos

Montados bajo `/api` mediante `app.use('/api', require('./routes/pbx')(pool, config, db, requireAuth, broadcast, pbxHealthService))`, siguiendo el patrón factory existente. `broadcast` es la función ya existente en `server.js` (§"SSE — actualizaciones en tiempo real"), pasada como dependencia para que el servicio pueda emitir `pbx_status` sin que `routes/pbx.js` necesite acceso directo a `sseClients`.

| Método | Ruta | Auth | Payload entrada | Payload salida | HTTP |
|---|---|---|---|---|---|
| GET | `/api/pbx/health` | `requireAuth` | — | `{ ok: true, data: { connected: boolean, lastCheck: string (ISO 8601), lastError: string\|null, latencyMs: number } }` | 200 / 401 |
| POST | `/api/pbx/sync` | `requireAuth` | — (body vacío, ignorado si se envía) | `{ ok: true, data: { connected: boolean, lastCheck: string (ISO 8601), lastError: string\|null, latencyMs: number } }` | 200 / 401 |

Notas:
- Ambos endpoints devuelven HTTP 200 incluso cuando `connected: false` — un fallo de conexión a Issabel es un **resultado** válido de la verificación, no un error del propio endpoint (R7). El único caso de error HTTP es la falta de sesión (401, R2/R6).
- `POST /api/pbx/sync` no requiere body; cualquier payload enviado se ignora.
- No se usa `requireAdmin`: cualquier usuario autenticado (`admin` u `operador`) puede ver el estado y disparar una verificación manual — es información de monitoreo, no de administración, consistente con `/api/calls/today` y `/api/events` (ambos `requireAuth`).

---

## 2. Cambios BD SQLite

**No se requieren tablas nuevas.** El estado de conexión (`connected`, `lastCheck`, `lastError`, `latencyMs`) es efímero por naturaleza — refleja "¿puedo hablar con Issabel ahora mismo?", no un histórico que deba sobrevivir a un reinicio del proceso. Se mantiene en memoria (variable de módulo dentro del servicio, ver §6).

Esto es coherente con el alcance de los criterios de aceptación de la feature 14, que no piden histórico de health checks ni una pantalla de "histórico de caídas" (eso correspondería, si se necesitara en el futuro, a la feature `alerts_monitoring` vía `alert_rules`/`alerts`, ya contempladas en `docs/architecture.md` para el tipo `pbx_disconnect`).

Si en una iteración futura se requiere persistir un histórico de caídas/recuperaciones, podría añadirse una tabla `pbx_health_log` (`id`, `connected`, `checked_at`, `error`, `latency_ms`) — explícitamente fuera de alcance de esta feature y no se crea aquí.

---

## 3. Queries CDR nuevas

No aplica una query CDR de negocio. La única interacción con la BD de Issabel es una verificación de conectividad de solo lectura:

```sql
SELECT 1
```

- Sin parámetros, no toca la tabla `cdr` ni ninguna otra tabla — verifica únicamente que el pool MySQL puede abrir una conexión y ejecutar una consulta trivial (mismo patrón que el chequeo de arranque existente en `server.js`: `await pool.query('SELECT 1')`, línea ~262).
- Cumple R21: no depende de la existencia/contenido de `cdr` ni de ninguna tabla específica.

---

## 4. Dependencias npm nuevas

**Ninguna.** Justificación:

- La verificación de conexión usa `pool.query('SELECT 1')`, ya disponible vía `mysql2/promise` (dependencia existente).
- El timeout de la verificación (R9) se implementa con `Promise.race` / `AbortController` nativo de Node.js — no requiere una librería de timeouts adicional.
- El evento SSE `pbx_status` reutiliza `broadcast()`, ya existente.
- La notificación toast en frontend (R16/R17) se implementa como un componente propio (`Toast.jsx` o equivalente, ver §5.3) usando React + Tailwind + `lucide-react` (iconos), todos ya instalados. No se añade `react-hot-toast`, `sonner` ni librerías equivalentes — consistente con la regla "Dependencias nuevas sin justificación en la spec" y con que el proyecto no tiene actualmente ninguna librería de toast.
- El indicador de estado (punto verde/rojo) usa solo Tailwind + `lucide-react` (p. ej. icono `Wifi`/`WifiOff` o `Circle`), sin dependencias nuevas.

---

## 5. Componentes frontend

### 5.1 `frontend/src/components/PbxStatus.jsx`

Componente nuevo, montado dentro de `Layout.jsx` (visible en toda pantalla autenticada, R14).

- **Estado inicial (R15):** al montar, llama a `api.pbxHealth()` (`GET /api/pbx/health`) y guarda `{ connected, lastCheck, lastError, latencyMs }` en estado local.
- **Actualización en tiempo real:** se suscribe a los eventos `pbx_status` del canal SSE existente (ver §5.2 — extensión de `useSSE.js`). Cuando llega un evento `pbx_status`, actualiza su estado con el payload recibido.
- **Render:**
  - Punto/badge verde + texto "PBX conectado" cuando `connected: true`.
  - Punto/badge rojo + texto "PBX desconectado" cuando `connected: false`, con tooltip o texto secundario mostrando `lastError`.
  - Estado neutro/gris ("Verificando…") mientras la carga inicial está pendiente o si `GET /api/pbx/health` falla a nivel de red/HTTP (R19) — nunca se asume "conectado" por defecto.
- **Sincronización manual (R18):** un botón/ícono (p. ej. `RefreshCw` de `lucide-react`) que llama a `api.pbxSync()` (`POST /api/pbx/sync`), muestra un estado de carga (ícono girando / disabled) mientras está pendiente, y al resolver actualiza el estado local con la respuesta — sin esperar necesariamente al próximo evento SSE.
- **Detalle expandible (opcional, no bloqueante para los criterios):** al pasar el cursor o hacer click sobre el indicador, puede mostrarse `lastCheck` (formateado) y `latencyMs` — mejora de UX, no requerida explícitamente por `feature_list.json`, pero coherente con los datos ya disponibles en R1.

Ubicación sugerida dentro de `Layout.jsx`: en la barra lateral, cerca del bloque de usuario (footer del `<aside>`), o en una barra superior si se prefiere — cualquiera de las dos cumple R14 ("visible en toda pantalla autenticada"); se deja la posición exacta a criterio del implementer dado que `Layout.jsx` actualmente no tiene una barra superior separada.

### 5.2 `frontend/src/hooks/useSSE.js` — extensión

Añadir manejo del evento `pbx_status`, siguiendo el mismo patrón que `init`/`update`:

```js
es.addEventListener('pbx_status', (e) => {
  const data = JSON.parse(e.data);
  onPbxStatus?.(data);
});
```

- Se añade el callback opcional `onPbxStatus` a la firma de `useSSE(url, { onInit, onUpdate, onPbxStatus })`, sin alterar el comportamiento de `onInit`/`onUpdate` existentes (R20 — no rompe `Dashboard.jsx`, que usa `useSSE` hoy y no pasará `onPbxStatus`).
- `PbxStatus.jsx` necesita acceso al mismo `EventSource` que ya usa `Dashboard.jsx`/`HistoricalView.jsx` (vía `useSSE`). Para evitar abrir una segunda conexión SSE (cada `useSSE(url)` abre su propio `EventSource`), `PbxStatus.jsx`, al vivir en `Layout.jsx` (que envuelve todas las rutas autenticadas vía `<Outlet/>`), es el lugar natural para una **única** instancia de `useSSE('/api/events', { onPbxStatus })` compartida a nivel de layout. Ver decisión técnica §6.3 para el detalle de cómo se evita duplicar conexiones SSE.

### 5.3 `frontend/src/components/Toast.jsx` (nuevo, genérico)

Componente de notificación tipo "toast" minimalista, reutilizable:

- Props: `message` (string), `type` (`'error' | 'success' | 'info'`), `onClose` (función).
- Renderiza una notificación flotante (posición fija, esquina, Tailwind `fixed bottom-4 right-4`), con auto-dismiss tras unos segundos (p. ej. `setTimeout` configurable, default ~5 s) y botón de cierre manual.
- Usado por `PbxStatus.jsx` para R16 (conectado → desconectado: toast `type="error"`) y opcionalmente R17 (desconectado → conectado: toast `type="success"`).
- No sustituye los banners inline de error/éxito ya usados en `ChannelAliasManager.jsx`/`UserManagement.jsx`/`SystemConfig.jsx` (esos siguen igual); este componente es específico para notificaciones "push" no asociadas a una acción del usuario en pantalla (cumple "Mensajes de error: toast o banner inline; nunca `alert()`" de `docs/conventions.md`, cubriendo el caso "toast").

### 5.4 `frontend/src/api.js` — nuevas funciones

```js
pbxHealth: ()  => req('GET',  '/api/pbx/health'),
pbxSync:   ()  => req('POST', '/api/pbx/sync'),
```

### 5.5 Navegación

No se añade ninguna ruta nueva ni entrada de sidebar — `PbxStatus.jsx` es un indicador persistente dentro de `Layout.jsx` (no una pantalla independiente), por lo que no requiere cambios en `App.jsx` ni en la sección `<nav>` de `Layout.jsx`.

---

## 6. Decisión técnica clave

### 6.1 Cómo se determina "connected"

**Opción elegida:** `pool.query('SELECT 1')` con un timeout acotado (p. ej. 5 s, vía `Promise.race` contra un `setTimeout` que rechaza), envuelto en `try/catch`:
- Éxito → `connected: true`, `lastError: null`, `latencyMs` = tiempo medido.
- Excepción o timeout → `connected: false`, `lastError: <mensaje descriptivo>` (mensaje de la excepción de `mysql2`, o `'Timeout al verificar la conexión'` si fue el timeout), `latencyMs` = tiempo transcurrido hasta el fallo/timeout.

**Alternativa descartada — verificar mediante `fetchData()`/`queryStats` (consultar `cdr`):** se descarta porque (a) introduce dependencia de la tabla `cdr` y de rangos de fecha para algo que es puramente "¿hay conexión?" (viola R21 — la verificación no debe depender del contenido de ninguna tabla), (b) es una operación más costosa (joins/agregaciones) que puede ella misma degradar el ciclo de polling existente (viola R22), y (c) `SELECT 1` es exactamente el mismo chequeo que ya usa `server.js` en el arranque (línea ~262), manteniendo consistencia.

**Alternativa descartada — `pool.getConnection()` + `connection.ping()`:** funcionalmente equivalente a `SELECT 1` pero requiere gestión manual de `release()` de la conexión; `pool.query('SELECT 1')` ya gestiona la conexión internamente y es más simple. Sin diferencia práctica, se prefiere la forma más simple.

### 6.2 Integración con el polling SSE existente sin duplicar timers

**Opción elegida:** un `setInterval` **propio** del servicio `pbxHealthService`, con su propio intervalo (p. ej. configurable, default razonable como 15 s — más frecuente que `pollIntervalMs` de 30 s, ya que detectar una caída de PBX rápidamente es el objetivo de la feature, y `SELECT 1` es una operación mucho más barata que `fetchData()`). Este timer es completamente independiente del `setInterval` de `/api/events` (línea ~474 de `server.js`):
- No se modifica el `setInterval` existente de `fetchData`/`broadcast('update', ...)`.
- El nuevo timer del servicio de salud llama a `broadcast('pbx_status', ...)` **solo cuando el estado cambia** (R11/R12), por lo que no compite en frecuencia ni en payload con los eventos `update`.
- Ambos timers comparten el mismo `pool` MySQL (un pool con `connectionLimit: 10` soporta ambos sin contención perceptible) y la misma función `broadcast`.

**Alternativa descartada — verificar la conexión dentro del `setInterval` existente de `/api/events`:** se descarta porque (a) acoplaría dos responsabilidades distintas en un único bloque (viola R22 — un fallo lento de `SELECT 1` retrasaría `fetchData`/`update` si se ejecutaran secuencialmente, o complicaría el código si se paralelizan dentro del mismo bloque sin necesidad), y (b) el intervalo deseado para detectar caídas (más frecuente) es distinto del intervalo de actualización de datos (`pollIntervalMs`, configurable por el usuario para otro propósito). Mantenerlos separados respeta el principio de "una responsabilidad por timer" y permite ajustar cada frecuencia de forma independiente en el futuro sin tocar la otra.

### 6.3 Evitar una segunda conexión SSE en el frontend

**Opción elegida:** `Layout.jsx` (que ya envuelve todas las rutas autenticadas vía `<Outlet/>` y se monta una sola vez por sesión de navegación) es el único lugar que instancia `useSSE('/api/events', { onPbxStatus })` para `PbxStatus.jsx`. `Dashboard.jsx`/`HistoricalView.jsx` siguen teniendo su propia llamada a `useSSE` para `init`/`update` tal como hoy (no se modifica su comportamiento, R20) — esto significa que, mientras el usuario esté en `/` o `/historical`, **podrían coexistir dos conexiones `EventSource`** al mismo endpoint `/api/events` (una desde `Layout.jsx`, otra desde el componente de la ruta activa).

Esto se considera **aceptable** porque:
- `/api/events` ya soporta múltiples clientes concurrentes (`sseClients` es un `Set`, diseñado para N clientes).
- El coste de una conexión SSE adicional por pestaña de navegador es mínimo comparado con la complejidad de introducir un *context provider* global de SSE compartido (que tocaría `App.jsx` y todos los componentes que ya usan `useSSE`, ampliando innecesariamente el alcance de esta feature y el riesgo de regresión sobre `Dashboard.jsx`/`HistoricalView.jsx`, cuyo comportamiento debe permanecer intacto por R20).

**Alternativa descartada — `SSEContext` global compartido:** técnicamente más "limpio" (una sola conexión SSE para toda la app), pero requiere refactorizar `Dashboard.jsx` y `HistoricalView.jsx` para consumir el contexto en lugar de su `useSSE` actual — esto es un refactor de componentes existentes fuera del alcance de "añadir, no reescribir lo que ya funciona" (`CLAUDE.md`). Queda documentado como posible mejora futura si el número de conexiones SSE concurrentes llega a ser un problema real de recursos del servidor.

### 6.4 Estado en memoria vs. variable capturada por valor (`dbOk`)

**Observación:** el `dbOk` actual de `server.js` se calcula **una sola vez** al arrancar (línea ~260-268) y se pasa por valor a routers como `reportsRouter` — nunca se actualiza después, aunque la conexión se recupere o se pierda más tarde. Esta feature **no depende de ese `dbOk`** ni lo modifica (evita romper `reportsRouter`, R20).

**Opción elegida:** `pbxHealthService` mantiene su propio estado mutable en memoria (objeto `{ connected, lastCheck, lastError, latencyMs }` dentro de un closure/módulo), actualizado por su propio timer (§6.2) y por `POST /api/pbx/sync`. `routes/pbx.js` simplemente lee/dispara este estado a través de funciones expuestas por el servicio (`getStatus()`, `checkNow()`). No se reutiliza ni se modifica la variable `dbOk` existente.

**Nota para R23 (incluir estado PBX en `init`):** el handler de `/api/events` (línea ~445-470) puede llamar a `pbxHealthService.getStatus()` (síncrono, lee el estado en memoria, sin I/O) y añadir el resultado al payload `init` existente bajo una clave nueva, p. ej. `pbxStatus`, sin alterar las claves ya existentes en `fetchData()` (R20).

---

## 7. Compatibilidad v1.0

- `GET /api/calls/today`, `GET /api/calls/range` — sin cambios; no se modifican `fetchData`, `queryStats`, `queryChannels`, `queryHourly`, `queryQueues`, `extractChannel`, `passesFilter`, `todayRange`, `toMySQLDate`.
- `GET /api/events` — el `setInterval` existente (`pollMs`, broadcast `update`) no se modifica. Únicamente se añade, dentro del handler de conexión (`init`), una clave adicional `pbxStatus` al payload ya enviado (R23) — payload aditivo, no se elimina ni renombra ninguna clave existente.
- `sseClients` / `broadcast(event, data)` — reutilizados sin modificación de firma; `pbx_status` es simplemente un nuevo valor de `event` entre los ya soportados (`init`, `update`).
- `backend/db/setup.js` — sin cambios (§2: no se añaden tablas).
- `dbOk` — sin cambios; no se lee ni se escribe desde esta feature (§6.4).
- `frontend/src/hooks/useSSE.js` — extensión aditiva (`onPbxStatus` opcional); `Dashboard.jsx`, `HistoricalView.jsx` y cualquier otro consumidor actual de `useSSE` siguen funcionando idénticamente sin pasar el nuevo callback.
- `frontend/src/components/Layout.jsx` — solo se añade el componente `PbxStatus.jsx` dentro del layout existente; no se modifica `<nav>`, rutas, ni la lógica de `appName`/logout ya presente.
- `frontend/src/App.jsx` — sin cambios (no hay rutas nuevas, §5.5).
- Patrón factory `(pool, config, db, requireAuth, ...)` — `routes/pbx.js` sigue el mismo patrón que `routes/config.js`/`routes/reports.js` (factory que recibe dependencias explícitas, incluyendo `broadcast`).
- Ningún endpoint nuevo (`/api/pbx/health`, `/api/pbx/sync`) colisiona con rutas existentes (`/api/admin/*`, `/api/calls/*`, `/api/stats/*`, `/api/reports/*`, `/api/events`, `/api/auth/*`, `/api/config/*`).
