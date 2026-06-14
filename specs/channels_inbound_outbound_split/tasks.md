# tasks.md — channels_inbound_outbound_split

> Checklist ordenado y ejecutable para el `implementer`. Cada `R<n>` referenciado
> debe aparecer literalmente en el nombre del `it()` del test correspondiente
> (ver `docs/specs.md` — trazabilidad obligatoria).

- [x] T1. **Actualizar `backend/config.example.json`**: reemplazar la clave
  plana `"channels": []` por
  `"channels": { "inbound": [], "outbound": ["SIP/SALIENTE_CALL"] }`
  (R6). No tocar ninguna otra clave del archivo.

- [x] T2. **Implementar migración en `loadConfig()` (`backend/server.js`)**:
  tras leer `raw` de `config.json`, si `Array.isArray(raw.channels)`,
  convertirlo a `raw.channels = { inbound: raw.channels, outbound: [] }`,
  marcar `changed = true` (reutilizar el flag existente de auto-hash de
  contraseñas) y persistir con `fs.writeFileSync` igual que el bloque de
  auto-hash actual (R2, R3). Si `raw.channels` ya es un objeto, normalizar
  con `raw.channels.inbound = raw.channels.inbound || []` y
  `raw.channels.outbound = raw.channels.outbound || []` **sin** marcar
  `changed` ni reescribir el archivo si no hubo conversión de formato (R4).
  Si `raw.channels` es `undefined`, asignar `raw.channels = { inbound: [], outbound: [] }`
  en memoria sin marcar `changed` (R5).

- [x] T3. **Actualizar `extractChannel`/`passesFilter` (`backend/server.js`)**:
  cambiar la firma de `passesFilter` a
  `passesFilter(channel, inboundChannels, outboundChannels, direction)` según
  el pseudocódigo de `design.md` sección 3.1 (R7, R8, R9, R10, R11).
  `extractChannel` no cambia.

- [x] T4. **Actualizar `queryStats`, `queryChannels`, `queryHourly`,
  `queryQueues` (`backend/server.js`)**: cambiar su firma para recibir
  `inboundChannels` y `outboundChannels` (en lugar del único `allowedChannels`)
  y propagarlos a la nueva firma de `passesFilter` de T3. `queryQueues` sigue
  usando `direction='in'` internamente (sin cambio de comportamiento, solo de
  parámetros).

- [x] T5. **Actualizar `fetchData()` y el bloque "Helper: obtener datos
  completos" (`backend/server.js`)**: sustituir
  `const allowedChannels = config.channels && ...` por
  `const inboundChannels  = config.channels.inbound  || [];` y
  `const outboundChannels = config.channels.outbound || [];`, y pasar ambas a
  cada llamada de `queryStats`/`queryChannels`/`queryHourly`/`queryQueues`
  dentro de `Promise.all` (R14, R15, R16).

- [x] T6. **Actualizar `buildOutboundWhereClause`, `queryOutbound`,
  `queryOutboundExport` (`backend/services/cdrService.js`)**: cambiar el
  parámetro `allowedChannels` por `outboundChannels` y reemplazar la lógica
  de exclusión (`NOT LIKE` por cada canal de `allowedChannels`) por inclusión
  explícita (`OR` de `LIKE CONCAT(?, '%')` por cada canal de
  `outboundChannels`), añadiendo `1 = 0` cuando `outboundChannels` esté vacío,
  según el pseudocódigo de `design.md` sección 3.2 (R8, R10, R12, R13, R17).
  Mantener `channel NOT LIKE 'Local/%'` (R9).

- [x] T7. **Actualizar `backend/routes/outbound.js`**: cambiar
  `const allowedChannels = config.channels || [];` por
  `const outboundChannels = config.channels.outbound || [];` y pasar
  `outboundChannels` a `cdrService.queryOutbound`/`queryOutboundExport`
  (R17).

- [x] T8. **Actualizar `GET /api/admin/channels` (`backend/server.js`)**:
  construir el array de respuesta recorriendo
  `config.channels.inbound.map(ch => ({ channel: ch, direction: 'inbound', alias: aliases[ch] || '' }))`
  concatenado con el equivalente para `outbound` (R18, R19).

