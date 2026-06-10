# tasks.md — dashboard_lost_destinations

> Feature ID: 17 | Orden de implementación | Revisión: 2026-06-10

El implementer sigue estas tareas en orden. Marca `[x]` al completar cada una.

Esta feature **modifica únicamente** `backend/server.js` (función
`queryStats` y su invocación en `fetchData`) y añade un test nuevo
`backend/tests/dashboard_lost_destinations.test.js`. No hay cambios de
frontend funcionales obligatorios (ver `design.md §5.1` para un ajuste
cosmético opcional). Sin nuevas dependencias npm, sin nuevas tablas SQLite,
sin nuevos endpoints.

---

- [x] **T1. Modificar el SQL de `queryStats` para incluir `dst` (R1, R23)**
  - Archivo: `backend/server.js`, función `queryStats` (línea ~84).
  - Cambiar el `SELECT`/`GROUP BY`:
    ```sql
    SELECT
      channel,
      dst,
      disposition,
      COUNT(*)                    AS count,
      COALESCE(SUM(duration), 0)  AS total_duration,
      COALESCE(SUM(billsec), 0)   AS total_billsec
    FROM cdr
    WHERE calldate >= ? AND calldate < ?
    GROUP BY channel, dst, disposition
    ```
  - Mantener los parámetros preparados `[from, to]` sin cambios. No usar
    `SELECT *`.

- [x] **T2. Cambiar la firma de `queryStats` para recibir `lostDests` (R6, R7)**
  - Archivo: `backend/server.js`, función `queryStats` (línea ~84).
  - Nueva firma:
    ```js
    async function queryStats(pool, from, to, allowedChannels, direction = 'in', lostDests = ['s', 'hang', 'hangup'])
    ```
  - El default `['s', 'hang', 'hangup']` cubre R7 si la función se invoca sin
    el quinto argumento (defensivo); en la práctica `fetchData` siempre lo
    pasará explícitamente (T4).

- [x] **T3. Implementar el algoritmo de reclasificación dentro de `queryStats` (R1, R2, R3, R4, R5, R9, R10, R11, R17, R18, R19)**
  - Archivo: `backend/server.js`, función `queryStats` (bucle `for (const r of
    rows)`, línea ~106–115).
  - Reemplazar el cuerpo del bucle por la lógica de `design.md §3.2`:
    ```js
    for (const r of rows) {
      if (!passesFilter(r.channel, allowedChannels, direction)) continue;
      const d = r.disposition.toUpperCase();
      const isLostDst = lostDests.includes(r.dst);

      let targetKey = base[d] ? d : null;
      if (isLostDst && targetKey && targetKey !== 'NO ANSWER') {
        targetKey = 'NO ANSWER';
      }

      if (targetKey) {
        base[targetKey].count          += Number(r.count);
        base[targetKey].total_duration += Number(r.total_duration);
        base[targetKey].total_billsec  += Number(r.total_billsec);
      }
      total += Number(r.count);
    }
    ```
  - El cálculo de `avg_billsec` (líneas ~117–118) y `pct` (líneas ~120–122)
    permanecen **sin cambios** — se ejecutan después del bucle, sobre `base` y
    `total` ya reclasificados.
  - Verificar manualmente con un caso de ejemplo (ver T6) que:
    - `ANSWERED` + `dst='hang'` → resta de `ANSWERED.count`, suma a `'NO
      ANSWER'.count` (R2).
    - `NO ANSWER` + `dst='s'` → cuenta una sola vez en `'NO ANSWER'.count`
      (R3).
    - `NO ANSWER` + `dst` no en `lostDests` → sin cambios (R4).
    - `BUSY`/`FAILED` + `dst` no en `lostDests` → sin cambios (R5).
    - `total` no cambia respecto al cálculo anterior para el mismo conjunto de
      filas (R10).

