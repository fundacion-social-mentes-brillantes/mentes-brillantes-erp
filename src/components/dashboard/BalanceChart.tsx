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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#ffffff]/90 backdrop-blur-md border border-[#e4e4e7] p-4 rounded-xl shadow-xl flex flex-col gap-2 min-w-[200px]">
          <p className="text-[#71717a] font-medium text-xs mb-1 uppercase tracking-wider">Día {label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
                <span className="text-sm text-[#3f3f46] capitalize">{entry.name}</span>
              </div>
              <span className={`font-semibold ${entry.name === 'Utilidad Acumulada' ? 'text-[#4f46e5]' : entry.name === 'Ingresos' ? 'text-[#059669]' : 'text-[#f43f5e]'}`}>
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
          <p className="text-sm font-medium text-[#71717a] mb-1">Utilidad Bruta ({displayMonthName})</p>
          <div className="flex items-end gap-3">
            <p className={`text-4xl font-extrabold tracking-tight ${utilidadMes >= 0 ? 'text-[#059669]' : 'text-[#ef4444]'}`}>
              ${formatCurrency(utilidadMes)}
            </p>
          </div>
        </div>
      </div>
      
      <div className="flex-1 w-full h-full min-h-[250px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
            <XAxis 
              dataKey="date" 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#a1a1aa' }}
              dy={10}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#a1a1aa' }}
              tickFormatter={(value) => `$${(value / 1000)}k`}
              width={65}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f4f4f5', opacity: 0.4 }} />
            
            <Legend 
              verticalAlign="top" 
              height={36} 
              iconType="circle"
              wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }}
            />
            
            <Bar 
              dataKey="ingresos" 
              name="Ingresos" 
              fill="#10b981" 
              radius={[4, 4, 0, 0]}
              barSize={20}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-in-${index}`} fill="#10b981" fillOpacity={0.8} />
              ))}
            </Bar>
            
            <Bar 
              dataKey="egresos" 
              name="Egresos" 
              fill="#fb7185" 
              radius={[4, 4, 0, 0]}
              barSize={20}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-out-${index}`} fill="#fb7185" fillOpacity={0.8} />
              ))}
            </Bar>
            
            <Line 
              type="monotone" 
              dataKey="balance" 
              name="Utilidad Acumulada"
              stroke="#6366f1" 
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