- [x] T9. **Actualizar `PUT /api/admin/channels/:channel` (`backend/server.js`)**:
  cambiar la validación de existencia de
  `!(config.channels || []).includes(channel)` a
  `!config.channels.inbound.includes(channel) && !config.channels.outbound.includes(channel)`
  (devuelve 404 si no está en ninguna de las dos listas) (R20, R21). El resto
  de la lógica de `channelAliases` no cambia (R23).

- [x] T10. **Actualizar `frontend/src/components/ChannelAliasManager.jsx`**:
  añadir columna "Dirección" en la tabla que muestre una badge
  `Entrante`/`Saliente` según `ch.direction` (R18, R19). No cambiar
  `api.adminChannels()` ni `api.updateChannelAlias()` (sin cambios en
  `frontend/src/api.js`).

- [x] T11. **Tests backend — `backend/tests/config.test.js`** (añadir casos,
  sin romper los existentes):
  - `it('R2 - debe migrar config.channels de array plano a {inbound, outbound:[]}')`
  - `it('R3 - la migración no debe perder channelAliases ni otras claves de config.json')`
  - `it('R4 - si config.channels ya es {inbound, outbound} no se reescribe config.json')`
  - `it('R5 - si config.channels no existe, se usan listas vacías sin error')`

- [x] T12. **Tests backend — nuevo `backend/tests/passesFilter.test.js`** (o
  archivo equivalente para las funciones internas de `server.js` si ya existe
  un punto de entrada para testearlas; si `passesFilter` no es exportable,
  cubrir vía `dashboard_lost_destinations.test.js` o un test de integración
  sobre `/api/calls/range`):
  - `it('R7 - direction=in incluye solo canales de channels.inbound')`
  - `it('R8 - direction=out incluye solo canales de channels.outbound, no por exclusión de inbound')`
  - `it('R9 - direction=out excluye siempre canales Local/ aunque estén en channels.outbound')`
  - `it('R10 - direction=out con channels.outbound vacío no devuelve registros')`
  - `it('R11 - direction=null incluye todos los canales')`
  - `it('R12 - una llamada extension-a-extension no se cuenta como saliente')`
  - `it('R13 - una llamada por SIP/SALIENTE_CALL se cuenta como saliente')`

- [x] T13. **Tests backend — `backend/tests/outbound.test.js`** (añadir casos):
  - `it('R17 - GET /api/calls/outbound solo devuelve canales de channels.outbound')`
  - `it('R12 - GET /api/calls/outbound no incluye llamadas extension-a-extension')`
  - `it('R10 - GET /api/calls/outbound con channels.outbound vacío devuelve data:[] y meta.total=0 con HTTP 200')`

- [x] T14. **Tests backend — endpoints `/api/admin/channels`** (añadir casos
  en el archivo de tests existente que cubra estos endpoints, o crear
  `backend/tests/channels.test.js` si no existe ninguno):
  - `it('R18 - GET /api/admin/channels devuelve direction inbound/outbound por canal')`
  - `it('R19 - un canal presente en ambas listas aparece dos veces, una por dirección')`
  - `it('R20 - PUT /api/admin/channels/:channel actualiza el alias de un canal de channels.outbound')`
  - `it('R21 - PUT /api/admin/channels/:channel devuelve 404 si el canal no está en inbound ni outbound')`

- [x] T15. **Tests backend — regresión de endpoints existentes**: confirmar
  (añadiendo o ajustando tests en `backend/tests/stats.test.js` /
  `dashboard_lost_destinations.test.js`) que:
  - `it('R14 - GET /api/calls/today mantiene la forma de respuesta con channels.inbound/outbound')`
  - `it('R15 - GET /api/calls/range mantiene la forma de respuesta')`
  - `it('R16 - SSE init/update mantienen la forma de respuesta')` (si ya hay
    cobertura de SSE; si no, marcar como verificación manual en T17 y anotarlo).

- [x] T16. **Ejecutar `cd backend && npm test`**: toda la suite debe quedar en
  verde, incluyendo los archivos modificados/añadidos en T11–T15.

- [x] T17. **Verificación manual** (`cd frontend && npm run build` sin errores
  + `./init.sh` verde): con `config.json` migrado y
  `channels.outbound = ["SIP/SALIENTE_CALL"]` configurado, comprobar en
  `OutboundView.jsx` y en el dashboard que:
  - llamadas extensión-a-extensión no aparecen en "Salientes" (R12),
  - llamadas reales por `SIP/SALIENTE_CALL` sí aparecen (R13),
  - `/admin/channels` muestra la columna "Dirección" correctamente (R18, R19).
