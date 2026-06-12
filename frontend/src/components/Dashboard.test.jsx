import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { api } from '../api';
import { useSSE } from '../hooks/useSSE';
import Dashboard from './Dashboard';

// Mock src/api.js — Dashboard.jsx must never `fetch()` directly (conventions),
// so we isolate the component from the network entirely.
vi.mock('../api', () => ({
  api: {
    pbxExtensions: vi.fn(),
  },
}));

// Mock useSSE so the dashboard renders its KPIs/StatCards (which only render
// when `data` is truthy) without opening a real EventSource/SSE connection.
vi.mock('../hooks/useSSE', () => ({
  useSSE: vi.fn(),
}));

// Mock the chart components — they wrap Recharts' ResponsiveContainer, which
// needs real layout dimensions to render meaningfully in jsdom. Mocking keeps
// these tests focused on the "Extensiones"/"Activas" indicators (R14-R17)
// and avoids unrelated noise/instability from chart rendering.
vi.mock('./DispositionChart', () => ({
  DispositionChart: () => <div data-testid="disposition-chart" />,
}));
vi.mock('./HourlyChart', () => ({
  HourlyChart: () => <div data-testid="hourly-chart" />,
}));
vi.mock('./ChannelTable', () => ({
  ChannelTable: () => <div data-testid="channel-table" />,
}));

const SAMPLE_DATA = {
  generatedAt: '2026-06-12T10:00:00.000Z',
  stats: {
    total: 100,
    dispositions: {
      ANSWERED:     { count: 70, pct: 70, avg_billsec: 120, total_billsec: 8400 },
      'NO ANSWER':  { count: 20, pct: 20 },
      BUSY:         { count: 5,  pct: 5 },
      FAILED:       { count: 5,  pct: 5 },
    },
  },
  inbound:  { stats: { total: 60 }, channels: [] },
  outbound: { stats: { total: 40 } },
  hourly: [],
  queues: [],
  channelAliases: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: useSSE delivers SAMPLE_DATA via onInit so the "data &&" branch
  // (with the StatCards) renders. The callback is deferred to a microtask —
  // calling setState synchronously during the initial render (i.e. while
  // useSSE itself is being called from the component body) would trigger
  // React's "too many re-renders" guard.
  useSSE.mockImplementation((_url, { onInit } = {}) => {
    queueMicrotask(() => onInit?.(SAMPLE_DATA));
    return { connected: true };
  });
});

describe('Dashboard - indicadores de extensiones AMI (R14-R17)', () => {

  it('R14 - muestra un indicador "Extensiones" con el valor `total` de api.pbxExtensions()', async () => {
    api.pbxExtensions.mockResolvedValue({
      ok: true,
      data: { total: 12, active: 9, extensions: [], available: true },
    });

    render(<Dashboard />);

    expect(await screen.findByText('Extensiones')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument();
    });
  });

  it('R15 - muestra un indicador "Activas" con el valor `active` de api.pbxExtensions()', async () => {
    api.pbxExtensions.mockResolvedValue({
      ok: true,
      data: { total: 12, active: 9, extensions: [], available: true },
    });

    render(<Dashboard />);

    expect(await screen.findByText('Activas')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('9')).toBeInTheDocument();
    });
  });

  it('R16 - cuando available === false, los indicadores se muestran con degradación visual sin afectar el resto de KPIs', async () => {
    api.pbxExtensions.mockResolvedValue({
      ok: true,
      data: { total: 0, active: 0, extensions: [], available: false },
    });

    render(<Dashboard />);

    const extensionesLabel = await screen.findByText('Extensiones');

    // El contenedor de los indicadores de extensiones debe llevar una clase
    // de atenuación visual (opacity-*) cuando available === false.
    const dimmedContainer = extensionesLabel.closest('[class*="opacity-"]');
    expect(dimmedContainer).not.toBeNull();

    // El resto de KPIs (p. ej. "Total llamadas") sigue presente y sin
    // atenuar, es decir, el resto del dashboard no se ve afectado.
    expect(screen.getByText('Total llamadas')).toBeInTheDocument();
    const totalLlamadasContainer = screen.getByText('Total llamadas').closest('[class*="opacity-"]');
    expect(totalLlamadasContainer).toBeNull();
  });

  it('R17 - si api.pbxExtensions() falla, el dashboard no rompe y muestra el estado neutro (total: 0, active: 0, available: false)', async () => {
    api.pbxExtensions.mockRejectedValue(new Error('network error'));

    render(<Dashboard />);

    // El resto del dashboard sigue renderizando con normalidad.
    expect(await screen.findByText('Total llamadas')).toBeInTheDocument();

    const extensionesLabel = await screen.findByText('Extensiones');
    const activasLabel = screen.getByText('Activas');

    // Estado neutro: ambos indicadores muestran 0.
    await waitFor(() => {
      const card = extensionesLabel.closest('.card');
      expect(card.textContent).toContain('0');
    });

    const activasCard = activasLabel.closest('.card');
    expect(activasCard.textContent).toContain('0');

    // Y permanecen en el contenedor atenuado (available: false).
    const dimmedContainer = extensionesLabel.closest('[class*="opacity-"]');
    expect(dimmedContainer).not.toBeNull();
  });
});
