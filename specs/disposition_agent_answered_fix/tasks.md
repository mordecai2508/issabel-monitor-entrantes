# tasks.md — disposition_agent_answered_fix

> Checklist ordenado y ejecutable para el `implementer`. Cada `R<n>` referenciado
> debe aparecer literalmente en el nombre del `it()` del test correspondiente
> (ver `docs/specs.md` — trazabilidad obligatoria).

- [x] T1. **Crear helper compartido `resolveDisposition(row, lostDests)` en
  `backend/server.js`**, junto a `extractChannel`/`passesFilter` (sección 3.1
  de `design.md`), incluyendo la constante
  `const AGENT_DSTCHANNEL_RE = /^(Agent\/\d+|SIP\/\d+-)/;`. La función recibe
  `row = { dst, dstchannel, disposition, ... }` y devuelve la clave de bucket
  efectiva (`'ANSWERED' | 'NO ANSWER' | 'BUSY' | 'FAILED' | null`) aplicando
  primero la reclasificación de `lostDestinations` (#17) y después la de
  `dstchannel` (#21), sin doble conteo (R1–R6, R18, R19).

- [x] T2. **Actualizar `queryStats` (`backend/server.js`)**: añadir
  `dstchannel` al `SELECT` y al `GROUP BY` (sección 3.2 de `design.md`);
  reemplazar el bloque de reclasificación inline existente (de #17) por una
  llamada a `resolveDisposition(r, lostDests)`. La firma de la función no
  cambia (R1–R10, R18, R19).

- [x] T3. **Actualizar `queryChannels` (`backend/server.js`)**: añadir `dst`
  y `dstchannel` al `SELECT` y al `GROUP BY` (sección 3.3); añadir el
  parámetro `lostDests = ['s', 'hang', 'hangup']` a la firma; usar
  `resolveDisposition(r, lostDests)` para decidir en qué clave de `map[ch]`
  incrementar (en lugar de usar `disposition` directamente) (R11, R13).

- [x] T4. **Actualizar `queryHourly` (`backend/server.js`)**: añadir `dst` y
  `dstchannel` al `SELECT` y al `GROUP BY` (sección 3.4); añadir el parámetro
  `lostDests = ['s', 'hang', 'hangup']` a la firma; usar
  `resolveDisposition(r, lostDests)` para decidir en qué clave de `hours[h]`
  incrementar (R12, R13).

- [x] T5. **Actualizar `fetchData()` / bloque `Promise.all` en
  `startServer()` (`backend/server.js`, ~línea 426)**: pasar `lostDests` como
  último argumento también a las tres invocaciones de `queryChannels` y a las
  tres de `queryHourly` (total/in/out), reutilizando la constante `lostDests`
  ya definida en la línea ~414 (R14, R15, R16).

- [x] T6. **No modificar `queryQueues`** (Decisión C de `design.md`): verificar
  explícitamente que `queryQueues` sigue agrupando por `channel, dst,
  disposition` sin `dstchannel` y sin usar `resolveDisposition` (R17).

- [x] T7. **Tests backend — `backend/tests/disposition_agent_answered_fix.test.js`**
  (nuevo archivo, siguiendo el patrón de "copia local" de
  `dashboard_lost_destinations.test.js` documentado en su `design.md` §8:
  define copias locales de `extractChannel`, `passesFilter`,
  `resolveDisposition`, `queryStats`, `queryChannels` y `queryHourly`
  idénticas a las de `server.js`, y mockea `pool.query`):
  - `it('R1/R3 - dstchannel="Agent/03" con disposition=ANSWERED cuenta como ANSWERED')`
  - `it('R1/R3 - dstchannel="SIP/203-00001a2b" con disposition=ANSWERED cuenta como ANSWERED')`
  - `it('R2/R7 - dst en config.queues (8000), dstchannel vacío, disposition=ANSWERED reclasifica a NO ANSWER')`
  - `it('R4 - disposition=BUSY con dstchannel vacío NO se reclasifica (sigue en BUSY)')`
  - `it('R4 - disposition=FAILED con dstchannel vacío NO se reclasifica (sigue en FAILED)')`
  - `it('R5/R6 - dst en lostDestinations Y dstchannel sin agente con disposition=ANSWERED cuenta una sola vez en NO ANSWER (sin doble conteo)')`
  - `it('R8 - dst en config.queues con dstchannel="Agent/04" y disposition=ANSWERED sigue en ANSWERED')`
  - `it('R9 - total = ANSWERED + NO ANSWER + BUSY + FAILED tras la reclasificación')`
  - `it('R10 - avg_billsec y pct se recalculan sobre los buckets reclasificados')`
  - `it('R18 - dstchannel=null/undefined con disposition=ANSWERED reclasifica a NO ANSWER')`

- [x] T8. **Tests backend — consistencia entre queries (mismo archivo o
  `backend/tests/disposition_consistency.test.js`)**:
  - `it('R11 - la suma de ANSWERED de queryChannels coincide con dispositions.ANSWERED.count de queryStats para el mismo dataset')`
  - `it('R11 - la suma de NO ANSWER de queryChannels coincide con dispositions[\"NO ANSWER\"].count de queryStats para el mismo dataset')`
  - `it('R12 - la suma de ANSWERED de queryHourly (24 horas) coincide con dispositions.ANSWERED.count de queryStats para el mismo dataset')`
  - `it('R12 - la suma de NO ANSWER de queryHourly (24 horas) coincide con dispositions[\"NO ANSWER\"].count de queryStats para el mismo dataset')`
  - `it('R13 - un dataset mixto (lostDestinations + dstchannel sin agente + agente real) produce el mismo total reclasificado en las tres funciones')`

- [x] T9. **Tests backend — regresión de endpoints existentes**: añadir o
  ajustar casos en `backend/tests/stats.test.js` y/o
  `backend/tests/dashboard_lost_destinations.test.js`:
  - `it('R14 - GET /api/calls/today mantiene la forma de respuesta tras la reclasificación de #21')`
  - `it('R15 - GET /api/calls/range mantiene la forma de respuesta tras la reclasificación de #21')`
  - `it('R16 - SSE init/update mantienen la forma de respuesta tras la reclasificación de #21')` (verificación manual si no hay cobertura SSE existente, anotarlo en T11)
  - `it('R17 - queryQueues no aplica el criterio de dstchannel; queues[q].ANSWERED puede diferir de stats.dispositions.ANSWERED')`
  - `it('R21 - ningún endpoint cambia de forma de payload, solo valores numéricos')`

- [x] T10. **Ejecutar `cd backend && npm test`**: toda la suite debe quedar en
  verde, incluyendo los archivos nuevos/modificados de T7–T9. Verificar
  además que `backend/tests/dashboard_lost_destinations.test.js` (copia local
  de `queryStats` de #17) se actualiza para reflejar el nuevo cuerpo basado en
  `resolveDisposition` (T2), manteniendo la regla de "copia idéntica a
  server.js" del §8 de su `design.md`.

- [x] T11. **Verificación manual** (`cd frontend && npm run build` sin
  errores + `./init.sh` verde): con datos reales o de prueba que incluyan al
  menos un registro `dst` en `config.queues`, `disposition='ANSWERED'`,
  `dstchannel` vacío, comprobar en el dashboard que:
  - la StatCard "Contestadas" disminuye y "Perdidas" aumenta respecto al
    comportamiento anterior (R7),
  - la suma de la columna "Contestadas" en `ChannelTable` para `direction=in`
    coincide con la StatCard "Contestadas" (R11),
  - `HourlyChart` (serie "Contestadas") sigue sumando al mismo total (R12),
  - una llamada con `dstchannel='Agent/03'` sigue apareciendo como
    "Contestada" (R3, R8).
  - Si no hay acceso al SSE en el entorno de verificación, documentar R16 como
    pendiente de verificación manual en producción.
