'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

type EntradaTooltip = { name?: string; value?: number; color?: string }

const formatCurrency = (value: number) => value.toLocaleString('es-CO');

/**
 * Va fuera de BalanceChart: definido adentro se creaba un componente nuevo en
 * cada render y React lo desmontaba y montaba otra vez.
 */
function TooltipBalance({ active, payload, label }: { active?: boolean; payload?: EntradaTooltip[]; label?: string | number }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="flex min-w-[210px] flex-col gap-2 rounded-2xl border border-linea bg-panel p-4 shadow-strong">
      <p className="mb-1 text-sm font-medium text-gris">Día {label}</p>
      {payload
        .filter((e) => e.name !== 'balanceArea')
        .map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></div>
              <span className="text-sm text-tinta">{entry.name}</span>
            </div>
            <span
              className={`font-semibold ${entry.name === 'Utilidad acumulada' ? 'text-tinta' : entry.name === 'Ingresos' ? 'text-verde' : 'text-rojo'}`}
            >
              ${formatCurrency(Number(entry.value ?? 0))}
            </span>
          </div>
        ))}
    </div>
  );
}

interface BalanceChartProps {
  data: { date: string; ingresos: number; egresos: number; balance: number }[];
  utilidadMes: number;
  displayMonthName: string;
}

export function BalanceChart({ data }: BalanceChartProps) {
  const abreviar = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${Math.round(v / 1000)}k`;
    return `$${v}`;
  };

  const colors = {
    surface: 'rgb(var(--surface-1))',
    muted: 'rgb(var(--text-muted))',
    grid: 'rgb(var(--border))',
    success: 'rgb(var(--success))',
    danger: 'rgb(var(--danger))',
    line: 'rgb(var(--text-primary))',
    cursor: 'rgba(var(--text-muted), 0.08)',
  } as const;

  // Etiquetas de eje X espaciadas para no saturar cuando hay muchos días
  const step = data.length > 16 ? Math.ceil(data.length / 8) : 1;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-tinta">Balance diario</h3>
          <p className="text-sm text-gris">Ingresos, egresos y utilidad acumulada del período</p>
        </div>
        <div className="flex items-center gap-4 text-sm text-gris">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-verde" /> Ingresos</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rojo" /> Egresos</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-tinta" /> Utilidad acumulada</span>
        </div>
      </div>

      <div className="w-full h-[300px] md:h-[360px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: colors.muted }}
              dy={8}
              interval={step - 1}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: colors.muted }}
              tickFormatter={abreviar}
              width={58}
            />
            <Tooltip content={<TooltipBalance />} cursor={{ fill: colors.cursor }} />
            <Legend verticalAlign="top" height={0} content={() => null} />

            <Bar dataKey="ingresos" name="Ingresos" fill={colors.success} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="egresos" name="Egresos" fill={colors.danger} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />

            <Line
              type="monotone"
              dataKey="balance"
              name="Utilidad acumulada"
              stroke={colors.line}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: colors.line, stroke: colors.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
