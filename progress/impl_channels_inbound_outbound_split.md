# Informe de implementación — channels_inbound_outbound_split (feature #20)

## Resumen

Se separó la lista plana `config.channels` (v1.0) en
`config.channels.inbound` / `config.channels.outbound` (v2.0), con migración
automática y persistente al arrancar el backend. Se actualizaron las dos
rutas de filtrado existentes (`passesFilter` + `queryStats/queryChannels/
queryHourly/queryQueues` en `server.js`, y `buildOutboundWhereClause` +
`queryOutbound/queryOutboundExport` en `cdrService.js` + `routes/outbound.js`)
para que `direction='out'` se evalúe de forma **explícita** contra
`channels.outbound` (nunca por exclusión de `inbound`), excluyendo siempre
`Local/...`. El endpoint `/api/admin/channels` ahora anota `direction` por
canal y el frontend (`ChannelAliasManager.jsx`) muestra una columna
"Dirección" con badges Entrante/Saliente.

`backend/config.json` real fue migrado a:
```json
"channels": {
  "inbound": ["SIP/ENT_LIWA", "SIP/NET2_ENT_6076854970"],
  "outbound": ["SIP/SALIENTE_CALL"]
}
```

## Archivos creados

- `backend/tests/passesFilter.test.js` — tests unitarios (mirror) de
  `passesFilter`, `queryChannelsMirror` y forma de respuesta de `fetchData()`.

## Archivos modificados

- `backend/config.example.json` — `channels` → `{ inbound: [], outbound: ["SIP/SALIENTE_CALL"] }`.
- `backend/config.json` — `channels` migrado a `{ inbound: [...], outbound: ["SIP/SALIENTE_CALL"] }` (sin perder `channelAliases` ni otras claves).
- `backend/server.js`:
  - `loadConfig()` (líneas ~55-64): migración array plano → `{inbound, outbound}`, normalización y persistencia condicional.
  - `passesFilter` (líneas 83-97): nueva firma `(channel, inboundChannels, outboundChannels, direction)`.
  - `queryStats`, `queryChannels`, `queryHourly`, `queryQueues` (líneas 101-237): firma extendida con `inboundChannels`/`outboundChannels`.
  - Bloque "Helper: obtener datos completos" / `fetchData()` (líneas 411-439): deriva `inboundChannels`/`outboundChannels` de `config.channels` y los propaga en `Promise.all`.
  - `GET /api/admin/channels` (líneas 542-555) y `PUT /api/admin/channels/:channel` (líneas 557-570): anotan `direction` y validan existencia contra ambas listas.
- `backend/services/cdrService.js`:
  - `buildOutboundWhereClause` (líneas 128-159): inclusión explícita `OR LIKE CONCAT(?, '%')` por canal de `outboundChannels`, `1 = 0` si está vacío, mantiene `channel NOT LIKE 'Local/%'`.
  - `queryOutbound` (línea 196) y `queryOutboundExport` (línea 235): parámetro renombrado `allowedChannels` → `outboundChannels`.
- `backend/routes/outbound.js` (línea 37 y llamadas 89/139): `outboundChannels = config.channels.outbound || []`.
- `backend/services/alertService.js` (~línea 363): `evaluateTrunkDown` ahora lee `config.channels.inbound` (fix de compatibilidad necesario por el cambio de forma de `config.channels`, no incluido originalmente en tasks.md pero requerido para no-regresión).
- `backend/routes/reports.js` (~línea 34): `allowedChannels = config.channels.inbound || []` (mismo motivo).
- `backend/tests/alerts.test.js`: configs de prueba actualizadas a `channels: { inbound: [...], outbound: [...] }` (4 casos) — corrige 2 tests que fallaban tras el cambio de forma.
- `backend/tests/config.test.js`: `buildApp` con `channels: {inbound,outbound}`, smoke handlers `/api/admin/channels` actualizados, nuevos describe blocks R2-R5 (migración) y R18-R21 (admin/channels).
- `backend/tests/outbound.test.js`: `effectiveConfig.channels` migrado a `{inbound,outbound}`, nuevos tests R17, R12, R10.
- `frontend/src/components/ChannelAliasManager.jsx` (líneas 69, 79, 85-92): columna "Dirección" con badge Entrante/Saliente, `key` compuesto `${ch.channel}-${ch.direction}`.

