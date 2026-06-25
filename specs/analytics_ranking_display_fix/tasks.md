# Tasks — analytics_ranking_display_fix

Feature #43: Analytics: ocultar col No Cont. en agentes y duración en minutos en troncales

---

- [x] T1. En `frontend/src/components/HistoricalAnalytics.jsx`, función `RankingsSection`,
      localizar el `<thead>` de la tabla de rankings (aprox. línea 414).
      Envolver el `<th>` de "Llamadas No cont." en una condición:
      `{rankType !== 'extension' && <th ...>Llamadas No cont.</th>}`

- [x] T2. En el mismo componente, localizar el `<tbody>` de la tabla de rankings.
      Envolver el `<td>` que renderiza `row.no_answer` con la misma condición:
      `{rankType !== 'extension' && <td ...>{row.no_answer}</td>}`

- [x] T3. En el `<th>` de duración, cambiar el literal condicional:
      - De: `{rankType === 'extension' ? 'Dur. media (min)' : 'Dur. media (s)'}`
      - A:  `'Dur. media (min)'` (mismo encabezado para ambos tipos)

- [x] T4. En el `<td>` de duración del row (trunk branch), cambiar el render:
      - De: `` `${row.avg_duration} s` ``
      - A:  `` `${(row.avg_duration / 60).toFixed(1)} min` ``
      La rama de agentes (`rankType === 'extension'`) ya muestra min correctamente,
      no tocar.

- [ ] T5. Verificación manual: consultar Rankings tipo "Agentes" — confirmar que
      la columna "Llamadas No cont." no aparece en header ni en filas.

- [ ] T6. Verificación manual: consultar Rankings tipo "Troncales" — confirmar que
      "Llamadas No cont." sí aparece y que la columna de duración muestra minutos
      (p.ej. un valor que antes era "120 s" ahora aparece como "2.0 min").

- [ ] T7. Ejecutar `npm run build` desde la raíz — confirmar 0 errores de compilación.
