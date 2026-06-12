# tasks.md — dashboard_extensions_chan_sip_fix

> Feature ID: 19 | Orden de implementación | Revisión: 2026-06-12
>
> Corrección acotada de `dashboard_extensions_status` (#18, `done`). Checklist
> corto: cambia la acción AMI, el parseo de eventos y añade el filtro
> extensión-vs-troncal en `amiExtensionsService.js`; actualiza tests y
> documentación de configuración. No se tocan `routes/pbx.js`, `server.js` ni
> el frontend.

El implementer sigue estas tareas en orden. Marca `[x]` al completar cada una.

---

- [x] **T1. Modificar `backend/services/amiExtensionsService.js` — acción AMI y parseo de eventos (R21, R22)**
  - Cambiar la acción enviada de `{ action: 'PJSIPShowEndpoints' }` a
    `{ action: 'SIPpeers' }` (`design.md §4.1/§4.7.1`).
  - Cambiar la detección de eventos: `eventName === 'endpointlist'` →
    `eventName === 'peerentry'`; `eventName === 'endpointlistcomplete'` →
    `eventName === 'peerlistcomplete'` (`design.md §4.7.2-3`).
  - Cambiar la extracción de campos: leer `evt.objectname` (nombre del peer)
    y `evt.status` (estado crudo chan_sip) en lugar de
    `evt.objectname || evt.resource` + `evt.devicestate`
    (`design.md §4.2, §4.7.4`).
  - Actualizar el JSDoc de la función de consulta para describir el mapeo
    `PeerEntry`/`PeerlistComplete`/`Status` en lugar de
    `EndpointList`/`EndpointListComplete`/`DeviceState` (`design.md §4.7.7`).
  - Actualizar los mensajes de `console.error` (`'[ami] PJSIPShowEndpoints
    failed:'` → `'[ami] SIPpeers failed:'`), sin exponer credenciales
    (`design.md §4.6, §4.7.8`, R20 de #18 reafirmado).
  - No cambiar: firma del módulo, `EMPTY_STATE`, `DEFAULT_TIMEOUT_MS`,
    `DEFAULT_INTERVAL_MS`, validación de `configured`, manejo del evento
    `error`, estructura de `check()` (`Promise.race`, try/catch,
    `hasSucceededOnce`), `getStatus()`, `start()`/`stop()`.

- [x] **T2. Añadir filtro extensión-vs-troncal (R23)**
  - Definir `const EXTENSION_NAME_RE = /^\d+$/;` cerca de las demás
    constantes del módulo.
  - En el procesamiento de cada evento `PeerEntry`, si `evt.objectname` no
    coincide con `EXTENSION_NAME_RE`, descartar el peer (no incluirlo en la
    lista que alimenta `extensions`/`total`/`active`) — `design.md §4.3`.
  - Verificar contra los ejemplos de producción del contexto: `1, 101, 201,
    202, 203, 204, 205, 301` pasan el filtro; `ENT_LIWA,
    NET2_ENT_6076854970, VIRTUAL_TRUNK_SALIENTE` se excluyen.

- [x] **T3. Añadir mapeo de `Status` → `'active'`/`'inactive'` (R24)**
  - Reemplazar la lógica `deviceState !== 'UNAVAILABLE' ? 'active' :
    'inactive'` por: `status: 'active'` si `(evt.status || '').toUpperCase()`
    empieza con `'OK'` o con `'LAGGED'`; `'inactive'` en cualquier otro caso
    (incluye `UNKNOWN`, `UNREACHABLE`, `Unmonitored`, ausente/vacío) —
    `design.md §4.4`.
  - `total`/`active` se calculan igual que en #18, pero sobre la lista ya
    filtrada por T2 (`design.md §4.5`).

- [x] **T4. Actualizar `backend/tests/ami.test.js` (R21-R26, más R5/R10/R11/R13/R18/R19/R20 reutilizados)**
  - Reemplazar los helpers `mockSuccessfulQuery`/`mockFailingQuery`/
    `mockHangingQuery` y sus usos para emitir eventos `PeerEntry`
    (`{ event: 'PeerEntry', objectname, status }`) seguidos de
    `{ event: 'PeerlistComplete' }`, y verificar que la acción enviada es
    `{ action: 'SIPpeers' }`.
  - Sustituir el `describe('amiExtensionsService.check() - consulta exitosa
    (R3/R4/R5)')` por un equivalente nombrado con R21/R22/R5:
    - `it('R21/R22 - envía la acción SIPpeers y parsea PeerEntry/PeerlistComplete a { extension, status }')`.
  - Escribir `it('R23 - excluye peers con ObjectName no puramente numérico
    (troncales)')`: mezcla de peers numéricos (`'202'`, `'301'`) y no
    numéricos (`'ENT_LIWA'`, `'NET2_ENT_6076854970'`,
    `'VIRTUAL_TRUNK_SALIENTE'`) → `total`/`active`/`extensions` solo reflejan
    los numéricos.
  - Escribir `it('R24 - clasifica status OK/LAGGED como active y
    UNKNOWN/UNREACHABLE/Unmonitored/ausente como inactive')`: casos
    parametrizados cubriendo `'OK (230 ms)'`, `'OK (9 ms)'`, `'LAGGED (800
    ms)'` → `'active'`; `'UNKNOWN'`, `'UNREACHABLE'`, `'Unmonitored'`, `''`/ausente
    → `'inactive'`.
  - Actualizar/reescribir los tests de fallo (R10/R11/R13, antes basados en
    `PJSIPShowEndpoints`) para que el mock falle/cuelgue en la acción
    `SIPpeers`; verificar que el comportamiento (estado conservado o vacío,
    `console.error` sin credenciales) es idéntico — renombrar a `R25` donde
    el test cubra específicamente el delta (p.ej.
    `it('R25 - fallo de SIPpeers sin éxito previo mantiene el estado vacío')`),
    manteniendo además los nombres `R10`/`R11`/`R13`/`R20` ya existentes si el
    test sigue siendo una instancia directa de esos requisitos de #18.
  - Los tests `R1`/`R2`/`R6`/`R7`/`R8`/`R9`/`R12`/`R18`/`R19` (no dependen del
    mapeo de campos específico de la acción AMI) **no requieren cambios** —
    confirmar que siguen pasando sin modificación.
  - No añadir tests que dependan de una conexión AMI real.

- [x] **T5. Documentar el permiso `reporting` requerido (R26)**
  - Añadir, junto al bloque `ami` de `backend/config.example.json` (o en el
    archivo Markdown más cercano que documente dicho bloque, según
    `design.md §2.1`), el texto:
    ```
    El usuario AMI configurado en manager.conf debe incluir la clase
    'reporting' en sus permisos de lectura, por ejemplo:

      read = system,call,agent,user,reporting

    Sin la clase 'reporting', la acción AMI 'SIPpeers' (usada para el
    estado de extensiones) puede fallar o devolver una lista vacía.
    ```
  - No añadir ningún campo nuevo a `ami` (`host`/`port`/`username`/`password`
    sin cambios). No modificar ningún otro bloque de
    `config.example.json`.
  - No modificar `backend/config.json` real (gitignored).

- [x] **T6. Verificación final**
  - `cd backend && npm test` → todos los tests verdes, incluyendo
    `ami.test.js` actualizado y el resto de la suite sin regresiones
    (`pbx.test.js`, `users.test.js`, etc.).
  - `cd frontend && npm run build` → sin errores (sin cambios esperados, solo
    confirmar que nada se rompió).
  - `cd frontend && npm test` (vitest) → verde, sin cambios en
    `Dashboard.test.jsx` (confirma que el contrato `{ total, active,
    extensions, available }` sigue siendo compatible).
  - `./init.sh` → verde.
  - Confirmar manualmente (si hay un PBX Issabel/chan_sip de pruebas
    accesible, con el usuario AMI incluyendo `reporting` en `read`):
    `GET /api/pbx/extensions` devuelve `total`/`active` reflejando solo
    peers numéricos, con `status` derivado de `OK`/`LAGGED` vs. el resto, y
    `available: true`.
  - Confirmar manualmente: si el usuario AMI **no** tiene `reporting`, el
    servicio se degrada igual que cualquier otro fallo AMI (estado previo
    conservado o `available: false`), sin romper `/api/calls/today`,
    `/api/events` ni `/api/pbx/health` (R25/R18).
