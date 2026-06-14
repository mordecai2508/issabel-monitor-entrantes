# tasks.md — dashboard_perdidas_no_contestadas_split

> Checklist ordenado y ejecutable para el `implementer`. Cada `R<n>`
> referenciado debe aparecer literalmente en el nombre del `it()` del test
> correspondiente (ver `docs/specs.md` — trazabilidad obligatoria). Feature
> exclusivamente frontend — sin tasks de backend (R12).

---

## Backend

- [x] T1. **Verificación (sin cambios de código)**: confirmar, leyendo
  `backend/server.js`, que `queryStats` (líneas ~150-203) sigue calculando
  `base['NO ANSWER'].breakdown = { no_answer, ivr_hangup, queue_no_agent }`
  (línea ~170, incrementado vía `classifyUnansweredReason` en ~187-189) sin
  cambios desde #22/#23, y que `fetchData()` propaga ese campo a `stats` en
  `/api/calls/today`, `/api/calls/range` y los eventos SSE `init`/`update`
  (R12). **No modificar `backend/server.js`** — si esta verificación
  encuentra una discrepancia con lo documentado en `design.md` §1.1, **parar
  y reportar** antes de continuar (no improvisar un cambio de backend fuera
  de spec).

---

## Frontend — `Dashboard.jsx`

- [x] T2. **Reemplazar las variables de lectura de `noAnswer`/`lostPct`**
  (design.md §5.2): en `Dashboard.jsx`, sustituir las líneas
  ```jsx
  const noAnswer = disp?.['NO ANSWER']?.count ?? 0;
  // ...
  const lostPct  = disp?.['NO ANSWER']?.pct ?? 0;
  ```
  por:
  ```jsx
  const noAnswerBreakdown = disp?.['NO ANSWER']?.breakdown ?? {};

  const lost = noAnswerBreakdown.ivr_hangup ?? 0;
  const noAnswer =
    (noAnswerBreakdown.no_answer ?? 0) + (noAnswerBreakdown.queue_no_agent ?? 0);

  const lostPct =
    total > 0 ? Math.round((lost / total) * 1000) / 10 : 0;
  const noAnswerPct =
    total > 0 ? Math.round((noAnswer / total) * 1000) / 10 : 0;
  ```
  Mantener `answered`, `busy`, `failed`, `answeredPct`, `busyPct`,
  `failedPct` sin cambios. `total` ya existe — no redeclarar (R1, R2, R6,
  R10, R11).

- [x] T3. **Reemplazar la `StatCard` única "No Contestadas" por dos
  `StatCard`** (design.md §5.3): en el grid de KPIs principales, cambiar
  ```jsx
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <StatCard label="Total llamadas" value={total}     icon={Phone}      color="blue" />
    <StatCard label="Contestadas"    value={answered}  icon={PhoneCall}  color="green"
      sub="del total" pct={answeredPct} />
    <StatCard label="No Contestadas" value={noAnswer}  icon={PhoneMissed} color="red"
      sub="no efectivas, del total" pct={lostPct} />
  </div>
  ```
  por:
  ```jsx
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <StatCard label="Total llamadas" value={total}     icon={Phone}      color="blue" />
    <StatCard label="Contestadas"    value={answered}  icon={PhoneCall}  color="green"
      sub="del total" pct={answeredPct} />
    <StatCard label="Perdidas"       value={lost}      icon={PhoneMissed} color="red"
      sub="colgó en IVR, del total" pct={lostPct} />
    <StatCard label="No Contestadas" value={noAnswer}  icon={PhoneMissed} color="amber"
      sub="sin respuesta, del total" pct={noAnswerPct} />
  </div>
  ```
  (R4, R5, R6, R7). No introducir nuevos imports de `lucide-react` — `Phone`,
  `PhoneCall`, `PhoneMissed` ya están importados.

- [x] T4. **Verificar que no quedan referencias muertas**: tras T2/T3,
  comprobar que no queda ninguna referencia a una variable `noAnswer`/
  `lostPct` con el significado anterior a #24 (agregado de `dispositions['NO
  ANSWER']`), y que `disp?.['NO ANSWER']?.pct` / `disp?.['NO
  ANSWER']?.count` no se usan en ningún otro punto de `Dashboard.jsx` salvo,
  si aplica, dentro de `DispositionChart`/`HourlyChart` (que reciben `disp`/
  `hourly` completos sin cambios, R9).

