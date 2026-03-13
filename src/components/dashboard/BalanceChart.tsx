'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface BalanceChartProps {
  data: { date: string; balance: number }[];
  utilidadMes: number;
  displayMonthName: string;
}

export function BalanceChart({ data, utilidadMes, displayMonthName }: BalanceChartProps) {
  const formatCurrency = (value: number) => {
    return value.toLocaleString('es-CO');
  };

  return (
    <div className="flex-1 flex flex-col min-h-[300px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-zinc-500">Utilidad Bruta ({displayMonthName})</p>
          <p className={`text-3xl font-bold ${utilidadMes >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            ${formatCurrency(utilidadMes)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-400">Ingresos - Egresos</p>
          <p className="text-xs text-zinc-400">Acumulado por día</p>
        </div>
      </div>
      
      <div className="flex-1 w-full h-full min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
            <XAxis 
              dataKey="date" 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#71717a' }}
              dy={10}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#71717a' }}
              tickFormatter={(value) => `$${formatCurrency(value)}`}
              width={80}
            />
            <Tooltip 
              formatter={(value: number) => [`$${formatCurrency(value)}`, 'Balance']}
              labelFormatter={(label) => `Día ${label}`}
              contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Line 
              type="monotone" 
              dataKey="balance" 
              stroke={utilidadMes >= 0 ? '#059669' : '#dc2626'} 
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: utilidadMes >= 0 ? '#059669' : '#dc2626', stroke: '#fff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
