# progress/current.md — Sesión activa

> Al cerrar la sesión, mover el contenido a progress/history.md y dejar solo esta plantilla.

---

## Estado

Feature #19 `dashboard_extensions_chan_sip_fix` añadida al backlog (`pending`,
`sdd: true`). En proceso de redacción de spec.

## Feature en progreso

#19 `dashboard_extensions_chan_sip_fix` — Corrección de #18
(dashboard_extensions_status): el Issabel de producción usa chan_sip, no
PJSIP. `PJSIPShowEndpoints` no existe ahí ("Invalid/unknown command"),
confirmado por el usuario. La acción AMI correcta es `SIPpeers`
(eventos PeerEntry/PeerlistComplete).

Decisiones tomadas con el humano antes de la spec (basadas en
`sip show peers` real del usuario):
- "Extensión" = peer cuyo ObjectName es puramente numérico (regex `^\d+$`,
  ej. '202', '301'). Peers con nombre (ENT_LIWA, NET2_ENT_..., 
  VIRTUAL_TRUNK_SALIENTE) son troncales y se excluyen de total/active.
- "Activa" = Status empieza con 'OK' o 'LAGGED'. Cualquier otro valor
  (UNKNOWN, UNREACHABLE, Unmonitored, ausente) = inactiva.
- Pendiente en producción (acción del usuario, fuera de código): añadir la
  clase `reporting` a `read` en manager.conf (`read =
  system,call,agent,user,reporting`) + `manager reload`, porque SIPpeers
  requiere esa clase y la config actual del usuario no la tiene.

## Última acción / Próximo paso

