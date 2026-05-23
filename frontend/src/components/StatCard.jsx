export function StatCard({ label, value, sub, color, icon: Icon, pct }) {
  const colors = {
    green:  { bg: 'bg-emerald-500/10', icon: 'text-emerald-400', bar: 'bg-emerald-500', text: 'text-emerald-400' },
    amber:  { bg: 'bg-amber-500/10',   icon: 'text-amber-400',   bar: 'bg-amber-500',   text: 'text-amber-400' },
    red:    { bg: 'bg-red-500/10',     icon: 'text-red-400',     bar: 'bg-red-500',     text: 'text-red-400' },
    slate:  { bg: 'bg-slate-500/10',   icon: 'text-slate-400',   bar: 'bg-slate-500',   text: 'text-slate-400' },
    blue:   { bg: 'bg-blue-500/10',    icon: 'text-blue-400',    bar: 'bg-blue-500',    text: 'text-blue-400' },
  };
  const c = colors[color] || colors.blue;

  return (
    <div className="card animate-fade-in">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-3xl font-bold text-slate-100">{value?.toLocaleString('es-CO') ?? '—'}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
      </div>

      {pct !== undefined && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>{sub}</span>
            <span className={c.text}>{pct}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-1.5">
            <div
              className={`${c.bar} h-1.5 rounded-full transition-all duration-700`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
