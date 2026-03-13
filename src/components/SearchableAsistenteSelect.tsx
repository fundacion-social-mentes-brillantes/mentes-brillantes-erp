'use client'

import { useState, useRef, useEffect } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'

export function SearchableAsistenteSelect({ 
  asistentes, 
  name = "asistente_id",
  disabled = false
}: { 
  asistentes: any[],
  name?: string,
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string>('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredAsistentes = asistentes.filter(a => {
    const searchLower = search.toLowerCase()
    const nombreMatch = a.nombre?.toLowerCase().includes(searchLower)
    const codigoMatch = a.codigo?.toLowerCase().includes(searchLower)
    return nombreMatch || codigoMatch
  })

  const selectedAsistente = asistentes.find(a => a.id === selectedId)

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Input oculto para el formulario */}
      <input type="hidden" name={name} value={selectedId} />

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate text-zinc-700">
          {selectedAsistente 
            ? `${selectedAsistente.nombre} ${selectedAsistente.codigo ? `(${selectedAsistente.codigo})` : ''}`
            : "Seleccione un asistente..."}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-zinc-200 bg-white p-1 text-base shadow-md sm:text-sm">
          <div className="sticky top-0 z-10 flex items-center border-b border-zinc-100 bg-white px-3 pb-2 pt-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              type="text"
              placeholder="Buscar por nombre o código..."
              className="flex-1 bg-transparent outline-none placeholder:text-zinc-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          
          <div className="pt-1">
            {filteredAsistentes.length === 0 ? (
              <div className="py-6 text-center text-sm text-zinc-500">
                No se encontraron asistentes.
              </div>
            ) : (
              filteredAsistentes.map((a) => (
                <div
                  key={a.id}
                  onClick={() => {
                    setSelectedId(a.id)
                    setOpen(false)
                    setSearch('')
                  }}
                  className={`relative flex w-full cursor-default select-none items-center rounded-sm py-2 pl-8 pr-2 text-sm outline-none hover:bg-zinc-100 hover:text-zinc-900 ${
                    selectedId === a.id ? 'bg-zinc-50 font-medium text-zinc-900' : 'text-zinc-700'
                  }`}
                >
                  {selectedId === a.id && (
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                  <div className="flex flex-col">
                    <span>{a.nombre}</span>
                    {a.codigo && <span className="text-xs text-zinc-500">Cód: {a.codigo}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