`spec_author` completó la spec en `specs/dashboard_extensions_chan_sip_fix/`
(requirements.md R21-R26 como delta sobre #18, design.md, tasks.md T1-T6).
R1-R20 de `dashboard_extensions_status` quedan intactos. Feature #19 pasó a
`status: "spec_ready"` en `feature_list.json`.

**✅ Aprobado por el humano.** Feature #19 pasó a `status: "in_progress"`.
Próximo paso: lanzar `implementer` para ejecutar
`specs/dashboard_extensions_chan_sip_fix/tasks.md` (T1-T6) en orden.

## Implementación #19 (resultado)

`implementer` ejecutó T1-T6 de `specs/dashboard_extensions_chan_sip_fix/tasks.md`
(todas marcadas `[x]`):

- **T1-T3** — `backend/services/amiExtensionsService.js`: acción AMI
  `PJSIPShowEndpoints` → `SIPpeers`; eventos `EndpointList`/`EndpointListComplete`
  → `PeerEntry`/`PeerlistComplete`; campos `evt.objectname`/`evt.status`;
  nuevo `EXTENSION_NAME_RE = /^\d+$/` (R23, filtra troncales no numéricas);
  mapeo `status` = `'active'` si `Status` empieza con `'OK'`/`'LAGGED'`, si no
  `'inactive'` (R24); `console.error('[ami] SIPpeers failed:', ...)` sin
  credenciales (R20). Firma del módulo, `EMPTY_STATE`, timeouts, caché
  (`hasSucceededOnce`), `getStatus()`/`start()`/`stop()` sin cambios.
- **T4** — `backend/tests/ami.test.js`: mocks reescritos a `PeerEntry`/
  `PeerlistComplete`; nuevo `it('R21/R22 - ...')` (sustituye al antiguo
  R3/R4/R5), `it('R23 - excluye peers con ObjectName no puramente numérico
  (troncales)')`, `it('R24 - clasifica status OK/LAGGED como active y
  UNKNOWN/UNREACHABLE/Unmonitored/ausente como inactive')`, y
  `it('R25 - fallo de SIPpeers sin éxito previo mantiene el estado vacío')`
  (renombrado desde el antiguo R10/R11). R1/R2/R5-R13/R18-R20 reutilizados y
  verdes.
- **T5** — `backend/config.example.json`: añadido `"_comment"` dentro del
  bloque `ami` documentando que `manager.conf` necesita la clase `reporting`
  en `read` (`read = system,call,agent,user,reporting`) para que `SIPpeers`
  funcione. No se añadió ningún campo nuevo a `ami`; `config.json` real no se
  tocó.
- **T6 — Verificación**:
  - `cd backend && npm test` → **273/273 passing** (10 suites, incluye
    `ami.test.js` con 23 tests).
  - `cd frontend && npm run build` → sin errores.
  - `cd frontend && npm test` (vitest) → **4/4 passing**, sin cambios.
  - `./init.sh` → **25/25 verde**.
  - No se tocaron `routes/pbx.js`, `server.js`, ni ningún componente
    frontend (`Dashboard.jsx`, `Dashboard.test.jsx`, `api.js`).

Próximo paso: pasar por `reviewer` para validar trazabilidad R21-R26 antes de
marcar #19 como `done` y hacer el commit `feat(dashboard_extensions_chan_sip_fix): ...`.

## Review #19 (veredicto)

**Decisión: ❌ RECHAZADO** (corrección menor, acotada — no requiere reabrir T1-T3).

### Trazabilidad R21-R26

| R<n> | Test | Estado |
|---|---|---|
| R21 | `it('R21/R22 - envía la acción SIPpeers y parsea PeerEntry/PeerlistComplete a { extension, status } y calcula total/active')` (línea 261) | ✅ |
| R22 | mismo test que R21 | ✅ |
| R23 | `it('R23 - excluye peers con ObjectName no puramente numérico (troncales)')` (línea 302) | ✅ |
| R24 | `it('R24 - clasifica status OK/LAGGED como active y UNKNOWN/UNREACHABLE/Unmonitored/ausente como inactive')` (línea 331) | ✅ |
| R25 | `it('R25 - fallo de SIPpeers sin éxito previo mantiene el estado vacío y registra el error sin lanzar excepción')` (línea 365) | ✅ |
| **R26** | **ninguno** | ❌ **FALTA** |

**R26** (documentación del permiso AMI `reporting`) está satisfecho a nivel de
*contenido* — el `_comment` añadido en `backend/config.example.json` (dentro
del bloque `ami`) contiene exactamente el texto especificado en
`design.md`/`tasks.md` T5, y no rompe `configured` (sigue comprobando
`host`/`port`/`username`/`password`, `_comment` es ignorado). Pero
`docs/specs.md` ("Trazabilidad obligatoria") exige que **cada `R<n>` aparezca
nombrado en al menos un test**, y R26 no tiene ningún `it('R26 - ...')`. Al
ser un requisito de documentación pura, basta un test trivial que verifique
que `backend/config.example.json` contiene el bloque `ami._comment` y que
menciona la clase `reporting` (p.ej. cargar el JSON y hacer un `expect(...
.ami._comment).toMatch(/reporting/i)`), o equivalente. **Corrección
solicitada:** añadir ese test (T4 ampliado) antes de re-presentar a review.

### R1-R20 de #18 — ¿hay huecos?

- **R1, R2, R5, R6, R7, R8, R9, R12, R13, R18, R19, R20** — siguen nombrados
  y verdes en `ami.test.js`, sin cambios de fondo. ✅ Sin huecos.
- **R3, R4** — design.md (§6.1, §7) documenta explícitamente que R21
  sustituye el mecanismo de R3 (acción AMI + eventos de listado) y R22
  sustituye el mapeo de campos de R4, preservando el mismo contrato
  observable. El test `R21/R22` cubre el comportamiento equivalente
  (ahora correcto para chan_sip). Esto está **documentado como sustitución
  deliberada** (no es un hueco accidental) — aceptable.
- **R10** — sigue teniendo su propio test nombrado `R10` (línea 379,
  "fallo de consulta tras un éxito previo: conserva el último estado bueno
  conocido"), sin cambios de fondo. ✅ Sin hueco.
- **R11** ("log de fallo + no crashear servidor/SSE/otros endpoints") —
  **no aparece nombrado en ningún test** tras el cambio. El comportamiento
  subyacente (log vía `console.error` + no lanzar excepción) sí se ejerce
  implícitamente dentro de los tests `R10` y `R25`, pero ninguno lo cita
  como `R11`. El propio `design.md` §7 dice que R10/R11/R13/R20 se
  mantienen "donde el test sigue siendo una instancia directa de esos
  requisitos" — R10/R13/R20 lo cumplen, R11 no. **Corrección solicitada:**
  añadir `/R11/` al nombre de uno de los tests existentes que ya cubre su
  contrato (p.ej. renombrar el test de la línea 365 a algo como
  `it('R11/R25 - fallo de SIPpeers sin éxito previo... registra el error
  sin lanzar excepción')`), sin necesidad de lógica nueva.

### Código (`amiExtensionsService.js`)

Confirmado: acción `{ action: 'SIPpeers' }`; eventos `peerentry`/
`peerlistcomplete` (case-insensitive); filtro `EXTENSION_NAME_RE = /^\d+$/`
sobre `evt.objectname` excluye correctamente troncales
(`ENT_LIWA`, `NET2_ENT_...`, `VIRTUAL_TRUNK_SALIENTE`); mapeo de status
`OK`/`LAGGED` (prefijo, case-insensitive vía `.toUpperCase()`) → `'active'`,
resto → `'inactive'`; `Promise.race` + timeout, `hasSucceededOnce`,
`EMPTY_STATE`, `getStatus()`/`start()`/`stop()` sin cambios estructurales;
`console.error('[ami] SIPpeers failed:', err.message)` sin credenciales.
JSDoc actualizado. Todo conforme a `design.md`.

### Alcance del diff

`git status`/`git diff --stat` confirman cambios solo en:
`backend/services/amiExtensionsService.js`, `backend/tests/ami.test.js`,
`backend/config.example.json` (+1 línea, `_comment`), `feature_list.json`
(añade #19 como `in_progress`, no `done` — correcto), `progress/current.md`,
`specs/dashboard_extensions_chan_sip_fix/**` (nuevo). **No** se tocó
`routes/pbx.js`, `server.js` ni nada en `frontend/`. ✅

### Resultados de verificación (ejecutados por el reviewer)

- `cd backend && npm test` → **273/273 passing** (10 suites). ✅
- `cd frontend && npm run build` → sin errores (`vite build` OK, 2320
  módulos). ✅
- `cd frontend && npm test` (vitest) → **4/4 passing**. ✅

### Resumen de correcciones requeridas (antes de re-presentar)

1. Añadir `it('R26 - ...')` en `backend/tests/ami.test.js` que verifique que
   `backend/config.example.json` documenta el permiso `reporting` para
   `SIPpeers` (p.ej. comprobando `config.ami._comment` o el archivo crudo).
2. Renombrar/ampliar el test de la línea 365 (o añadir uno nuevo) para que
   cite explícitamente `R11` junto a `R25`, dejando constancia de que el
   contrato de R11 (#18: log de fallo + no crash) sigue cubierto.

No se requieren cambios en `amiExtensionsService.js`, `config.example.json`
(contenido), specs, ni en el resto de la suite — el diff es correcto y
funcional; solo falta cerrar la trazabilidad documental.

## Correcciones #19 (resultado)

`implementer` aplicó las dos correcciones de trazabilidad solicitadas por el
`reviewer`, ambas acotadas a `backend/tests/ami.test.js` (sin tocar
`amiExtensionsService.js`, `routes/pbx.js`, `server.js` ni `config.example.json`):

- **R11** — renombrado el test de la línea 365 (antes
  `it('R25 - fallo de SIPpeers sin éxito previo mantiene el estado vacío y
  registra el error sin lanzar excepción')`) a
  `it('R11/R25 - fallo de SIPpeers sin éxito previo: se loguea sin crashear y
  mantiene estado vacío')`, sin cambios de lógica — el mismo test ya cubría
  el contrato de R11 (#18: log de fallo vía `console.error` + no lanzar
  excepción).
- **R26** — añadido nuevo `describe`/`it('R26 - el bloque ami de
  config.example.json documenta que manager.conf necesita la clase reporting
  en read para que SIPpeers funcione')` al final de `ami.test.js`. Carga
  `../config.example.json`, comprueba que `ami._comment` existe, es string,
  y matchea `/reporting/i` y `/SIPpeers/i`. El `_comment` existente (sin
  cambios, T5 ya lo había añadido) satisface ambas aserciones.
- Comentario de cabecera del archivo actualizado: "Covers ... R21-R25" →
  "Covers ... R21-R26".

### Verificación

- `cd backend && npx jest tests/ami.test.js` → **24/24 passing** (23 → 24,
  +1 por R26; ninguno duplicado).
- `cd backend && npm test` → **274/274 passing** (10 suites, 273 + 1 nuevo).
- `./init.sh` → **25/25 verde** (incluye build frontend OK).

No se tocó `feature_list.json`, `config.json`, `amiExtensionsService.js`,
`routes/pbx.js`, `server.js` ni `frontend/`. Próximo paso: volver a pasar por
`reviewer` para cerrar la trazabilidad R21-R26 y R1-R20 antes de marcar #19
como `done` y hacer el commit `feat(dashboard_extensions_chan_sip_fix): ...`.

## Review #19 - segunda ronda (veredicto)

**Decisión: ✅ APROBADO**

### Verificación de las dos correcciones solicitadas en la ronda anterior

1. **R26** — `it('R26 - el bloque ami de config.example.json documenta que
   manager.conf necesita la clase reporting en read para que SIPpeers
   funcione')` existe en `backend/tests/ami.test.js` (línea 643, dentro del
   `describe` final del archivo). Verifica algo real: carga
   `../config.example.json` con `require`, comprueba que `ami._comment`
   existe, es `string`, y matchea `/reporting/i` y `/SIPpeers/i`. Confirmado
   en `backend/config.example.json` línea 11: el `_comment` dentro del
   bloque `ami` contiene literalmente "la clase 'reporting'... la accion AMI
   'SIPpeers'", por lo que el test verifica contenido real, no un trivial
   "siempre verdadero". ✅

2. **R11/R25** — el test que antes era solo `it('R25 - fallo de SIPpeers sin
   éxito previo mantiene el estado vacío y registra el error sin lanzar
   excepción')` ahora se llama `it('R11/R25 - fallo de SIPpeers sin éxito
   previo: se loguea sin crashear y mantiene estado vacío')` (línea 365).
   Mismo cuerpo de test (mock de fallo `SIPpeers`, spy de `console.error`,
   `expect(status).toEqual(EMPTY_STATE)`, `expect(consoleErrorSpy).
   toHaveBeenCalled()`) — sin lógica nueva ni duplicada. Cita correctamente
   ambos requisitos (R11 de #18: log + no-crash; R25 de #19: extensión
   explícita de ese contrato al mecanismo SIPpeers). ✅

### Trazabilidad completa R1-R26 en `backend/tests/ami.test.js`

| R<n> | Test | Línea aprox. |
|---|---|---|
| R1 | `R1/R2 - amiConfig undefined...` | 143 |
| R2 | `R1/R2 - amiConfig = {}...` / `R2 - start() es no-op...` | 150, 159 |
| R3, R4 | sustituidos deliberadamente por R21/R22 (documentado en design.md §6.1/§7, aceptado en ronda 1) | — |
| R5 | `R5 - solo se invoca la acción de lectura SIPpeers...` | 288 |
| R6 | `R6 - GET /api/pbx/extensions no dispara una nueva consulta AMI...` | 240 |
| R7 | `R7 - sesión válida y estado available=true devuelve 200...` | 174 |
| R8 | `R8 - sin sesión retorna 401...` | 210 |
| R9 | `R9 - AMI no configurado... devuelve 200 con estado vacío` | 226 |
| R10 | `R10 - fallo de consulta tras un éxito previo: conserva el último estado bueno conocido` | 379 |
| R11 | `R11/R25 - fallo de SIPpeers sin éxito previo...` | 365 |
| R12 | `R12 - start() arranca su propio setInterval...` / `R12 - el setInterval de start() no se reutiliza...` | 479, 533 |
| R13 | `R13 - una consulta que nunca completa se trata como fallo en un tiempo acotado...` | 402 |
| R14-R17 | fuera de `ami.test.js` (corresponden al frontend) — cubiertos en `frontend/src/components/Dashboard.test.jsx` líneas 69/83/97/119, sin cambios en esta feature | — |
| R18 | `R18 - GET /api/calls/today...` / `R18 - GET /api/pbx/health...` | 614, 627 |
| R19 | `R19 - la factory no acepta ni usa pool...` / `R19 - check() no invoca pool.query...` / `R19 - GET /api/pbx/extensions responde usando solo getStatus()...` | 557, 571, 594 |
| R20 | `R20 - getStatus() no contiene username/password...` / `R20 - GET /api/pbx/extensions no expone...` | 423, 449 |
| R21 | `R21/R22 - envía la acción SIPpeers y parsea PeerEntry/PeerlistComplete...` | 261 |
| R22 | mismo test que R21 | 261 |
| R23 | `R23 - excluye peers con ObjectName no puramente numérico (troncales)` | 302 |
| R24 | `R24 - clasifica status OK/LAGGED como active y UNKNOWN/UNREACHABLE/Unmonitored/ausente como inactive` | 331 |
| R25 | `R11/R25 - fallo de SIPpeers sin éxito previo...` | 365 |
| R26 | `R26 - el bloque ami de config.example.json documenta...` | 643 |

Sin huecos. R3/R4 quedan documentados como sustitución deliberada (aceptado en
la ronda anterior, sin cambios en esta ronda). R14-R17 corresponden al
frontend y no se tocaron en esta feature.

### Resultados de verificación (ejecutados por el reviewer)

- `cd backend && npm test` → **274/274 passing** (10 suites, incluye
  `ami.test.js` con 24 tests). ✅
- `./init.sh` → **25/25 checks verdes**, incluye `npm test backend: verde` y
  `build frontend: sin errores` (2320 módulos, `vite build` OK). ✅

### Alcance del diff

Sin cambios adicionales respecto a la ronda 1 más allá de lo solicitado:
`backend/tests/ami.test.js` (rename + nuevo test R26), sin tocar
`amiExtensionsService.js`, `config.example.json` (contenido sin cambios,
ya tenía `_comment` desde T5), `routes/pbx.js`, `server.js` ni `frontend/`.

### Próximo paso

Feature #19 lista para pasar a `done` en `feature_list.json` (no lo hace el
reviewer — corresponde al `leader`/`implementer` según el flujo) y para el
commit `feat(dashboard_extensions_chan_sip_fix): ...`.

## Bloqueos

_Ninguno._