- [x] **T4. Pasar `lostDests` desde `fetchData` a las tres invocaciones de `queryStats` (R12, R13, R14)**
  - Archivo: `backend/server.js`, función `fetchData` (línea ~363) y
    `startServer` (línea ~358, donde ya existe `const lostDests =
    config.lostDestinations || ['s', 'hang', 'hangup'];` para `queryQueues`).
  - Actualizar las tres llamadas a `queryStats` dentro del `Promise.all` de
    `fetchData`:
    ```js
    queryStats(pool, from, to, allowedChannels, null,  lostDests),
    // ...
    queryStats(pool, from, to, allowedChannels, 'in',  lostDests),
    // ...
    queryStats(pool, from, to, allowedChannels, 'out', lostDests),
    ```
  - No modificar las invocaciones de `queryChannels`, `queryHourly`, ni
    `queryQueues` (R15, R22; ver `design.md §6 Decisión B`).
  - Confirmar que `lostDests` (variable ya existente en `startServer`, línea
    ~358) está en scope de `fetchData` — si no lo está, pasarlo como parámetro
    adicional de `fetchData` o capturarlo por closure (igual que ya ocurre con
    `allowedChannels`/`configQueues`).

- [x] **T5. (Opcional, no bloqueante) Ajustar el texto `sub=` de la tarjeta "Perdidas" en `Dashboard.jsx` (design.md §5.1)**
  - Archivo: `frontend/src/components/Dashboard.jsx`.
  - Si se decide aplicar: cambiar `sub="sin atender, del total"` por un texto
    que refleje la definición ampliada (p.ej. `"no efectivas, del total"`).
  - Cambio de **una línea de texto**, sin tocar lógica/props/estructura. Si se
    omite, no afecta el cumplimiento de R1–R23.

- [x] **T6. Escribir tests `backend/tests/dashboard_lost_destinations.test.js` (R1–R19)**
  - Seguir el patrón de `backend/tests/inbound.test.js` /
    `backend/tests/stats.test.js`: mockear `pool.query` con
    `jest.fn().mockResolvedValue([rows])`, sin BD real.
  - Definir en el archivo de test una **copia local** de la función
    `queryStats` modificada (idéntica en lógica a la de T1–T3), siguiendo el
    patrón de `extractChannel` mirror en `inbound.test.js` — ver `design.md
    §8` para la justificación de este enfoque (limitación arquitectónica de
    `server.js` no exportable).
  - También incluir en el test una copia local de `passesFilter` y del objeto
    `base` inicial (idénticos a `server.js`), necesarios para que la copia de
    `queryStats` funcione de forma autocontenida.
  - Casos de test (un `it()` por requisito, nombrando `R<n>` en la descripción):
    - `it('R2 - ANSWERED con dst en lostDestinations se resta de Contestadas y se suma a Perdidas', ...)`
      - Fila: `{ channel: 'SIP/trunk-1', dst: 'hang', disposition: 'ANSWERED', count: 1, total_duration: 30, total_billsec: 25 }`.
      - Esperado: `dispositions.ANSWERED.count === 0`, `dispositions['NO ANSWER'].count === 1`.
    - `it('R2 - BUSY con dst en lostDestinations se resta de Ocupado y se suma a Perdidas', ...)`
      - Análogo con `disposition: 'BUSY'`.
    - `it('R2 - FAILED con dst en lostDestinations se resta de Fallidas y se suma a Perdidas', ...)`
      - Análogo con `disposition: 'FAILED'`.
    - `it('R3 - NO ANSWER con dst en lostDestinations cuenta una sola vez en Perdidas (sin doble conteo)', ...)`
      - Fila: `{ channel: 'SIP/trunk-1', dst: 's', disposition: 'NO ANSWER', count: 1, ... }`.
      - Esperado: `dispositions['NO ANSWER'].count === 1` (no `2`).
    - `it('R4 - NO ANSWER con dst fuera de lostDestinations no cambia (comportamiento de #16)', ...)`
      - Fila con `dst: '1234'` (no en `lostDests`), `disposition: 'NO ANSWER'`.
      - Esperado: `dispositions['NO ANSWER'].count === 1`, sin reclasificación.
    - `it('R5 - ANSWERED/BUSY/FAILED con dst fuera de lostDestinations no se reclasifican', ...)`
      - Tres filas (una por disposición), `dst` fuera de `lostDests`.
      - Esperado: cada una permanece en su categoría original.
    - `it('R9 - Total = Contestadas + Perdidas + Ocupado + Fallidas tras la reclasificación', ...)`
      - Mezcla de filas (incluyendo casos R2/R3/R4/R5).
      - Esperado: `total === dispositions.ANSWERED.count + dispositions['NO ANSWER'].count + dispositions.BUSY.count + dispositions.FAILED.count`.
    - `it('R10 - el total no cambia respecto al cálculo sin reclasificación', ...)`
      - Mismo conjunto de filas, comparar `total` con la suma directa de
        `count` de todas las filas (independiente de `lostDests`).
    - `it('R8 - con lostDestinations vacío, Perdidas = NO ANSWER.count sin reclasificación (comportamiento de #16)', ...)`
      - `lostDests = []`. Filas con `disposition='ANSWERED'` y `dst='hang'`
        (que normalmente se reclasificarían).
      - Esperado: `dispositions.ANSWERED.count` permanece sin cambios,
        `dispositions['NO ANSWER'].count` solo refleja los `NO ANSWER`
        originales.
    - `it('R7 - sin config.lostDestinations definido, usa el default [\\'s\\',\\'hang\\',\\'hangup\\']', ...)`
      - Invocar `queryStats` sin el sexto argumento (o con `undefined`).
      - Fila con `dst: 'hangup'`, `disposition: 'BUSY'`.
      - Esperado: se reclasifica a `'NO ANSWER'` (default aplicado).
    - `it('R6 - con lostDestinations personalizado, reclasifica según la lista configurada', ...)`
      - `lostDests = ['9999']`. Fila con `dst: '9999'`, `disposition:
        'ANSWERED'`.
      - Esperado: se reclasifica a `'NO ANSWER'`.
    - `it('R18 - disposition no reconocida no se reclasifica ni se suma a ningún bucket, pero sí a total', ...)`
      - Fila con `disposition: 'CONGESTION'` (valor no estándar), `dst` en
        `lostDests`.
      - Esperado: ningún `base[key].count` cambia, pero `total` incluye esa
        fila.
    - `it('R19 - ningún contador de disposición resulta negativo', ...)`
      - Cualquier combinación de los casos anteriores.
      - Esperado: `Object.values(dispositions).every(d => d.count >= 0)`.
    - `it('R17 - sin filas (sin llamadas), todos los contadores y total son 0', ...)`
      - `pool.query` devuelve `[[]]`.
      - Esperado: todos los `count` y `total` son `0`, sin `NaN`.
    - `it('R11 - pct se recalcula correctamente tras la reclasificación', ...)`
      - Verificar que `dispositions['NO ANSWER'].pct` y
        `dispositions.ANSWERED.pct` reflejan los `count` ya reclasificados
        sobre `total`.

