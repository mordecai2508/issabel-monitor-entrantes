# Tasks — Feature #50: rankings_split_cards

Archivo objetivo: `frontend/src/components/HistoricalAnalytics.jsx`
No se modifica ningún otro archivo.

---

## T1 — Crear el componente `RankingCard`

- [x] Insertar la función `RankingCard({ type })` **inmediatamente antes** de la función
  `RankingsSection` (actualmente en la línea 329).
- [x] El componente gestiona su propio estado independiente:
  ```js
  const [period,  setPeriod]  = useState('month');
  const [from,    setFrom]    = useState(() => getDateRangeForPeriod('month').from);
  const [to,      setTo]      = useState(() => getDateRangeForPeriod('month').to);
  const [limit,   setLimit]   = useState(10);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  ```
- [x] Implementar `handlePeriodChange(p)`: actualiza `period`; si `p !== 'custom'`, calcula
  `from`/`to` con `getDateRangeForPeriod(p)`.
- [x] Implementar `handleQuery()`: llama `api.statsRankings({ from, to, type, limit })`,
  guarda `result.data` en `setData`, maneja errores con `setError`.
- [x] Derivar `title` y `isTrunk` del prop `type`:
  ```js
  const title   = type === 'trunk' ? 'Ranking de troncales' : 'Ranking de agentes';
  const isTrunk = type === 'trunk';
  ```

## T2 — Renderizar el selector de período en `RankingCard`

- [x] Incluir el componente `PeriodSelector` ya existente sin modificarlo:
  ```jsx
  <PeriodSelector
    period={period}
    from={from}
    to={to}
    onPeriodChange={handlePeriodChange}
    onFromChange={setFrom}
    onToChange={setTo}
    onQuery={handleQuery}
    loading={loading}
  />
  ```

## T3 — Renderizar el control Top N en `RankingCard`

- [x] Añadir un `<div>` con `flex items-center gap-2` justo después de `<PeriodSelector>`:
  ```jsx
  <div className="flex items-center gap-2">
    <label className="text-xs text-slate-400">Top</label>
    <input
      type="number"
      min="1"
      max="50"
      value={limit}
      onChange={e => setLimit(Number(e.target.value))}
      className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 w-16 focus:outline-none focus:border-blue-500"
    />
  </div>
  ```

## T4 — Renderizar spinner, error y estado vacío en `RankingCard`

- [x] Añadir `{loading && <Spinner />}` (componente existente, no modificar).
- [x] Añadir `{error && <ErrorBanner message={error} />}` (componente existente, no modificar).
- [x] Cuando `!loading && !error && data && data.rankings.length === 0`, mostrar:
  ```jsx
  <div className="flex items-center justify-center h-24 text-slate-500 text-sm">
    Sin datos para el rango seleccionado
  </div>
  ```

## T5 — Renderizar la tabla condicional en `RankingCard`

- [x] Cuando `!loading && !error && data && data.rankings.length > 0`, renderizar
  `<div className="overflow-x-auto"><table className="w-full text-sm">...</table></div>`.
- [x] **Cabecera `thead`** — columnas según `isTrunk`:
  - Siempre: `#`, `Nombre`, `Contestadas` (o `Llamadas contestadas` si !isTrunk),
    `Dur. media (min)`.
  - Solo si `isTrunk`: insertar `Total` antes de `Contestadas` y `No cont.` después de
    `Contestadas`.
- [x] **Cuerpo `tbody`** — iterar `data.rankings.map((row, idx) => ...)`:
  - `#`: `{idx + 1}` con clase `text-slate-500`.
  - `Nombre`: `{row.name}` con `font-mono text-xs text-slate-200`.
  - `Total` (solo troncales): `{row.total}` `text-slate-200`.
  - `Contestadas`: `{row.answered}` `text-slate-200`.
  - `No cont.` (solo troncales): `{row.no_answer}` `text-amber-400`.
  - `Dur. media`:
    - Troncales: `{(row.avg_duration / 60).toFixed(1)} min` `text-slate-300`.
    - Agentes: `{row.avg_duration} min` `text-slate-300`.

## T6 — Reemplazar el cuerpo de `RankingsSection`

- [x] Borrar todo el contenido actual de la función `RankingsSection` (líneas 329–454 del
  archivo original).
- [x] Reemplazar por:
  ```jsx
  function RankingsSection() {
    return (
      <>
        <RankingCard type="trunk" />
        <RankingCard type="extension" />
      </>
    );
  }
  ```
- [x] Verificar que el componente `RankingsSection` sigue exportándose indirectamente
  (es consumido por `HistoricalAnalytics` en la línea 468; no tocar esa línea).

## T7 — Verificación manual

- [x] Arrancar el frontend (`npm run dev:frontend`).
- [x] Navegar a Analytics histórico.
- [x] Comprobar que aparecen **dos secciones independientes** de ranking, una para troncales y
  otra para agentes, ambas visibles al mismo tiempo.
- [x] Cambiar el período en la sección de Troncales a "Semana" y pulsar "Consultar"; verificar
  que la sección de Agentes no se ve afectada.
- [x] Cambiar el Top N de Agentes a 5, pulsar "Consultar"; verificar que devuelve como máximo 5
  filas y que Troncales mantiene su propio Top N.
- [x] Comprobar que la sección de Tendencia y la sección de Comparativa siguen funcionando.
- [x] Verificar que no hay errores en la consola del navegador.