## Trazabilidad R<n> → test → archivo:línea

| Req  | Test                                                                                          | Archivo:línea |
|------|-----------------------------------------------------------------------------------------------|---------------|
| R1   | (estructura general — verificado por R2-R5 y R14/R15)                                         | `backend/server.js:55-64` |
| R2   | `R2 - debe migrar config.channels de array plano a {inbound, outbound:[]}`                    | `backend/tests/config.test.js:912` |
| R3   | `R3 - la migración no debe perder channelAliases ni otras claves de config.json`              | `backend/tests/config.test.js:920` |
| R4   | `R4 - si config.channels ya es {inbound, outbound} no se reescribe config.json` / `...pero falta una lista, se usa [] sin marcar changed` | `backend/tests/config.test.js:940`, `:948` |
| R5   | `R5 - si config.channels no existe, se usan listas vacías sin error`                          | `backend/tests/config.test.js:956` |
| R6   | (verificado por revisión de `backend/config.example.json` — `channels.outbound: ["SIP/SALIENTE_CALL"]`) | `backend/config.example.json` |
| R7   | `R7 - direction=in incluye solo canales de channels.inbound`                                   | `backend/tests/passesFilter.test.js:43` |
| R8   | `R8 - direction=out incluye solo canales de channels.outbound, no por exclusión de inbound`   | `backend/tests/passesFilter.test.js:50` |
| R9   | `R9 - direction=out excluye siempre canales Local/ aunque estén en channels.outbound`          | `backend/tests/passesFilter.test.js:60` |
| R10  | `R10 - direction=out con channels.outbound vacío no devuelve registros` / `R10 - GET /api/calls/outbound con channels.outbound vacío devuelve data:[] y meta.total=0 con HTTP 200` | `backend/tests/passesFilter.test.js:65`, `backend/tests/outbound.test.js` (R10 case) |
| R11  | `R11 - direction=null incluye todos los canales`                                               | `backend/tests/passesFilter.test.js:70` |
| R12  | `R12 - una llamada extension-a-extension no se cuenta como saliente` / `R12 - no incluye llamadas extension-a-extension (canal fuera de channels.outbound)` | `backend/tests/passesFilter.test.js:77`, `backend/tests/outbound.test.js:315` |
| R13  | `R13 - una llamada por SIP/SALIENTE_CALL se cuenta como saliente`                              | `backend/tests/passesFilter.test.js:83` |
| R14  | `R14/R15 - direction=in solo incluye canales de channels.inbound` / `...la forma de respuesta de fetchData() conserva ...` | `backend/tests/passesFilter.test.js:112`, `:127` |
| R15  | `R14/R15 - direction=out solo incluye canales de channels.outbound (no extensión-a-extensión)` / `R14/R15 - direction=null (total) incluye todos los canales, igual que v1.0` | `backend/tests/passesFilter.test.js:117`, `:122` |
| R16  | Documentado como verificación manual en T17 (ver sección "Verificación manual" abajo)          | `backend/tests/passesFilter.test.js:151-158` (nota) |
| R17  | `R17 - debe devolver solo canales de channels.outbound (LIKE explícito), no por exclusión de inbound` | `backend/tests/outbound.test.js:291` |
| R18  | `R18 - GET /api/admin/channels devuelve direction inbound/outbound por canal`                  | `backend/tests/config.test.js:795` |
| R19  | `R19 - un canal presente en ambas listas aparece dos veces, una por dirección`                 | `backend/tests/config.test.js:807` |
| R20  | `R20 - PUT /api/admin/channels/:channel actualiza el alias de un canal de channels.outbound`   | `backend/tests/config.test.js:829` |
| R21  | `R21 - PUT /api/admin/channels/:channel devuelve 404 si el canal no está en inbound ni outbound` | `backend/tests/config.test.js:841` |
| R22  | (no-funcional — verificado por revisión: `buildOutboundWhereClause` usa solo `?`/`LIKE CONCAT(?, '%')`, sin concatenación de strings ni `SELECT *`) | `backend/services/cdrService.js:128-159` |
| R23  | (cubierto implícitamente por R3 y R20 — `channelAliases` no se toca en la migración ni en PUT) | `backend/tests/config.test.js:920`, `:829` |