- [x] **T7. Verificación final**
  - `cd backend && npm test` — debe pasar en verde, incluyendo
    `dashboard_lost_destinations.test.js` y la suite completa existente
    (`users`, `inbound`, `outbound`, `stats`, `reports`, `config`) sin
    regresiones.
  - `cd frontend && npm run build` — debe completar sin errores (no se espera
    ningún cambio salvo el opcional de T5).
  - `./init.sh` — debe ejecutar sin errores (protocolo de arranque del
    proyecto).
  - Verificación manual (si hay acceso a una BD Issabel de prueba o fixture):
    1. Confirmar que `GET /api/calls/today` sigue devolviendo
       `dispositions` con las mismas claves (`ANSWERED`, `'NO ANSWER'`,
       `BUSY`, `FAILED`), cada una con `count`, `total_duration`,
       `total_billsec`, `avg_billsec`, `pct`.
    2. Confirmar aritméticamente: `stats.total === dispositions.ANSWERED.count
       + dispositions['NO ANSWER'].count + dispositions.BUSY.count +
       dispositions.FAILED.count`.
    3. Confirmar que el bloque de colas (`queues`, `__lost__` si
       `config.queues` está configurado) sigue presente y sin cambios de
       forma.
    4. Confirmar en el dashboard que la tarjeta "Perdidas" sigue mostrando un
       valor `>= dispositions['NO ANSWER'].count` previo a esta feature (igual
       o mayor, nunca menor, dado que la reclasificación solo añade registros
       a "Perdidas").
