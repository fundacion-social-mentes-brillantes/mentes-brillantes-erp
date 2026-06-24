'use client';

import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface BalanceChartProps {
  data: { date: string; ingresos: number; egresos: number; balance: number }[];
  utilidadMes: number;
  displayMonthName: string;
}

export function BalanceChart({ data, displayMonthName }: BalanceChartProps) {
  const formatCurrency = (value: number) => value.toLocaleString('es-CO');
  const abreviar = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${Math.round(v / 1000)}k`;
    return `$${v}`;
  };

  const colors = {
    surface: 'rgb(var(--surface-1))',
    muted: 'rgb(var(--text-muted))',
    grid: 'rgba(var(--text-muted),0.16)',
    success: 'rgb(var(--success))',
    danger: 'rgb(var(--danger))',
    gold: 'rgb(var(--warning))',
    cursor: 'rgba(var(--warning),0.10)',
  } as const;

  // Etiquetas de eje X espaciadas para no saturar cuando hay muchos días
  const step = data.length > 16 ? Math.ceil(data.length / 8) : 1;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[rgb(var(--surface-1))] backdrop-blur-md border border-[rgba(var(--border),0.7)] p-4 rounded-2xl shadow-strong flex flex-col gap-2 min-w-[210px]">
          <p className="text-[rgb(var(--text-muted))] font-medium text-xs mb-1 uppercase tracking-wider">Día {label}</p>
          {payload
            .filter((e: any) => e.dataKey !== 'balanceArea')
            .map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></div>
                  <span className="text-sm text-[rgb(var(--text-primary))]">{entry.name}</span>
                </div>
                <span
                  className={`font-semibold ${entry.name === 'Utilidad acumulada' ? 'text-[rgb(var(--warning))]' : entry.name === 'Ingresos' ? 'text-[rgb(var(--success))]' : 'text-[rgb(var(--danger))]'}`}
                >
                  ${formatCurrency(entry.value)}
                </span>
              </div>
            ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-[rgb(var(--text-primary))]">Balance diario</h3>
          <p className="text-xs text-[rgb(var(--text-muted))]">Ingresos, egresos y utilidad acumulada del período</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-medium text-[rgb(var(--text-muted))]">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[rgb(var(--success))]" /> Ingresos</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[rgb(var(--danger))]" /> Egresos</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[rgb(var(--warning))]" /> Utilidad</span>
        </div>
      </div>

      <div className="w-full h-[300px] md:h-[360px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.success} stopOpacity={0.95} />
                <stop offset="100%" stopColor={colors.success} stopOpacity={0.45} />
              </linearGradient>
              <linearGradient id="gradEgresos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.danger} stopOpacity={0.95} />
                <stop offset="100%" stopColor={colors.danger} stopOpacity={0.45} />
              </linearGradient>
              <linearGradient id="gradUtilidad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.gold} stopOpacity={0.34} />
                <stop offset="100%" stopColor={colors.gold} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: colors.muted }}
              dy={8}
              interval={step - 1}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: colors.muted }}
              tickFormatter={abreviar}
              width={58}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: colors.cursor }} />
            <Legend verticalAlign="top" height={0} content={() => null} />

            {/* Área suave bajo la utilidad acumulada */}
            <Area type="monotone" dataKey="balance" name="balanceArea" stroke="none" fill="url(#gradUtilidad)" isAnimationActive />

            <Bar dataKey="ingresos" name="Ingresos" fill="url(#gradIngresos)" radius={[5, 5, 0, 0]} maxBarSize={26} />
            <Bar dataKey="egresos" name="Egresos" fill="url(#gradEgresos)" radius={[5, 5, 0, 0]} maxBarSize={26} />

            <Line
              type="monotone"
              dataKey="balance"
              name="Utilidad acumulada"
              stroke={colors.gold}
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: colors.gold, stroke: colors.surface, strokeWidth: 2 }}
              isAnimationActive
              animationDuration={900}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
