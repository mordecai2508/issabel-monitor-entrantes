# requirements.md — dashboard_extensions_chan_sip_fix

> Feature ID: 19 | Notación EARS | Revisión: 2026-06-12
>
> Esta feature es una **corrección acotada** de `dashboard_extensions_status`
> (feature #18, `done`). Este documento describe **solo el delta**: qué
> requisitos de `specs/dashboard_extensions_status/requirements.md` cambian de
> implementación (sin cambiar de contrato), y qué requisitos nuevos aparecen.
> `specs/dashboard_extensions_status/requirements.md` **queda intacto, sin
> modificar** — sigue siendo la referencia para R1, R2, R5, R6, R7, R8, R9,
> R10, R11, R12, R13, R14-R20, todos los cuales mantienen su contrato.

---

## Contexto

La feature #18 implementó la consulta de extensiones vía la acción AMI
`PJSIPShowEndpoints` (eventos `EndpointList`/`EndpointListComplete`),
asumiendo un PBX basado en PJSIP. En producción, el Issabel del usuario usa
**chan_sip** (SIP clásico): `PJSIPShowEndpoints` no existe
(`Invalid/unknown command`), por lo que `amiExtensionsService` nunca obtiene
datos y queda permanentemente en `available: false`.

---

## Requisitos modificados (cambian de implementación, no de contrato)

**R21 (sustituye el mecanismo de consulta de R3/R4 de #18).** WHILE the server
is running AND `ami` is configured THE SYSTEM SHALL periodically query the
Asterisk Manager Interface for the list of configured chan_sip peers and their
connectivity status using the AMI action that lists chan_sip peers (emitting
one event per peer followed by a completion event), instead of the PJSIP
endpoint-listing action used previously.

**R22 (refina R4 de #18 — mapeo de campos).** WHEN a chan_sip peer-listing
query completes successfully THE SYSTEM SHALL, for each reported peer, read
its name from the peer-identity field of the per-peer event and its
connectivity indicator from the peer-status field of that same event.

---

## Requisitos nuevos

**R23 (filtro extensión vs. troncal).** WHEN processing the list of peers
returned by a successful chan_sip peer-listing query THE SYSTEM SHALL include
in `total`, `active`, and `extensions` only those peers whose name consists
exclusively of one or more decimal digits (i.e. matches `^\d+$`); peers whose
name contains any non-digit character (e.g. alphabetic names, names with
slashes, or names with underscores — typically representing trunks) SHALL be
excluded from `total`, `active`, and `extensions`.

**R24 (mapeo de estado activo/inactivo).** WHEN classifying a peer that passes
the filter of R23 THE SYSTEM SHALL classify it as `status: 'active'` IF its
connectivity indicator (per R22) begins with `'OK'` or with `'LAGGED'`; THE
SYSTEM SHALL classify it as `status: 'inactive'` for any other value of the
connectivity indicator, including but not limited to `'UNKNOWN'`,
`'UNREACHABLE'`, `'Unmonitored'`, or an absent/empty value.

**R25 (tolerancia a fallos — extensión explícita de R10/R11 de #18 al nuevo
mecanismo).** IF the chan_sip peer-listing query fails (e.g. due to
insufficient AMI permissions, connection error, or timeout) THEN THE SYSTEM
SHALL handle the failure exactly as specified by R10/R11/R13 of #18 (retain
the last known good state if one exists, otherwise the empty/unavailable
state; log the failure; do not throw or crash the server or any other
endpoint/SSE cycle).

**R26 (documentación del permiso AMI requerido).** THE SYSTEM SHALL be
accompanied by documentation (in `config.example.json` and/or an adjacent
comment/README for the `ami` configuration block) stating that the AMI user
configured in `manager.conf` requires the `reporting` class in its `read`
permissions (e.g. `read = system,call,agent,user,reporting`) for the chan_sip
peer-listing query to succeed.

---

## Requisitos de #18 que se mantienen sin cambios de contrato

Los siguientes requisitos de `specs/dashboard_extensions_status/requirements.md`
**no se modifican** — su contrato observable (configuración, forma del
endpoint, manejo de "no configurado", caché, rendimiento, dashboard,
compatibilidad y seguridad) permanece exactamente igual; solo su
implementación interna pasa a depender de R21-R24 en lugar del mecanismo
PJSIP original:

- **R1, R2** — bloque `ami` de configuración y tratamiento de "no configurado".
- **R5** — uso exclusivo de acciones AMI de solo lectura (`SIPpeers` es de
  solo lectura, igual que `PJSIPShowEndpoints`).
- **R6** — respuesta basada en caché en memoria, sin consulta AMI por request.
- **R7** — forma de la respuesta `GET /api/pbx/extensions`
  (`{ total, active, extensions: [{extension, status}], available }`).
- **R8** — 401 sin sesión.
- **R9, R10, R11** — manejo de "no configurado" y de fallos de conexión/consulta.
- **R12, R13** — no bloqueo del ciclo de polling existente y timeout acotado.
- **R14, R15, R16, R17** — indicadores "Extensiones"/"Activas" en el dashboard.
- **R18** — no se modifica el comportamiento de los endpoints existentes
  (`/api/calls/today`, `/api/calls/range`, `/api/events`, `/api/pbx/health`,
  `/api/pbx/sync`).
- **R19** — no se usa el pool MySQL ni se toca `asteriskcdrdb.cdr`.
- **R20** — no se expone usuario/contraseña AMI en respuestas, logs ni errores.
