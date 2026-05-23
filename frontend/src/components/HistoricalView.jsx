import { useState } from 'react';
import { Search, Download } from 'lucide-react';
import { api } from '../api';
import { DispositionChart } from './DispositionChart';
import { HourlyChart } from './HourlyChart';
import { ChannelTable } from './ChannelTable';
import { StatCard } from './StatCard';
import { Phone, PhoneCall, PhoneMissed, PhoneOff, AlertTriangle } from 'lucide-react';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function HistoricalView() {
  const [from, setFrom]     = useState(todayStr());
  const [to, setTo]         = useState(todayStr());
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  async function search() {
    if (!from || !to) return;
    setError('');
    setLoading(true);
    try {
      const result = await api.range(from, to);
      setData(result);
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const disp           = data?.stats?.dispositions;
  const total          = data?.stats?.total ?? 0;
  const channels       = data?.channels ?? [];
  const hourly         = data?.hourly   ?? [];
  const channelAliases = data?.channelAliases ?? {};

  function exportCSV() {
    if (!channels.length) return;
    const header = 'Canal,Total,Contestadas,No contestadas,Ocupado,Fallidas,Tiempo (s)\n';
    const rows = channels.map(ch =>
      `${ch.channel},${ch.total},${ch.ANSWERED},${ch['NO ANSWER']},${ch.BUSY},${ch.FAILED},${ch.total_billsec}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `llamadas_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Histórico de llamadas</h1>
        <p className="text-slate-500 text-sm mt-0.5">Consulta estadísticas por rango de fechas</p>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Fecha desde</label>
            <input
              type="date"
              className="input w-40"
              value={from}
              max={todayStr()}
              onChange={e => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Fecha hasta</label>
            <input
              type="date"
              className="input w-40"
              value={to}
              max={todayStr()}
              onChange={e => setTo(e.target.value)}
            />
          </div>
          <button
            onClick={search}
            disabled={loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Search className="w-4 h-4" />
            }
            Buscar
          </button>

          {data && (
            <button onClick={exportCSV} className="btn-ghost flex items-center gap-2 ml-auto">
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
          )}
        </div>

        {error && (
          <div className="mt-3 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Resultados */}
      {data && (
        <div className="space-y-6 animate-fade-in">
          {/* Período */}
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>Mostrando resultados del</span>
            <span className="text-slate-200 font-medium">{fmtDate(from)}</span>
            <span>al</span>
            <span className="text-slate-200 font-medium">{fmtDate(to)}</span>
            <span>—</span>
            <span className="text-blue-400 font-semibold">{total.toLocaleString('es-CO')} llamadas en total</span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Total"         value={total}                        icon={Phone}         color="blue" />
            <StatCard label="Contestadas"   value={disp?.ANSWERED?.count}        icon={PhoneCall}     color="green"
              sub="del total" pct={disp?.ANSWERED?.pct} />
            <StatCard label="No contestadas" value={disp?.['NO ANSWER']?.count}  icon={PhoneMissed}   color="amber"
              sub="del total" pct={disp?.['NO ANSWER']?.pct} />
            <StatCard label="Ocupado"       value={disp?.BUSY?.count}            icon={PhoneOff}      color="red"
              sub="del total" pct={disp?.BUSY?.pct} />
            <StatCard label="Fallidas"      value={disp?.FAILED?.count}          icon={AlertTriangle} color="slate"
              sub="del total" pct={disp?.FAILED?.pct} />
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="card lg:col-span-2">
              <h2 className="text-sm font-semibold text-slate-200 mb-4">Distribución</h2>
              <DispositionChart dispositions={disp} />
            </div>
            <div className="card lg:col-span-3">
              <h2 className="text-sm font-semibold text-slate-200 mb-4">Distribución por hora</h2>
              <HourlyChart hourly={hourly} />
            </div>
          </div>

          {/* Tabla canales */}
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-200 mb-4">
              Por canal
              <span className="ml-2 text-xs font-normal text-slate-500">({channels.length} canales)</span>
            </h2>
            <ChannelTable channels={channels} channelAliases={channelAliases} />
          </div>
        </div>
      )}

      {!data && !loading && (
        <div className="card flex items-center justify-center py-16 text-slate-500 text-sm">
          Selecciona un rango de fechas y presiona Buscar
        </div>
      )}
    </div>
  );
}
