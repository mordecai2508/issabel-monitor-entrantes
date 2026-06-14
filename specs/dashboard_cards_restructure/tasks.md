# tasks.md — dashboard_cards_restructure

> Checklist ordenado y ejecutable para el `implementer`. Cada `R<n>`
> referenciado debe aparecer literalmente en el nombre del `it()` del test
> correspondiente (ver `docs/specs.md` — trazabilidad obligatoria).

---

## Backend — `queryQueues` (sección 3 de `design.md`)

- [x] T1. **Actualizar el `SELECT`/`GROUP BY` de `queryQueues`
  (`backend/server.js`, ~línea 274-303)**: añadir `dstchannel` al `SELECT` y
  al `GROUP BY`, igual que #17/#21 hicieron para `queryStats`,
  `queryChannels` y `queryHourly` (sección 3.2 de `design.md`). La firma de
  la función no cambia (R7).

- [x] T2. **Reemplazar el cuerpo del bucle de agregación de `queryQueues`**:
  sustituir `const d = r.disposition.toUpperCase(); ... if
  (['ANSWERED','NO ANSWER','BUSY','FAILED'].includes(d)) result[key][d] +=
  Number(r.count);` por `const targetKey = resolveDisposition(r, lostDests);
  if (targetKey) result[key][targetKey] += Number(r.count);` (sección 3.3 de
  `design.md`). No cambiar el cálculo de `key` (`queues.includes(r.dst) ?
  r.dst : '__lost__'`) ni el filtro `validDsts.has(r.dst)` (R7-R11).

- [x] T3. **No modificar `queryStats`, `queryChannels`, `queryHourly`,
  `resolveDisposition`, `classifyUnansweredReason`**: verificar
  explícitamente que ninguna de estas funciones cambia de firma, cuerpo, o
  forma de retorno (Decisión A de `design.md`).

- [x] T4. **Verificar `fetchData()` (~línea 478-505)**: confirmar que la
  invocación existente `queryQueues(pool, from, to, inboundChannels,
  outboundChannels, configQueues, lostDests)` (línea ~493) ya pasa
  `lostDests` — no requiere cambios, solo verificación (R19-R21).

---

## Backend — Tests

- [x] T5. **Tests backend — `backend/tests/dashboard_cards_restructure.test.js`**
  (nuevo archivo, siguiendo el patrón de "copia local" usado en
  `disposition_agent_answered_fix.test.js`: define copias locales de
  `extractChannel`, `passesFilter`, `AGENT_DSTCHANNEL_RE`,
  `resolveDisposition` y `queryQueues` idénticas a las de `server.js` tras
  T1/T2, y mockea `pool.query`):
  - `it('R8 - dst en config.queues (8000), disposition=ANSWERED, dstchannel vacío reclasifica a queue["8000"]["NO ANSWER"] en lugar de ANSWERED')`
  - `it('R8 - dst en config.queues (8000), disposition=ANSWERED, dstchannel="Agent/03" sigue contando en queue["8000"].ANSWERED (sin reclasificar)')`
  - `it('R9 - dst en config.queues, disposition=BUSY se mantiene en queue["8000"].BUSY sin cambios')`
  - `it('R9 - dst en config.queues, disposition=FAILED se mantiene en queue["8000"].FAILED sin cambios')`
  - `it('R10 - para cada cola != __lost__, queue.total === ANSWERED + NO_ANSWER + BUSY + FAILED tras la reclasificación, con un dataset mixto')`
  - `it('R11 - dst en config.lostDestinations con disposition=ANSWERED se cuenta en __lost__["NO ANSWER"] (reclasificado) en lugar de __lost__.ANSWERED')`
  - `it('R22 - config.queues vacío o no configurado retorna [] sin cambios')`

