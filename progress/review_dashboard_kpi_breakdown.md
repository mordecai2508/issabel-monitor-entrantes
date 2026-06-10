# Review — dashboard_kpi_breakdown — APROBADO

> Feature ID: 16 | Revisión: 2026-06-10 | Reviewer

## Nota de alcance (feature 100% frontend, sin Vitest/ESLint)

Conforme a `design.md §8` y a `CLAUDE.md` raíz, el frontend no tiene
Vitest/ESLint configurados. Para R1–R13 la verificación de trazabilidad se
realizó leyendo `frontend/src/components/Dashboard.jsx` línea por línea y
contrastándola contra `design.md §5.1`/`tasks.md` T1–T6, en lugar de citar
"nombre del test". Para R14–R16 se usó `git status`/`git diff --stat`/`git
diff`.

## Trazabilidad

| R<n> | Verificación (código) | Estado |
|---|---|---|
| R1 | `Dashboard.jsx:86` → `noAnswer = disp?.['NO ANSWER']?.count ?? 0`; usado en StatCard "Perdidas" (`Dashboard.jsx:138`, `value={noAnswer}`) | ✅ |
| R2 | `total = data?.stats?.total ?? 0` (línea 79) viene de `queryStats` = `ANSWERED.count + 'NO ANSWER'.count + BUSY.count + FAILED.count` (confirmado en `backend/server.js`: `total += Number(r.count)` para toda fila que pasa `passesFilter`, y las 4 claves de `base` cubren ANSWERED/NO ANSWER/BUSY/FAILED). `answered+noAnswer+busy+failed === total` se cumple por construcción del backend (ver design.md §6, verificado contra el código real) | ✅ |
| R3 | `noAnswer` se deriva exclusivamente de `disp?.['NO ANSWER']?.count`, sin ninguna referencia a `config.queues`/`__lost__`/`queues.find(...)` (línea 86) | ✅ |
| R4 | StatCard "Perdidas" recibe `pct={lostPct}` donde `lostPct = disp?.['NO ANSWER']?.pct ?? 0` (líneas 91, 139), igual patrón que "Contestadas"/"Fallidas" | ✅ |
| R5 | Tarjeta "Ocupado" independiente: `<StatCard label="Ocupado" value={busy} icon={PhoneOff} color="amber" sub="del total" pct={busyPct} />` (líneas 144-145), separada de "Perdidas" | ✅ |
| R6 | Todas las derivaciones (`answered`, `noAnswer`, `busy`, `failed`, `total`, y sus `pct`) usan `?? 0` (líneas 79, 85-98). `StatCard.jsx:16` renderiza `value?.toLocaleString('es-CO') ?? '—'` → para `value=0`, `0?.toLocaleString(...)` es `"0"` (no `'—'`), por lo que se muestra `0`, no `NaN`/`undefined`. Si `data === null` (antes del primer SSE), el bloque `{data && (...)}` ni siquiera renderiza las StatCards (línea 131) | ✅ |
| R7 | Bloque `queues.filter(q => q.queue !== '__lost__')` con render condicional `length > 0` y `<QueueCard key={q.queue} queue={q} />` permanece **sin modificación funcional** (líneas 175-179, idéntico al original salvo el comentario nuevo) | ✅ |
| R8 | `lostTotal` (basado en `queues.find(q => q.queue === '__lost__')`) fue **eliminado** (confirmado en diff: la línea `const lostTotal = queues.find(...)` ya no existe). Único grep de `__lost__` en `Dashboard.jsx` (3 ocurrencias): línea 36 (`isLost` dentro de `QueueCard`, sin relación con la tarjeta general "Perdidas") y líneas 175/177 (filtro de colas, R7). Cero referencias fuera de esos dos contextos. `lostTotal` no aparece en absoluto en el archivo | ✅ |
| R9 | Nuevas StatCards "Llamadas entrantes" (`value={inboundTotal}`, `inboundTotal = data?.inbound?.stats?.total ?? 0`) y "Llamadas salientes" (`value={outboundTotal}`, `outboundTotal = data?.outbound?.stats?.total ?? 0`), líneas 95-96 y 167-172 | ✅ |
| R10 | `inboundPct = total > 0 ? Math.round((inboundTotal / total) * 1000) / 10 : 0` y análogo para `outboundPct` (líneas 97-98) → `0%` exacto cuando `total === 0`, sin división por cero | ✅ |
| R11 | Ambos valores (`inboundTotal`, `outboundTotal`) se muestran tal cual vienen del backend, sin forzar `inboundTotal + outboundTotal === total`. No se implementó "Otros" (opcional según R11/tasks.md T5, omisión permitida explícitamente) | ✅ |
| R12 | `inboundTotal`/`outboundTotal` usan `?? 0` (líneas 95-96); si `data.inbound`/`data.outbound` están ausentes, `data?.inbound?.stats?.total` resuelve a `undefined` → `?? 0` → `0`; `inboundPct`/`outboundPct` dependen de `total` (también `?? 0`), por lo que en el peor caso (`total === 0`) el operador ternario devuelve `0` directamente sin tocar `inboundTotal/total`. No hay riesgo de `NaN`/`Infinity` | ✅ |
| R13 | Todas las magnitudes nuevas (`answered`, `noAnswer`, `busy`, `failed`, `inboundTotal`, `outboundTotal` y sus `pct`) se calculan como `const` en el cuerpo del componente función, derivadas directamente de `data` (líneas 78-98) — **no** hay `useEffect`/estado adicional. `data` se actualiza vía `setData` en `handleData`, pasado como `onInit`/`onUpdate` a `useSSE` (línea 75-76). Cada vez que `data` cambia (evento `init` o `update`), el componente re-renderiza completo y recalcula estas constantes — mismo mecanismo exacto que `disp`, `total`, `answered`/`failed` (preexistentes) ya usaban. Consistente con el comportamiento previo de "Contestadas"/"Fallidas" | ✅ |
| R14 | `git diff --stat HEAD` confirma que el único archivo de código modificado es `frontend/src/components/Dashboard.jsx` (45 líneas, +30/-15 netas). No se tocó `backend/server.js` ni ningún archivo de `backend/`. `cd backend && npm test` → 180/180 (sin cambios respecto a baseline) | ✅ |
| R15 | `git diff --stat HEAD` no muestra cambios en `HourlyChart.jsx`, `DispositionChart.jsx`, `ChannelTable.jsx`, `InboundView.jsx`, `OutboundView.jsx`, `HistoricalView.jsx`. `Dashboard.jsx` sigue invocando `<DispositionChart dispositions={disp} />` y `<HourlyChart hourly={hourly} />` con las mismas props que antes (líneas 185, 189) | ✅ |
| R16 | `git diff --stat HEAD` no incluye `package.json` ni `package-lock.json` de `frontend/` ni `backend/`. Iconos nuevos (`PhoneIncoming`, `PhoneOutgoing`) provienen de `lucide-react` ya instalado (`^0.376.0`). Sin nuevos endpoints, tablas SQLite o queries SQL — confirmado por R14 (sin diff en `backend/`) | ✅ |

