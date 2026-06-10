import { useState, useCallback } from 'react';
import {
  Phone, PhoneOff, PhoneMissed, AlertTriangle, PhoneCall,
  PhoneIncoming, PhoneOutgoing,
  Wifi, WifiOff, RefreshCw, Users,
} from 'lucide-react';
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
  return new Date(isoStr).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtDuration(sec) {
  if (!sec) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function QueueCard({ queue }) {
  const isLost   = queue.queue === '__lost__';
  const answered = queue.ANSWERED ?? 0;
  const total    = queue.total    ?? 0;
  const pct      = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isLost ? 'bg-red-500/10' : 'bg-blue-500/10'
          }`}>
            <Users className={`w-4 h-4 ${isLost ? 'text-red-400' : 'text-blue-400'}`} />
          </div>
          <span className="text-sm font-semibold text-slate-200">{queue.label}</span>
        </div>
        <span className="text-2xl font-bold text-slate-100">{total}</span>
      </div>
      {!isLost && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Contestadas</span>
            <span className="text-emerald-400 font-medium">{answered} ({pct}%)</span>
          </div>
          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-600">
            <span>No contest.: <span className="text-amber-400">{queue['NO ANSWER'] ?? 0}</span></span>
            <span>Ocupado: <span className="text-red-400">{queue.BUSY ?? 0}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const handleData = useCallback((d) => setData(d), []);
  const { connected } = useSSE('/api/events', { onInit: handleData, onUpdate: handleData });

  const disp           = data?.stats?.dispositions;
  const total          = data?.stats?.total ?? 0;
  const channels       = data?.inbound?.channels ?? [];
  const hourly         = data?.hourly   ?? [];
  const queues         = data?.queues   ?? [];
  const channelAliases = data?.channelAliases ?? {};

  const answered = disp?.ANSWERED?.count   ?? 0;
  const noAnswer = disp?.['NO ANSWER']?.count ?? 0;
  const busy     = disp?.BUSY?.count       ?? 0;
  const failed   = disp?.FAILED?.count     ?? 0;

  const answeredPct = disp?.ANSWERED?.pct     ?? 0;
  const lostPct     = disp?.['NO ANSWER']?.pct ?? 0;
  const busyPct     = disp?.BUSY?.pct          ?? 0;
  const failedPct   = disp?.FAILED?.pct        ?? 0;

  const inboundTotal  = data?.inbound?.stats?.total  ?? 0;
  const outboundTotal = data?.outbound?.stats?.total ?? 0;
  const inboundPct  = total > 0 ? Math.round((inboundTotal  / total) * 1000) / 10 : 0;
  const outboundPct = total > 0 ? Math.round((outboundTotal / total) * 1000) / 10 : 0;

  return (
    <div className="p-6 space-y-6 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-3xl font-bold text-slate-100 capitalize leading-tight">
            {fmtDate(data?.generatedAt)}
          </p>
          {data && (
            <p className="text-lg text-slate-400 mt-1">
              Última actualización: <span className="text-slate-200 tabular-nums">{fmtTime(data.generatedAt)}</span>
            </p>
          )}
        </div>
        <div className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border shrink-0 ${
          connected
            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            : 'text-slate-400 bg-slate-700/50 border-slate-600'
        }`}>
          {connected ? <><Wifi className="w-4 h-4" /> En vivo</> : <><WifiOff className="w-4 h-4" /> Reconectando...</>}
        </div>
      </div>

      {!data && (
        <div className="card flex items-center justify-center gap-3 py-12 text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Conectando con el servidor...</span>
        </div>
      )}

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total llamadas" value={total}     icon={Phone}      color="blue" />
            <StatCard label="Contestadas"    value={answered}  icon={PhoneCall}  color="green"
              sub="del total" pct={answeredPct} />
            <StatCard label="Perdidas"       value={noAnswer}  icon={PhoneMissed} color="red"
              sub="sin atender, del total" pct={lostPct} />
          </div>

          {/* Ocupado + Fallidas + resumen de duración/canales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Ocupado" value={busy} icon={PhoneOff} color="amber"
              sub="del total" pct={busyPct} />
            <StatCard label="Fallidas" value={failed} icon={AlertTriangle} color="slate"
              sub="del total" pct={failedPct} />
            <div className="card col-span-2 lg:col-span-2 flex flex-wrap items-center gap-8">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Duración prom. contestadas</p>
                <p className="text-2xl font-bold text-slate-100 mt-1">{fmtDuration(disp?.ANSWERED?.avg_billsec ?? 0)}</p>
              </div>
              <div className="h-10 w-px bg-slate-700" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Tiempo total en llamadas</p>
                <p className="text-2xl font-bold text-slate-100 mt-1">{fmtDuration(disp?.ANSWERED?.total_billsec ?? 0)}</p>
              </div>
              <div className="h-10 w-px bg-slate-700" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Canales activos hoy</p>
                <p className="text-2xl font-bold text-slate-100 mt-1">{channels.length}</p>
              </div>
            </div>
          </div>

          {/* Desglose Entrantes / Salientes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard label="Llamadas entrantes" value={inboundTotal} icon={PhoneIncoming} color="blue"
              sub="del total" pct={inboundPct} />
            <StatCard label="Llamadas salientes" value={outboundTotal} icon={PhoneOutgoing} color="blue"
              sub="del total" pct={outboundPct} />
          </div>

          {/* Colas de entrada (sin repetir Perdidas que ya aparece arriba) */}
          {queues.filter(q => q.queue !== '__lost__').length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {queues.filter(q => q.queue !== '__lost__').map(q => <QueueCard key={q.queue} queue={q} />)}
            </div>
          )}

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
          {channels.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-slate-200 mb-4">
                Estadísticas por canal
                <span className="ml-2 text-xs font-normal text-slate-500">({channels.length} canales)</span>
              </h2>
              <ChannelTable channels={channels} channelAliases={channelAliases} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
