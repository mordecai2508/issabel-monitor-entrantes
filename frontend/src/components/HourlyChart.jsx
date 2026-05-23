import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

export function HourlyChart({ hourly }) {
  if (!hourly) return null;

  const data = hourly.map(h => ({
    hora:        `${String(h.hour).padStart(2, '0')}h`,
    Contestadas: h.ANSWERED,
    'No Contest.': h['NO ANSWER'],
    Ocupado:     h.BUSY,
    Fallidas:    h.FAILED,
  }));

  const total = data.reduce((s, d) => s + d.Contestadas + d['No Contest.'] + d.Ocupado + d.Fallidas, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
        Sin datos para mostrar
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="hora" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
          cursor={{ fill: '#334155' }}
        />
        <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>} />
        <Bar dataKey="Contestadas" stackId="a" fill="#22c55e" radius={[0,0,0,0]} />
        <Bar dataKey="No Contest." stackId="a" fill="#f59e0b" />
        <Bar dataKey="Ocupado"     stackId="a" fill="#ef4444" />
        <Bar dataKey="Fallidas"    stackId="a" fill="#6b7280" radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
