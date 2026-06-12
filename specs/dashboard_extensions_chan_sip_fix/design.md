# design.md — dashboard_extensions_chan_sip_fix

> Feature ID: 19 | Revisión: 2026-06-12
>
> Corrección acotada de `dashboard_extensions_status` (#18, `done`). Cambia
> únicamente: la acción AMI usada por `amiExtensionsService.js`, el parseo de
> sus eventos, y añade un filtro extensión-vs-troncal. **No** se tocan
> `routes/pbx.js`, `server.js`, el contrato del endpoint REST, ni ningún
> componente frontend.

---

## 1. Endpoints nuevos

**Ninguno.** `GET /api/pbx/extensions` (definido en `routes/pbx.js`, feature
#18) no cambia: misma ruta, mismo middleware (`requireAuth`), mismo payload de
entrada/salida (`{ ok: true, data: { total, active, extensions: [{extension,
status}], available } }`), mismos códigos HTTP (200/401). Ver
`specs/dashboard_extensions_status/design.md §1`, que sigue siendo la
referencia vigente.

---

## 2. Cambios BD

**Ninguno.** Sigue sin haber tablas SQLite nuevas/modificadas (sin cambios a
`specs/dashboard_extensions_status/design.md §2.1`) y sin queries CDR nuevas
(la fuente de datos sigue siendo AMI sobre TCP, no MySQL — R19).

### 2.1 `config.example.json` / documentación del bloque `ami`

No se añade ningún campo nuevo al bloque `ami` (sigue siendo `{ host, port,
username, password }`, igual que en #18). Se añade **documentación** junto al
bloque, indicando el permiso AMI requerido para que `SIPpeers` funcione.

Dado que `config.example.json` es JSON estricto (sin comentarios reales), la
documentación se incorpora de una de estas dos formas — el implementer elige
la más simple de mantener:

- **Opción A (preferida):** un comentario en el archivo Markdown más cercano
  que ya documenta la configuración (p.ej. `docs/architecture.md` o un bloque
  de comentarios en el propio `backend/config.example.json` si el parser de
  configuración tolera claves adicionales tipo `_comment` — **no** usar
  `_comment` si rompe la validación de "no faltan host/port/username/password"
  del servicio; verificar antes).
- **Opción B (más simple y robusta):** añadir el requisito como anotación en
  el `README`/comentario de cabecera del archivo `backend/config.example.json`
  si el formato lo permite, o como nota en
  `specs/dashboard_extensions_status/design.md §2.2` (que ya describe el
  bloque `ami`) mediante un comentario en `tasks.md` de esta feature que el
  implementer materialice como comentario adyacente en el archivo de
  configuración real usado por el administrador (p.ej. un archivo
  `backend/config.example.json` con una clave hermana de solo documentación,// o un README junto al bloque, a discreción del implementer siempre que no
  rompa el parseo de `config.json`).

Contenido textual mínimo a documentar (independientemente del archivo
elegido):

```
El usuario AMI configurado en manager.conf debe incluir la clase
'reporting' en sus permisos de lectura, por ejemplo:

  read = system,call,agent,user,reporting

Sin la clase 'reporting', la acción AMI 'SIPpeers' (usada para el
estado de extensiones) puede fallar o devolver una lista vacía.
```

---

## 3. Dependencias npm

**Ninguna nueva.** `asterisk-manager` (añadida en #18) ya soporta el envío de
cualquier acción AMI mediante `ami.action({ action: '<Nombre>' }, callback)` y
la recepción de eventos arbitrarios vía `ami.on('managerevent', ...)` — el
mismo mecanismo usado para `PJSIPShowEndpoints`/`EndpointList` sirve sin
cambios para `SIPpeers`/`PeerEntry`.

---

## 4. Lógica no obvia

### 4.1 Cambio de acción AMI: `PJSIPShowEndpoints` → `SIPpeers`

En `backend/services/amiExtensionsService.js`, función `queryEndpoints()`
(renombrada conceptualmente a "queryPeers" si el implementer lo prefiere, pero
sin necesidad de cambiar el nombre exportado del módulo ni su API pública
`{ check, getStatus, start }`):

1. Enviar la acción `{ action: 'SIPpeers' }` (en vez de `{ action:
   'PJSIPShowEndpoints' }`).
2. Acumular cada evento `managerevent` cuyo campo `event` (case-insensitive)
   sea `'PeerEntry'` — en vez de `'EndpointList'`.
3. Al recibir el evento `managerevent` cuyo `event` sea
   `'PeerlistComplete'` — en vez de `'EndpointListComplete'` — resolver la
   promesa con la lista acumulada.
4. El manejo de error del callback de `ami.action(...)`, el `Promise.race`
   con `timeoutMs` (R13/R25), y el `cleanup()` (`removeListener`) **no
   cambian** — mismo patrón estructural que #18.

### 4.2 Mapeo de campos `PeerEntry` → `{ extension, status }` (R22)

Cada evento `PeerEntry` de `SIPpeers` trae (entre otros) los campos
`ObjectName` y `Status`. `asterisk-manager` entrega las claves del evento en
minúsculas (igual que en #18, donde se leía `evt.objectname`/`evt.devicestate`).
Por tanto:

- `peerName = evt.objectname` — nombre del peer tal como aparece en `sip show
  peers` (columna `Name/username`, p.ej. `'202'`, `'202/202'`,
  `'ENT_LIWA'`, `'NET2_ENT_6076854970/64638'`). **Nota:** `ObjectName` de
  `SIPpeers` reporta el nombre del peer **sin** el sufijo `/usuario` (a
  diferencia de la columna combinada que muestra `sip show peers` en CLI); el
  implementer debe verificar contra el PBX real/fixture si `ObjectName`
  incluye o no el sufijo, y ajustar el regex de R23 en consecuencia — el
  regex `^\d+$` aplica sobre el nombre del peer *sin* sufijo
  (`ObjectName`), que es el campo correcto a usar.
- `peerStatus = evt.status` (string crudo, p.ej. `'OK (230 ms)'`,
  `'UNKNOWN'`, `'UNREACHABLE'`, `'Unmonitored'`, o ausente/`''`).

### 4.3 Filtro extensión vs. troncal (R23)

```js
const EXTENSION_NAME_RE = /^\d+$/;

// dentro del bucle que procesa cada PeerEntry:
const objectName = evt.objectname || '';
if (!EXTENSION_NAME_RE.test(objectName)) {
  continue; // troncal (p.ej. ENT_LIWA, NET2_ENT_6076854970, VIRTUAL_TRUNK_SALIENTE) — excluida
}
```

Aplica exactamente al campo `ObjectName` (nombre del peer), sin el sufijo
`/usuario` si lo tuviera (ver nota 4.2). Ejemplos del entorno de producción
del usuario:

| `ObjectName` | ¿Pasa el filtro? | Razón |
|---|---|---|
| `1`, `101`, `201`, `202`, `203`, `204`, `205`, `301` | Sí | Solo dígitos |
| `ENT_LIWA` | No | Contiene letras/guion bajo |
| `NET2_ENT_6076854970` | No | Contiene letras/guion bajo (aunque tenga dígitos) |
| `VIRTUAL_TRUNK_SALIENTE` | No | Contiene letras/guion bajo |

### 4.4 Mapeo de `Status` → `'active'`/`'inactive'` (R24)

```js
const status = (evt.status || '').toUpperCase().startsWith('OK')
  || (evt.status || '').toUpperCase().startsWith('LAGGED')
  ? 'active'
  : 'inactive';
```

Tabla de ejemplos (R24):

| `Status` (crudo) | Normalizado a mayúsculas | Resultado |
|---|---|---|
| `'OK (230 ms)'` | `'OK (230 MS)'` → empieza con `'OK'` | `'active'` |
| `'OK (9 ms)'` | empieza con `'OK'` | `'active'` |
| `'LAGGED (800 ms)'` | empieza con `'LAGGED'` | `'active'` |
| `'UNKNOWN'` | no empieza con `'OK'`/`'LAGGED'` | `'inactive'` |
| `'UNREACHABLE'` | no empieza con `'OK'`/`'LAGGED'` | `'inactive'` |
| `'Unmonitored'` | `'UNMONITORED'`, no coincide | `'inactive'` |
| `''` / ausente | cadena vacía, no coincide | `'inactive'` |

### 4.5 Cálculo de `total`/`active`

Sin cambios respecto a #18: tras filtrar (4.3) y mapear (4.4),

```js
total  = filteredExtensions.length;
active = filteredExtensions.filter(e => e.status === 'active').length;
```

### 4.6 Timeout, caché y tolerancia a fallos (R25)

**Sin cambios respecto a #18** (`specs/dashboard_extensions_status/design.md
§4.1`, ya implementado en `check()`):

- `Promise.race` con `timeoutMs` (default `5000`, configurable vía
  `options.timeoutMs`).
- Éxito → `state = { total, active, extensions, available: true }`,
  `hasSucceededOnce = true`.
- Fallo/timeout → `console.error('[ami] SIPpeers failed:', err.message)` (el
  mensaje de log cambia de `'PJSIPShowEndpoints failed'` a `'SIPpeers
  failed'`, sin exponer credenciales — R20); si `hasSucceededOnce` es `false`,
  `state = { ...EMPTY_STATE }`; si es `true`, se conserva el `state` anterior
  sin modificarlo.
- `getStatus()`, `start(intervalMs)`/`stop()` — **sin cambios**.

### 4.7 Resumen de cambios en `amiExtensionsService.js`

Cambios estrictamente localizados a la función interna de consulta
(`queryEndpoints`/`queryPeers`):

1. `{ action: 'PJSIPShowEndpoints' }` → `{ action: 'SIPpeers' }`.
2. `eventName === 'endpointlist'` → `eventName === 'peerentry'`.
3. `eventName === 'endpointlistcomplete'` → `eventName === 'peerlistcomplete'`.
4. Extracción de campos: `evt.objectname || evt.resource` (extension) +
   `evt.devicestate` (status) → `evt.objectname` (peer name, para filtro y
   para `extension`) + `evt.status` (status crudo, para mapeo).
5. Nuevo paso de filtrado por `EXTENSION_NAME_RE = /^\d+$/` antes de incluir
   el peer en la lista resultante.
6. Nueva lógica de normalización de `status`: `startsWith('OK')` /
   `startsWith('LAGGED')` → `'active'`, resto → `'inactive'` (antes:
   `deviceState !== 'UNAVAILABLE'` → `'active'`).
7. Actualizar el comentario JSDoc de la función (mapeo de campos) para
   reflejar `SIPpeers`/`PeerEntry`/`PeerlistComplete` en lugar de
   `PJSIPShowEndpoints`/`EndpointList`/`EndpointListComplete`.
8. Mensajes de `console.error` que mencionan `PJSIPShowEndpoints` → `SIPpeers`
   (sin cambiar el formato general del log, R20).

**No cambian:** la firma del módulo (`module.exports = function
createAmiExtensionsService(amiConfig, options = {})`), `EMPTY_STATE`,
`DEFAULT_TIMEOUT_MS`, `DEFAULT_INTERVAL_MS`, la validación de `configured`, el
manejo del evento `error` de la conexión AMI, `getStatus()`, `check()` (su
estructura externa: `Promise.race` + try/catch + `hasSucceededOnce`), y
`start()`/`stop()`.

---

## 5. Componentes frontend

**Ninguno.** `frontend/src/components/Dashboard.jsx`,
`frontend/src/components/Dashboard.test.jsx`, `frontend/src/api.js` y
`frontend/src/hooks/useSSE.js` **no se tocan**. El contrato de
`GET /api/pbx/extensions` (`{ total, active, extensions, available }`) es
idéntico al de #18, por lo que los dos `StatCard` ("Extensiones"/"Activas") y
el polling REST de 30 s ya implementados en #18 siguen funcionando sin
cambios — simplemente ahora `total`/`active` reflejarán datos reales del PBX
chan_sip en lugar de quedarse permanentemente en 0 con `available: false`.

---

## 6. Decisión técnica clave

### 6.1 Actualizar `requirements.md` de #18 in-place vs. crear delta en `specs/dashboard_extensions_chan_sip_fix/`

**Opción elegida:** crear `specs/dashboard_extensions_chan_sip_fix/{requirements,design,tasks}.md`
describiendo **solo el delta** respecto a #18.
`specs/dashboard_extensions_status/requirements.md` (R1-R20) **queda intacto,
sin modificar**.

**Alternativa descartada — editar in-place `specs/dashboard_extensions_status/requirements.md`:**
se descarta porque:

- (a) R1-R2, R5-R20 de #18 **no cambian de contrato** — solo R3/R4 cambian de
  *mecanismo interno* (qué acción AMI y qué eventos). Reescribir el documento
  de #18 obligaría a reabrir y re-revisar ~20 requisitos ya aprobados y
  trazados en tests existentes, sin beneficio: el riesgo de introducir
  inconsistencias en la trazabilidad `R<n>` ↔ `it(...)` existente (`R1`-`R20`
  ya nombrados en `ami.test.js`) es mayor que el de mantener dos documentos.
- (b) El historial de revisión (`> Revisión: 2026-06-12` de #18, ya `done` y
  con commit propio) se preserva como registro de lo que el `reviewer`
  aprobó originalmente; una corrección posterior con su propio spec
  (`dashboard_extensions_chan_sip_fix`) es más auditable — coincide con el
  patrón "Correcciones post-review" ya usado dentro de
  `specs/dashboard_extensions_status/tasks.md` (T11-T13), que tampoco reescribió
  `requirements.md` de #18.
- (c) Es coherente con la regla del proyecto de "no reescribir lo que ya
  funciona" (`CLAUDE.md`): #18 está `done`; esta es una feature `pending`
  independiente (#19) con su propio ciclo spec → aprobación → implementación.

Esta feature **añade** R21-R26 (nuevos, en
`specs/dashboard_extensions_chan_sip_fix/requirements.md`) y **deja sin
cambios** R1-R20 de #18. Los tests existentes nombrados `R1`-`R20` en
`ami.test.js` permanecen válidos como trazabilidad de #18; los nuevos tests
de esta feature se nombran `R21`-`R26` (más R10/R11/R13/R20 reutilizados donde
aplique, ver `tasks.md`).

### 6.2 `SIPpeers`/`PeerEntry`/`PeerlistComplete` vs. mantener `PJSIPShowEndpoints` con fallback

**Opción elegida:** sustituir completamente `PJSIPShowEndpoints` por
`SIPpeers`, sin intentar detectar dinámicamente si el PBX es PJSIP o chan_sip.

**Alternativa descartada — detectar el tipo de PBX y usar la acción
correspondiente (PJSIP o chan_sip) según disponibilidad:** se descarta porque
(a) añade complejidad de detección (¿cómo se determina de forma fiable y
barata si `PJSIPShowEndpoints` existe, sin generar un error AMI adicional en
cada ciclo?); (b) el entorno de producción confirmado del usuario es chan_sip
puro (`pjsip show endpoints` → "No such command"); (c) no hay ningún PBX PJSIP
real en uso por este proyecto que requeriría mantener ambas rutas; (d) si en
el futuro se necesitara soporte dual, sería una feature nueva y explícita, no
una heurística oculta en el servicio actual. Se prioriza simplicidad y
corrección para el entorno real sobre una generalización especulativa.

### 6.3 Filtro por regex `^\d+$` sobre `ObjectName` vs. lista blanca/negra configurable

**Opción elegida:** filtro fijo por regex `^\d+$` sobre el campo `ObjectName`
de cada `PeerEntry`, sin añadir configuración nueva.

**Alternativa descartada — lista de prefijos/patrones de troncales
configurable en `config.json`:** se descarta porque (a) los criterios de
aceptación de la feature (ya decididos con el humano, no reabribles) son
explícitos: "Solo se cuentan como 'extensión' los peers cuyo ObjectName es
puramente numérico (regex `^\d+$`)"; (b) añadir un campo de configuración
nuevo no está entre los criterios aceptados y el contexto del problema indica
explícitamente "no se añade campo nuevo a config.ami"; (c) la heurística
numérica cubre exactamente los ejemplos reales de producción
(`1, 101, 201, 202, 203, 204, 205, 301` vs. `ENT_LIWA,
NET2_ENT_6076854970, VIRTUAL_TRUNK_SALIENTE`) sin necesidad de mantenimiento
manual de listas.

---

## 7. Compatibilidad v1.0 / compatibilidad con #18

- **Contrato del endpoint `GET /api/pbx/extensions`** — sin cambios: misma
  ruta, auth (`requireAuth`), forma de respuesta
  (`{ ok: true, data: { total, active, extensions: [{extension, status}],
  available } }`), códigos HTTP (200/401), y semántica de `available`
  (R7-R10 de #18, sin cambios).
- **`routes/pbx.js`** — sin cambios. La firma del factory
  (`pbxRouter(pool, config, db, requireAuth, broadcast, pbxHealthService,
  amiExtensionsService)`) y el handler `GET /pbx/extensions` (que solo llama a
  `amiExtensionsService.getStatus()`) no se modifican.
- **`server.js`** — sin cambios. La instanciación de
  `createAmiExtensionsService(config.ami)` y `amiExtensionsService.start(30_000)`
  no cambian (misma firma del factory, mismo bloque `config.ami`).
- **`config.json`/`config.example.json`** — el bloque `ami` (`host`, `port`,
  `username`, `password`) no cambia de forma; solo se añade documentación
  sobre el permiso `reporting` (§2.1). Si `ami` está ausente, el comportamiento
  sigue siendo idéntico (R2/R9 de #18, sin cambios).
- **Frontend** — sin cambios (§5). `Dashboard.jsx`, `Dashboard.test.jsx`,
  `api.js`, `useSSE.js` no se tocan; `npm run build` (frontend) y `npm test`
  (vitest, frontend) deben seguir en verde sin modificación alguna.
- **Otros endpoints** (`/api/calls/today`, `/api/calls/range`, `/api/events`,
  `/api/pbx/health`, `/api/pbx/sync`, `/api/admin/extensions*`) — sin cambios,
  no se tocan (R18 de #18, reafirmado por R25 de esta feature).
- **`asterisk-manager`** — misma versión, sin cambios de dependencia (§3).
- **Tests de #18 nombrados `R1`-`R20`** en `backend/tests/ami.test.js` — los
  que dependían del mapeo `EndpointList`/`EndpointListComplete`/`DeviceState`
  (R3/R4/R5 — específicamente los tests de `describe('amiExtensionsService.check()
  - consulta exitosa (R3/R4/R5)')`) se **reemplazan** por equivalentes basados
  en `PeerEntry`/`PeerlistComplete`/`Status`, manteniendo los mismos nombres
  `R<n>` donde el contrato no cambió (p.ej. R5 "solo lectura" sigue siendo
  válido con `SIPpeers`). Los tests R1/R2/R6-R20 que no dependen del mapeo de
  campos específico (p.ej. R8 — 401 sin sesión, R9 — no configurado, R18 —
  no-regresión de `/api/calls/today`/`/api/pbx/health`) permanecen sin cambios.