---

## Frontend — Tests

- [x] T5. **Tests frontend** (si Vitest está configurado para `frontend/`;
  en caso contrario, documentar como verificación manual en T7 — ver
  limitación conocida de `docs/existing_code.md`/`CLAUDE.md`: "Frontend: aún
  sin Vitest/ESLint configurados"):
  - `it('R1/R4 - Dashboard renderiza una StatCard "Perdidas" con value = breakdown.ivr_hangup y el mismo formato que "Contestadas"')`
  - `it('R2/R5 - Dashboard renderiza una StatCard "No Contestadas" con value = breakdown.no_answer + breakdown.queue_no_agent y el mismo formato que "Contestadas"')`
  - `it('R3 - la suma de los valores de "Perdidas" y "No Contestadas" es igual a dispositions["NO ANSWER"].count para un payload de ejemplo')`
  - `it('R6 - el pct de "Perdidas" y "No Contestadas" se calcula sobre stats.total, no sobre dispositions["NO ANSWER"].count ni entre sí')`
  - `it('R8 - Total === Contestadas + Perdidas + No Contestadas + Ocupado + Fallidas para un payload de ejemplo')`
  - `it('R10 - cuando dispositions["NO ANSWER"].breakdown es undefined, "Perdidas" y "No Contestadas" renderizan value=0 y pct=0 sin error')`
  - `it('R11 - cuando breakdown está presente pero falta una de sus claves (no_answer/ivr_hangup/queue_no_agent), esa clave se trata como 0')`

---

## Verificación final

- [x] T6. **Ejecutar `cd backend && npm test`**: toda la suite debe quedar en
  verde sin cambios — confirma que T1 no introdujo ninguna modificación
  accidental a `backend/server.js` ni a los tests existentes de
  #16/#17/#21/#22/#23.

- [x] T7. **Verificación manual** (`cd frontend && npm run build` sin
  errores + `./init.sh` verde): con datos reales o de prueba que incluyan al
  menos:
  - un registro con `dst` en `config.lostDestinations` (cualquier
    `disposition` original) — debe contribuir a `breakdown.ivr_hangup` y, por
    tanto, a la tarjeta "Perdidas" (R1);
  - un registro con `disposition='NO ANSWER'` y `dst` NO en
    `lostDestinations` — debe contribuir a `breakdown.no_answer` y, por
    tanto, a "No Contestadas" (R2);
  - un registro con `disposition='ANSWERED'`, `dst` NO en
    `lostDestinations`, y `dstchannel` sin agente real (#21) — debe
    contribuir a `breakdown.queue_no_agent` y, por tanto, a "No Contestadas"
    (R2);

  comprobar en el Dashboard que:
  - aparecen dos tarjetas separadas "Perdidas" y "No Contestadas", ambas con
    el mismo formato (label + valor + sub-texto + barra de % ) que
    "Contestadas" (R4, R5, R7);
  - "Perdidas" + "No Contestadas" (valores numéricos mostrados) =
    `dispositions['NO ANSWER'].count` (verificable inspeccionando el payload
    de `/api/calls/today` en las DevTools) (R3);
  - Total = Contestadas + Perdidas + No Contestadas + Ocupado + Fallidas
    cuadra exactamente (R8);
  - los porcentajes de "Perdidas" y "No Contestadas" son cada uno respecto al
    total general (no suman necesariamente 100% entre sí salvo que sea el
    caso aritmético) (R6);
  - "Distribución de llamadas" (DispositionChart) y "Llamadas por hora (hoy)"
    (HourlyChart) siguen mostrando una única categoría "no contestadas" cuyo
    valor coincide con la suma de "Perdidas" + "No Contestadas" (R9);
  - si no hay acceso al SSE en el entorno de verificación, documentar la
    verificación de `update` como pendiente en producción (igual que en #21
    T11 / #22 T9 / #23 T12).