## Verificación adicional de archivos modificados (R14-R16)

`git status --porcelain` y `git diff --stat HEAD` muestran:
- `frontend/src/components/Dashboard.jsx` — código de la feature (revisado arriba). ✅ esperado.
- `feature_list.json` — añade la entrada de la feature 16 con `"status": "in_progress"` (no `"done"`), artefacto de proceso del flujo SDD (creado en una fase anterior del leader, no por el implementer de esta feature). No infringe la regla "no marques features como done".
- `progress/current.md` — actualización de progreso (artefacto de proceso, permitido editar directamente según `CLAUDE.md`: "Cambios en `docs/`, `progress/`, `specs/` → puedes editarlos tú mismo").
- `progress/impl_dashboard_kpi_breakdown.md` (nuevo) y `specs/dashboard_kpi_breakdown/` (nuevo) — artefactos de proceso esperados (spec + informe del implementer).
- `backend/db/monitor.sqlite-shm` / `backend/db/monitor.sqlite-wal` — ya aparecían modificados en `git status` **antes** de iniciar esta sesión de review (snapshot inicial de `gitStatus`), son artefactos binarios de WAL de SQLite generados por la ejecución del servidor/tests, no relacionados con el código de esta feature.

Ningún archivo de `backend/` (código fuente), `package.json`/`package-lock.json`
(frontend o backend), ni nuevos componentes React fue modificado o creado.

## Verificación del diff exacto contra `design.md §5.1`

El diff de `Dashboard.jsx` (`git diff HEAD`) coincide exactamente con el
bloque de código propuesto en `design.md §5.1` y `tasks.md` T1-T6:
- Bloque de derivaciones (`answered`, `noAnswer`, `busy`, `failed` y sus
  `pct`, `inboundTotal`/`outboundTotal`/`inboundPct`/`outboundPct`) — idéntico
  carácter por carácter al propuesto en `design.md`.
