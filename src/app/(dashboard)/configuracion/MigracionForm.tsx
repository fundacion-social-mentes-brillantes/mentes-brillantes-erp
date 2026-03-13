'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle2, Upload, FileText, Info } from 'lucide-react'
import { procesarMigracion } from './actions'
import Papa from 'papaparse'

export function MigracionForm() {
  const [isPending, setIsPending] = useState(false)
  const [result, setResult] = useState<{ success?: boolean, message?: string, errors?: string[], stats?: any } | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsPending(true)
    setResult(null)

    const formData = new FormData(e.currentTarget)
    const tipo = formData.get('tipo') as string
    const file = formData.get('file') as File

    if (!tipo || !file) {
      setResult({ success: false, message: 'Faltan datos' })
      setIsPending(false)
      return
    }

    try {
      const text = await file.text()
      const cleanText = text.replace(/^\uFEFF/, '')

      Papa.parse(cleanText, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (header) => header.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        complete: async (results) => {
          const rows = results.data.filter((row: any) => row && Object.keys(row).length >= 3)
          
          if (rows.length === 0) {
            setResult({ success: false, message: 'No se encontraron datos válidos en el CSV', errors: results.errors.map(e => e.message) })
            setIsPending(false)
            return
          }

          try {
            const res = await procesarMigracion(tipo, rows)
            setResult(res)
          } catch (error: any) {
            setResult({ success: false, message: error.message || 'Error desconocido' })
          } finally {
            setIsPending(false)
          }
        },
        error: (error: any) => {
          setResult({ success: false, message: 'Error al leer el CSV', errors: [error.message] })
          setIsPending(false)
        }
      })
    } catch (error: any) {
      setResult({ success: false, message: error.message || 'Error al procesar el archivo' })
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Tipo de Datos a Migrar</label>
          <select 
            name="tipo" 
            required 
            disabled={isPending}
            className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Seleccione...</option>
            <option value="asistentes">1. Asistentes</option>
            <option value="socios">2. Socios</option>
            <option value="periodos">3. Períodos</option>
            <option value="adelantos">4. Adelantos a Socios</option>
            <option value="movimientos">5. Movimientos (Cuentas, Abonos, Egresos)</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Archivo CSV</label>
          <input 
            type="file" 
            name="file" 
            accept=".csv"
            required 
            disabled={isPending}
            className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3 text-blue-800 text-sm">
        <Info className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold mb-1">Instrucciones de Mapeo (Columnas exactas de AppSheet):</p>
          <ul className="list-disc pl-4 space-y-1 text-blue-700">
            <li><strong>Asistentes:</strong> Row ID, Asistente Id, Codigo, Nombre, Cedula, Correo, Activo, Telefono</li>
            <li><strong>Socios:</strong> Row ID, Socio Id, Nombre, Porcentaje, Activo</li>
            <li><strong>Períodos:</strong> Fecha Inicio, Fecha Fin</li>
            <li><strong>Adelantos:</strong> Row ID, Socio, Date, Monto, Notas</li>
            <li><strong>Movimientos:</strong> Row ID, Mov Id, Fecha, Tipo, Metodo Pago, Concepto, Valor Compra, Valor Abonado, Monto, Nota, Asistente Ref</li>
          </ul>
        </div>
      </div>

      {result?.message && !result.success && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-600">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">{result.message}</p>
            {result.errors && result.errors.length > 0 && (
              <ul className="mt-2 text-xs list-disc pl-4 space-y-1">
                {result.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {result?.success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3 text-emerald-700">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">{result.message}</p>
            
            {result.stats && (
              <div className="mt-2 text-xs space-y-1">
                <p>Total procesados: {result.stats.total}</p>
                <p>Insertados: {result.stats.inserted}</p>
                <p>Ignorados (Duplicados): {result.stats.ignored}</p>
                <p>Errores: {result.stats.errors}</p>
              </div>
            )}

            {result.errors && result.errors.length > 0 && (
              <ul className="mt-2 text-xs list-disc pl-4 space-y-1 text-red-600">
                {result.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending} className="bg-zinc-900 text-white hover:bg-zinc-800">
          <Upload className="w-4 h-4 mr-2" />
          {isPending ? 'Procesando...' : 'Iniciar Migración'}
        </Button>
      </div>
    </form>
  )
}
