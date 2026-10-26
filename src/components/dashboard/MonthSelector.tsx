'use client'

import { useRouter } from 'next/navigation'
import { Calendar } from 'lucide-react'

export function MonthSelector({ currentMonth }: { currentMonth: string }) {
  const router = useRouter()
  
  return (
    <div className="flex items-center gap-2 bg-panel/78 border border-linea/68 rounded-xl px-3 py-2 shadow-soft">
      <Calendar className="w-4 h-4 text-ambar" />
      <input 
        type="month" 
        value={currentMonth} 
        onChange={(e) => {
          if (e.target.value) {
            router.push(`/?month=${e.target.value}`)
          } else {
            router.push(`/`)
          }
        }} 
        className="text-sm font-semibold text-tinta bg-transparent border-none focus:ring-0 p-0 cursor-pointer outline-none"
      />
    </div>
  )
}