- Eliminación de `const lostTotal = queues.find(q => q.queue === '__lost__')?.total ?? 0;` — confirmada.
- Grid principal: "Total llamadas" / "Contestadas" (`answered`/`answeredPct`)
  / "Perdidas" (`noAnswer`/`lostPct`, `icon={PhoneMissed}`,
  `sub="sin atender, del total"`) — coincide.
- Segundo grid: "Ocupado" (`busy`/`busyPct`, `icon={PhoneOff}`, `color="amber"`)
  + "Fallidas" + bloque resumen con `col-span-2 lg:col-span-2` (ajustado de
  `col-span-1 lg:col-span-3` original) — coincide con la nota de
  implementación de `design.md §5.1` ("el implementer puede ajustar el grid").
- Nuevo grid `grid-cols-1 sm:grid-cols-2 gap-4` con "Llamadas entrantes"
  (`PhoneIncoming`) / "Llamadas salientes" (`PhoneOutgoing`), comentado
  `{/* Desglose Entrantes / Salientes */}` — coincide.
- Bloque `QueueCard`/`queues.filter(q => q.queue !== '__lost__')` — sin
  cambios funcionales, idéntico al original.

## Iconos (T2)

Importación actualizada: `Phone, PhoneOff, PhoneMissed, AlertTriangle,
PhoneCall, PhoneIncoming, PhoneOutgoing, Wifi, WifiOff, RefreshCw, Users` —
todos los iconos preexistentes (`Phone`, `PhoneOff`, `PhoneMissed`,
`AlertTriangle`, `PhoneCall`, `Wifi`, `WifiOff`, `RefreshCw`, `Users`) se
conservan y siguen usándose; los dos nuevos (`PhoneIncoming`,
`PhoneOutgoing`) están importados y usados en las nuevas StatCards (verificado
por grep, todos los iconos importados aparecen referenciados en JSX).

## tasks.md

T1-T8 marcadas `[x]` en `specs/dashboard_kpi_breakdown/tasks.md`. T7 y T8
documentan honestamente las limitaciones del entorno (sin navegador/SSE en
vivo) y sustituyen la verificación manual por lectura de código línea por
línea + simulación aritmética con Node — aceptable dado `design.md §8` y la
naturaleza 100% frontend/sin Vitest de esta feature.

## Paso 3 — No-regresión

- `cd backend && npm test` → **180/180 passing**, 6 suites, sin cambios
  respecto al baseline (mismo número reportado en
  `progress/impl_dashboard_kpi_breakdown.md`). ✅
- `cd frontend && npm run build` → **compila sin errores** (`vite build`,
  2316 módulos transformados, `dist/` generado en ~16-19s, mismo bundle hash
  `index-BAyldPcl.js`/`index-DCXgbRpP.css` que el reportado por el
  implementer). ✅
- `./init.sh` (raíz) → **25/25 checks verdes**, incluye:
  - Herramientas (Node/npm/git) ✅
  - Estructura del arnés ✅
  - Consistencia de features (feature `dashboard_kpi_breakdown` `in_progress`,
    specs presentes) ✅
  - Backend: `npm test` verde ✅
  - Frontend: `npm run build` sin errores ✅

## Paso 4 — Convenciones

- Sin `console.log` de debug añadido (grep en `Dashboard.jsx` → 0 resultados). ✅
- Sin `fetch()` directo en componentes — no se introdujo ninguno (la feature
  no toca la capa de datos, sigue usando `useSSE`). ✅
- Sin TypeScript introducido (archivo sigue siendo `.jsx`, sin tipos). ✅
- Sin nuevas dependencias en `package.json`/`package-lock.json` de frontend
  ni backend (confirmado por `git diff --stat HEAD`, ninguno de esos archivos
  aparece modificado). ✅

## Paso 5 — Seguridad

No aplica cambio de superficie de seguridad: no hay nuevos endpoints, rutas
de auth, ni queries SQL. `git diff --stat HEAD` confirma que no se modificó
nada en `backend/` (incluyendo `server.js`, `routes/`, middlewares
`requireAuth`/`requireAdmin`). ✅

## Resumen

- Trazabilidad R1-R16: ✅ (16/16, verificación de código + git diff/status)
- No-regresión v1.0: ✅
- Convenciones: ✅
- Seguridad: ✅
- Tests backend: ✅ 180/180
- Build frontend: ✅
- init.sh: ✅ 25/25

**Decisión: APROBADO.**
**SIGUIENTE PASO OBLIGATORIO:** git add -A && git commit -m "feat(dashboard_kpi_breakdown): Corrección de KPI 'Perdidas' y desglose entrante/saliente en el dashboard"
Solo después del commit: marcar done en feature_list.json e iniciar la siguiente feature.