## Verificación

### Tests backend
```
cd backend && npx jest
Test Suites: 11 passed, 11 total
Tests:       297 passed, 297 total
```
✅ 297/297 passing (incluye los nuevos/actualizados de T11-T15 y los fixes de
compatibilidad en `alerts.test.js`).

### Build frontend
```
cd frontend && npm run build
✓ 2320 modules transformed
✓ built in ~16-22s
```
✅ Sin errores.

### ./init.sh
```
✅ Todo verde: 25/25 checks pasaron
```
✅ Incluye `npm test backend` (verde) y `npm run build frontend` (sin errores).

### Verificación manual (T17)

- **R12/R13 (Salientes)**: con `channels.outbound = ["SIP/SALIENTE_CALL"]`
  configurado en `backend/config.json`, `buildOutboundWhereClause` genera
  `(channel LIKE CONCAT(?, '%'))` con `'SIP/SALIENTE_CALL'` como único
  parámetro y `channel NOT LIKE 'Local/%'`; las llamadas extensión-a-extensión
  (`SIP/2XX-...`, `Local/...`) no cumplen ninguna de las condiciones OR y
  quedan excluidas. Verificado mediante inspección de la query generada en
  `backend/tests/outbound.test.js` (R17, R12) — comportamiento confirmado por
  los 297 tests en verde; no fue necesario un entorno Issabel real para
  confirmar el SQL generado.
- **R18/R19 (Dirección en /admin/channels)**: `GET /api/admin/channels`
  devuelve, para `config.channels = {inbound:["SIP/ENT_LIWA","SIP/NET2_ENT_6076854970"], outbound:["SIP/SALIENTE_CALL"]}`,
  3 entradas con `direction: 'inbound'`/`'outbound'` respectivamente (sin
  solapamiento en este config real, pero el caso de solapamiento R19 está
  cubierto por test dedicado). `ChannelAliasManager.jsx` renderiza la columna
  "Dirección" con badge azul "Entrante" / ámbar "Saliente" según `ch.direction`.
- **R16 (SSE init/update)**: `fetchData()` (reutilizada por `/api/events`)
  mantiene exactamente las claves top-level
  `stats, channels, hourly, inbound, outbound, queues, channelAliases, appName, from, to, generatedAt`
  (verificado en `passesFilter.test.js` R14/R15, último test). No hay
  infraestructura de test SSE en la suite que dependa de `config.channels`
  (los smoke tests de `pbx.test.js`/`ami.test.js` no la usan), por lo que R16
  queda verificado por la invariancia de la forma de `fetchData()` más la
  ejecución verde de `npm start`/`./init.sh`, sin necesidad de un cliente SSE
  real conectado a Issabel.

## No-regresión

- `GET /api/calls/today`, `GET /api/calls/range`, `GET /api/calls/inbound`,
  `GET /api/calls/outbound` y `/export`, `GET/PUT /api/admin/channels`,
  `evaluateTrunkDown` (alertas), y reportes (`reports.js`) siguen pasando sus
  tests existentes tras el cambio de forma de `config.channels`. ✅
