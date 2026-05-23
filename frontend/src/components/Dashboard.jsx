import { useState, useCallback } from 'react';
import { Phone, PhoneOff, PhoneMissed, AlertTriangle, PhoneCall, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { StatCard } from './StatCard';
import { DispositionChart } from './DispositionChart';
import { HourlyChart } from './HourlyChart';
import { ChannelTable } from './ChannelTable';
import { useSSE } from '../hooks/useSSE';

function fmtTime(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Dashboard() {
  const [data, setData] = useState(null);

  const handleData = useCallback((d) => setData(d), []);

  const { connected } = useSSE('/api/events', { onInit: handleData, onUpdate: handleData });

  const disp     = data?.stats?.dispositions;
  const total    = data?.stats?.total ?? 0;
  const channels = data?.channels ?? [];
  const hourly   = data?.hourly   ?? [];

  function fmtDurAvg(sec) {
    if (!sec) return '0s';
    if (sec < 60) return `${Math.round(sec)}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  }

  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5 capitalize">{fmtDate(data?.generatedAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-slate-500">
              Actualizado: {fmtTime(data.generatedAt)}
            </span>
          )}
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
            connected
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-slate-400 bg-slate-700/50 border-slate-600'
          }`}>
            {connected
              ? <><Wifi className="w-3 h-3" /> En vivo</>
              : <><WifiOff className="w-3 h-3" /> Reconectando...</>
            }
          </div>
        </div>
      </div>

      {/* Sin datos */}
      {!data && (
        <div className="card flex items-center justify-center gap-3 py-12 text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Conectando con el servidor...</span>
        </div>
      )}

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total llamadas"
              value={total}
              icon={Phone}
              color="blue"
            />
            <StatCard
              label="Contestadas"
              value={disp?.ANSWERED?.count}
              sub="del total de llamadas"
              pct={disp?.ANSWERED?.pct}
              icon={PhoneCall}
              color="green"
            />
            <StatCard
              label="No contestadas"
              value={disp?.['NO ANSWER']?.count}
              sub="del total de llamadas"
              pct={disp?.['NO ANSWER']?.pct}
              icon={PhoneMissed}
              color="amber"
            />
            <StatCard
              label="Ocupado / Rechazadas"
              value={disp?.BUSY?.count}
              sub="del total de llamadas"
              pct={disp?.BUSY?.pct}
              icon={PhoneOff}
              color="red"
            />
          </div>

          {/* Segunda fila: fallidas + duración promedio */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Fallidas"
              value={disp?.FAILED?.count}
              sub="del total de llamadas"
              pct={disp?.FAILED?.pct}
              icon={AlertTriangle}
              color="slate"
            />
            <div className="card col-span-1 lg:col-span-3 flex items-center gap-8">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Duración prom. (contestadas)</p>
                <p className="text-2xl font-bold text-slate-100 mt-1">
                  {fmtDurAvg(disp?.ANSWERED?.avg_billsec)}
                </p>
              </div>
              <div className="h-10 w-px bg-slate-700" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Tiempo total en llamadas</p>
                <p className="text-2xl font-bold text-slate-100 mt-1">
                  {(() => {
                    const s = disp?.ANSWERED?.total_billsec ?? 0;
                    const h = Math.floor(s / 3600);
                    const m = Math.floor((s % 3600) / 60);
                    return h > 0 ? `${h}h ${m}m` : `${m}m`;
                  })()}
                </p>
              </div>
              <div className="h-10 w-px bg-slate-700" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Canales activos hoy</p>
                <p className="text-2xl font-bold text-slate-100 mt-1">{channels.length}</p>
              </div>
            </div>
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="card lg:col-span-2">
              <h2 className="text-sm font-semibold text-slate-200 mb-4">Distribución de llamadas</h2>
              <DispositionChart dispositions={disp} />
            </div>
            <div className="card lg:col-span-3">
              <h2 className="text-sm font-semibold text-slate-200 mb-4">Llamadas por hora (hoy)</h2>
              <HourlyChart hourly={hourly} />
            </div>
          </div>

          {/* Tabla canales */}
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-200 mb-4">
              Estadísticas por canal
              <span className="ml-2 text-xs font-normal text-slate-500">({channels.length} canales)</span>
            </h2>
            <ChannelTable channels={channels} />
          </div>
        </>
      )}
    </div>
  );
}
