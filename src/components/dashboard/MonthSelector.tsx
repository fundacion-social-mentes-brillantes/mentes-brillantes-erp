'use client'

import { useRouter } from 'next/navigation'
import { Calendar } from 'lucide-react'

export function MonthSelector({ currentMonth }: { currentMonth: string }) {
  const router = useRouter()
  
  return (
    <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-1.5 shadow-sm">
      <Calendar className="w-4 h-4 text-zinc-500" />
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
        className="text-sm font-medium text-zinc-700 bg-transparent border-none focus:ring-0 p-0 cursor-pointer outline-none"
      />
    </div>
  )
}
