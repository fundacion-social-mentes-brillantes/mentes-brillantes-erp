'use client'

import { useState, useRef } from 'react'
import { FileText, Image as ImageIcon, Download } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { createClient } from '@/lib/supabase/client'

type SocioData = {
  id: string
  nombre: string
  porcentaje: number
  corresponde: number
  adelantos: number
  neto: number
}

type ExportProps = {
  empresa: {
    nombre: string
    nit: string
    correo?: string | null
    telefono?: string | null
    ciudad?: string | null
  }
  periodo: {
    nombre: string
    estado: string
    fecha_inicio: string
    fecha_fin: string
  }
  financiero: {
    ingresos_cartera: number
    donaciones: number
    ingresos_totales: number
    egresos: number
    utilidad: number
  }
  sociosData: SocioData[]
}

export function ExportarLiquidacion({ empresa: initialEmpresa, periodo, financiero, sociosData }: ExportProps) {
  const [empresa, setEmpresa] = useState(initialEmpresa)
  const [isExporting, setIsExporting] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount)
  }

  const generateImage = async (type: 'pdf' | 'png') => {
    if (!printRef.current || !supabase) return
    
    try {
      setIsExporting(true)
      
      // Fetch latest config right before generating
      const { data: latestEmpresa, error } = await supabase
        .from('configuracion_empresa')
        .select('*')
        .eq('id', 1)
        .single()
        
      if (!error && latestEmpresa) {
        setEmpresa(latestEmpresa)
        // Wait a tiny bit for React to re-render the hidden div with new data
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      // html2canvas configuration for high quality
      const canvas = await html2canvas(printRef.current, {
        scale: 2, // Higher resolution
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      })

      const imgData = canvas.toDataURL('image/png')
      const fileName = `Liquidacion_${periodo.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`

      if (type === 'png') {
        const link = document.createElement('a')
        link.href = imgData
        link.download = `${fileName}.png`
        link.click()
      } else if (type === 'pdf') {
        // A4 size: 210 x 297 mm
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        })

        const pdfWidth = pdf.internal.pageSize.getWidth()
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
        pdf.save(`${fileName}.pdf`)
      }
    } catch (error) {
      console.error('Error real completo al generar exportación:', error)
      alert(`Error al generar el documento: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => generateImage('pdf')}
          disabled={isExporting}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-md hover:bg-zinc-50 hover:text-zinc-900 transition-colors disabled:opacity-50"
        >
          <FileText className="w-4 h-4 text-red-500" />
          PDF
        </button>
        <button
          onClick={() => generateImage('png')}
          disabled={isExporting}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-md hover:bg-zinc-50 hover:text-zinc-900 transition-colors disabled:opacity-50"
        >
          <ImageIcon className="w-4 h-4 text-blue-500" />
          PNG
        </button>
      </div>

      {/* Hidden Printable Container */}
      <div className="absolute -left-[9999px] top-0">
        <div 
          ref={printRef} 
          className="p-10" 
          style={{ width: '800px', minHeight: '1131px', fontFamily: 'sans-serif', backgroundColor: '#ffffff', color: '#111827' }}
        >
          {/* Header */}
          <div className="pb-6 mb-8 text-center" style={{ borderBottom: '2px solid #374151' }}>
            <h1 className="text-3xl font-bold uppercase tracking-wide mb-2" style={{ color: '#111827' }}>
              {empresa.nombre}
            </h1>
            <p className="font-medium text-lg" style={{ color: '#4b5563' }}>NIT: {empresa.nit}</p>
            {(empresa.correo || empresa.telefono || empresa.ciudad) && (
              <p className="text-sm mt-2" style={{ color: '#6b7280' }}>
                {[empresa.ciudad, empresa.telefono, empresa.correo].filter(Boolean).join(' | ')}
              </p>
            )}
          </div>

          {/* Document Title & Info */}
          <div className="flex justify-between items-end mb-8">
            <div>
              <h2 className="text-2xl font-bold mb-1" style={{ color: '#1f2937' }}>Reporte de Liquidación</h2>
              <p style={{ color: '#6b7280' }}>Período: <span className="font-semibold" style={{ color: '#374151' }}>{periodo.nombre}</span></p>
              <p style={{ color: '#6b7280' }}>Estado: <span className="font-semibold uppercase" style={{ color: '#374151' }}>{periodo.estado}</span></p>
            </div>
            <div className="text-right">
              <p className="text-sm" style={{ color: '#6b7280' }}>Fecha de generación:</p>
              <p className="font-medium" style={{ color: '#1f2937' }}>{new Date().toLocaleDateString('es-CO')}</p>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="grid grid-cols-3 gap-4 mb-10">
            <div className="p-4 rounded-lg" style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
              <p className="text-sm mb-1" style={{ color: '#6b7280' }}>Ingresos Totales</p>
              <p className="text-xl font-bold" style={{ color: '#15803d' }}>{formatCurrency(financiero.ingresos_totales)}</p>
              <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
                Cartera: {formatCurrency(financiero.ingresos_cartera)} · Donaciones: {formatCurrency(financiero.donaciones)}
              </p>
            </div>
            <div className="p-4 rounded-lg" style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
              <p className="text-sm mb-1" style={{ color: '#6b7280' }}>Egresos del Período</p>
              <p className="text-xl font-bold" style={{ color: '#dc2626' }}>{formatCurrency(financiero.egresos)}</p>
            </div>
            <div className="p-4 rounded-lg" style={{ backgroundColor: '#f3f4f6', border: '1px solid #d1d5db' }}>
              <p className="text-sm font-medium mb-1" style={{ color: '#4b5563' }}>Utilidad Neta a Repartir</p>
              <p className="text-2xl font-bold" style={{ color: '#111827' }}>{formatCurrency(financiero.utilidad)}</p>
            </div>
          </div>

          {/* Socios Table */}
          <div className="mb-8">
            <h3 className="text-lg font-bold mb-4 pb-2" style={{ color: '#1f2937', borderBottom: '1px solid #e5e7eb' }}>
              Distribución por Socio
            </h3>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6' }}>
                  <th className="py-3 px-4 font-semibold" style={{ color: '#374151', border: '1px solid #e5e7eb' }}>Socio</th>
                  <th className="py-3 px-4 font-semibold text-center" style={{ color: '#374151', border: '1px solid #e5e7eb' }}>%</th>
                  <th className="py-3 px-4 font-semibold text-right" style={{ color: '#374151', border: '1px solid #e5e7eb' }}>Corresponde</th>
                  <th className="py-3 px-4 font-semibold text-right" style={{ color: '#374151', border: '1px solid #e5e7eb' }}>Adelantos</th>
                  <th className="py-3 px-4 font-bold text-right" style={{ color: '#111827', border: '1px solid #d1d5db', backgroundColor: '#e5e7eb' }}>Neto a Pagar</th>
                </tr>
              </thead>
              <tbody>
                {sociosData.map((socio, index) => (
                  <tr key={socio.id} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                    <td className="py-3 px-4 font-medium" style={{ color: '#1f2937', border: '1px solid #e5e7eb' }}>{socio.nombre}</td>
                    <td className="py-3 px-4 text-center" style={{ color: '#4b5563', border: '1px solid #e5e7eb' }}>{socio.porcentaje}%</td>
                    <td className="py-3 px-4 text-right" style={{ color: '#1f2937', border: '1px solid #e5e7eb' }}>{formatCurrency(socio.corresponde)}</td>
                    <td className="py-3 px-4 text-right" style={{ color: '#dc2626', border: '1px solid #e5e7eb' }}>-{formatCurrency(socio.adelantos)}</td>
                    <td className="py-3 px-4 text-right font-bold" style={{ color: '#111827', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6' }}>
                      {formatCurrency(socio.neto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="mt-16 pt-8 text-center text-sm" style={{ borderTop: '1px solid #e5e7eb', color: '#9ca3af' }}>
            <p>Documento generado automáticamente por el Sistema Administrativo Mentes Brillantes.</p>
            <p>Este documento es de carácter informativo.</p>
          </div>
        </div>
      </div>
    </>
  )
}