- [x] T6. **Tests backend — regresión de endpoints existentes**: añadir
  casos en `backend/tests/stats.test.js` (o el archivo equivalente usado por
  #21/#22 para estos endpoints):
  - `it('R19 - GET /api/calls/today mantiene la forma de respuesta; queues[*] refleja la reclasificación de queryQueues')`
  - `it('R20 - GET /api/calls/range mantiene la forma de respuesta; queues[*] refleja la reclasificación')`
  - `it('R21 - SSE init/update mantienen la forma de respuesta; queues[*] refleja la reclasificación')` (verificación manual si no hay cobertura SSE existente, anotarlo en T11)
  - `it('R19 - stats.dispositions["NO ANSWER"].breakdown sigue presente en el payload sin cambios (#22 no se rompe)')`

---

## Frontend — `Dashboard.jsx`

- [x] T7. **Renombrar la StatCard "Perdidas" → "No Contestadas"** (sección
  5.1 de `design.md`): en el grid de 3 StatCards principales, cambiar
  `label="Perdidas"` a `label="No Contestadas"`. No cambiar `value`, `icon`,
  `color`, `sub`, ni `pct` (R1-R3).

- [x] T8. **Eliminar `UnansweredBreakdownCard` y código relacionado**
  (sección 5.2 de `design.md`):
  - Eliminar la definición del componente `UnansweredBreakdownCard`.
  - Eliminar las constantes `UNANSWERED_REASONS` y `REASON_COLOR_CLASS`.
  - Eliminar la variable `noAnswerBreakdown = disp?.['NO ANSWER']?.breakdown`.
  - Eliminar el bloque de renderizado (`<div className="grid ...
    lg:grid-cols-2 ..."><UnansweredBreakdownCard .../></div>`) y su
    comentario `{/* Desglose de 'Perdidas' por motivo (#22) */}`.
  - Verificar que ningún import (`lucide-react` u otro) queda sin uso tras
    esta eliminación (R4-R6).

- [x] T9. **Crear `ExtensionsStatusCard` y reemplazar las dos StatCard de
  extensiones** (sección 5.3 de `design.md`):
  - Añadir el componente local `ExtensionsStatusCard({ data })` (no
    exportado), junto a `QueueCard`, mostrando `active / total` con
    resaltado visual de `active` y manejo de `available` (opacidad +
    `title`) (R14-R17).
  - Reemplazar el bloque `<div className="grid grid-cols-2 gap-4 ...">
    <StatCard label="Extensiones" .../><StatCard label="Activas" .../>
    </div>` por `<div className="grid grid-cols-1 sm:grid-cols-2
    gap-4"><ExtensionsStatusCard data={extensionsData} /></div>`.
  - Eliminar el import de `UserCheck` de `lucide-react` si queda sin uso
    tras este cambio (verificar que `Users` se sigue usando, p.ej. en
    `QueueCard`).
  - No modificar `EXTENSIONS_POLL_MS`, `EMPTY_EXTENSIONS_STATUS`, el
    `useEffect` de polling, ni `api.pbxExtensions()` (R18).

- [x] T10. **Tests frontend** (si Vitest está configurado para
  `frontend/`; en caso contrario, documentar como verificación manual en
  T11 — ver limitación conocida de `docs/existing_code.md`/`CLAUDE.md`:
  "Frontend: aún sin Vitest/ESLint configurados"):
  - `it('R1/R2 - Dashboard renderiza una tarjeta "No Contestadas" con el mismo formato que "Contestadas" (label, valor, sub, pct)')`
  - `it('R4 - Dashboard NO renderiza "Detalle de Perdidas" / UnansweredBreakdownCard, incluso con breakdown presente en el payload')`
  - `it('R12 - QueueCard muestra "No contest.: N" usando queue["NO ANSWER"] reclasificado')`
  - `it('R14-R17 - ExtensionsStatusCard muestra active/total cuando available=true, y se degrada visualmente cuando available=false')`

---

## Verificación final

- [x] T11. **Ejecutar `cd backend && npm test`**: toda la suite debe quedar
  en verde, incluyendo T5 y T6. Verificar que los archivos de #16/#17/#21/#22
  (`dashboard_lost_destinations.test.js`,
  `disposition_agent_answered_fix.test.js`,
  `dashboard_unanswered_breakdown.test.js`) siguen pasando sin necesidad de
  modificar sus copias locales de `queryStats`/`queryChannels`/`queryHourly`
  (esta feature solo toca `queryQueues`).

- [x] T12. **Verificación manual** (`cd frontend && npm run build` sin
  errores + `./init.sh` verde): con datos reales o de prueba que incluyan al
  menos:
  - un registro `dst` en `config.queues`, `disposition='ANSWERED'`,
    `dstchannel` vacío (debe aparecer en "No contest." de esa cola, no en
    "Contestadas" de esa cola — R8, R12),
  - un registro `dst` en `config.lostDestinations`, `disposition='ANSWERED'`
    (debe aparecer en `__lost__['NO ANSWER']` si se inspecciona el payload —
    R11),

  comprobar en el Dashboard que:
  - la tarjeta "No Contestadas" (antes "Perdidas") muestra el mismo formato
    que "Contestadas" (R1-R3),
  - no aparece ninguna sección "Detalle de Perdidas" (R4),
  - las QueueCard muestran "No contest.: N" con el valor reclasificado, y
    `total = ANSWERED + No contest. + Ocupado` sigue cuadrando visualmente
    (R10, R12, R13),
  - la tarjeta de extensiones combinada muestra "activas / total" y se
    degrada (opacidad + tooltip) cuando `extensionsData.available = false`
    (R14-R17),
  - si no hay acceso al SSE en el entorno de verificación, documentar R21
    como pendiente de verificación manual en producción (igual que en #21
    T11 / #22 T9).
