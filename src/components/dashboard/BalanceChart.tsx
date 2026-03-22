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
  Cell
} from 'recharts';

interface BalanceChartProps {
  data: { date: string; ingresos: number; egresos: number; balance: number }[];
  utilidadMes: number;
  displayMonthName: string;
}

export function BalanceChart({ data, utilidadMes, displayMonthName }: BalanceChartProps) {
  const formatCurrency = (value: number) => {
    return value.toLocaleString('es-CO');
  };

  const colors = {
    surface: 'rgba(var(--surface-1),0.9)',
    border: 'rgb(var(--border))',
    muted: 'rgb(var(--text-muted))',
    mutedSurface: 'rgb(var(--muted-surface))',
    success: 'rgb(var(--success))',
    danger: 'rgb(var(--danger))',
    info: 'rgb(var(--info))',
    cursor: 'rgba(var(--muted-surface),0.35)',
  } as const;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[rgba(var(--surface-1),0.9)] backdrop-blur-md border border-[rgb(var(--border))] p-4 rounded-xl shadow-soft flex flex-col gap-2 min-w-[200px]">
          <p className="text-[rgb(var(--text-muted))] font-medium text-xs mb-1 uppercase tracking-wider">Día {label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
                <span className="text-sm text-[rgb(var(--text-primary))] capitalize">{entry.name}</span>
              </div>
              <span className={`font-semibold ${entry.name === 'Utilidad Acumulada' ? 'text-[rgb(var(--info))]' : entry.name === 'Ingresos' ? 'text-[rgb(var(--success))]' : 'text-[rgb(var(--danger))]'}`}>
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
    <div className="flex-1 flex flex-col min-h-[350px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <p className="text-sm font-medium text-[rgb(var(--text-muted))] mb-1">Utilidad Bruta ({displayMonthName})</p>
          <div className="flex items-end gap-3">
            <p className={`text-4xl font-extrabold tracking-tight ${utilidadMes >= 0 ? 'text-[rgb(var(--success))]' : 'text-[rgb(var(--danger))]'}`}>
              ${formatCurrency(utilidadMes)}
            </p>
          </div>
        </div>
      </div>
      
      <div className="flex-1 w-full h-full min-h-[250px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.mutedSurface} />
            <XAxis 
              dataKey="date" 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: colors.muted }}
              dy={10}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: colors.muted }}
              tickFormatter={(value) => `$${(value / 1000)}k`}
              width={65}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: colors.cursor, opacity: 0.35 }} />
            
            <Legend 
              verticalAlign="top" 
              height={36} 
              iconType="circle"
              wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }}
            />
            
            <Bar 
              dataKey="ingresos" 
              name="Ingresos" 
              fill={colors.success} 
              radius={[4, 4, 0, 0]}
              barSize={20}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-in-${index}`} fill={colors.success} fillOpacity={0.85} />
              ))}
            </Bar>
            
            <Bar 
              dataKey="egresos" 
              name="Egresos" 
              fill={colors.danger} 
              radius={[4, 4, 0, 0]}
              barSize={20}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-out-${index}`} fill={colors.danger} fillOpacity={0.85} />
              ))}
            </Bar>
            
            <Line 
              type="monotone" 
              dataKey="balance" 
              name="Utilidad Acumulada"
              stroke={colors.info} 
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: colors.info, stroke: colors.surface, strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

