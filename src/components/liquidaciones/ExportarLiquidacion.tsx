'use client'

import { useState, useRef } from 'react'
import { FileText, Image as ImageIcon } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { createClient } from '@/lib/supabase/client'
import { fechaHoyBogota } from '@/lib/utils/fechas'
import {
  ALTO_HOJA,
  DocumentoLiquidacion,
  type DocumentoLiquidacionProps,
  type SocioDocumento,
} from './DocumentoLiquidacion'

export type { SocioDocumento }

type ExportProps = Omit<DocumentoLiquidacionProps, 'generadoEl' | 'empresa'> & {
  empresa: {
    nombre: string
    nit: string
    correo?: string | null
    telefono?: string | null
    ciudad?: string | null
  }
}

export function ExportarLiquidacion({ empresa: initialEmpresa, periodo, financiero, talleres, socios }: ExportProps) {
  const [empresa, setEmpresa] = useState(initialEmpresa)
  const [isExporting, setIsExporting] = useState(false)
  const [generadoEl, setGeneradoEl] = useState(() => fechaHoyBogota())
  // El PDF va del alto de una hoja; la imagen termina donde termina el contenido (menos blanco en el celular).
  const [hoja, setHoja] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const generateImage = async (type: 'pdf' | 'png') => {
    if (!printRef.current || !supabase) return

    try {
      setIsExporting(true)
      setGeneradoEl(fechaHoyBogota())
      setHoja(type === 'pdf')

      // El nombre y el NIT mas recientes, por si los cambiaron despues de abrir la pagina.
      const { data: latestEmpresa, error } = await supabase
        .from('configuracion_empresa')
        .select('*')
        .eq('id', 1)
        .single()

      if (!error && latestEmpresa) setEmpresa(latestEmpresa)
      // Un momento para que React vuelva a dibujar el documento escondido, y que la letra y el logo esten listos.
      await new Promise((resolve) => setTimeout(resolve, 100))
      await document.fonts?.ready
      const logo = printRef.current.querySelector('img')
      if (logo && !logo.complete) await new Promise((resolve) => logo.addEventListener('load', resolve, { once: true }))

      const canvas = await html2canvas(printRef.current, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      })

      const imgData = canvas.toDataURL('image/png')
      const fileName = `Liquidacion_${periodo.nombre.replace(/\s+/g, '_')}_${fechaHoyBogota()}`

      if (type === 'png') {
        const link = document.createElement('a')
        link.href = imgData
        link.download = `${fileName}.png`
        link.click()
      } else if (type === 'pdf') {
        // Siempre UNA sola pagina, del ancho de una A4. Normalmente es A4 exacta; si el periodo tiene
        // muchos adelantos, la pagina se alarga en vez de partirse en dos o de achicar la letra.
        const ancho = 210
        const alto = Math.max(297, (canvas.height * ancho) / canvas.width)
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [ancho, alto] })
        pdf.addImage(imgData, 'PNG', 0, 0, ancho, (canvas.height * ancho) / canvas.width, undefined, 'FAST')
        pdf.setProperties({ title: `Liquidación de socios · ${periodo.nombre}` })
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
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-tinta bg-panel/78 border border-linea/68 rounded-xl hover:bg-suave/82 transition-colors disabled:opacity-50 shadow-soft"
        >
          <FileText className="w-4 h-4 text-rojo" />
          PDF
        </button>
        <button
          onClick={() => generateImage('png')}
          disabled={isExporting}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-tinta bg-panel/78 border border-linea/68 rounded-xl hover:bg-suave/82 transition-colors disabled:opacity-50 shadow-soft"
        >
          <ImageIcon className="w-4 h-4 text-info" />
          PNG
        </button>
      </div>

      {/* Lo que se convierte en PDF e imagen. Fuera de pantalla: nunca se ve en la app. */}
      <div className="absolute -left-[9999px] top-0" aria-hidden>
        <div ref={printRef} data-documento>
          <DocumentoLiquidacion
            empresa={{ nombre: empresa.nombre, nit: empresa.nit }}
            periodo={periodo}
            financiero={financiero}
            talleres={talleres}
            socios={socios}
            generadoEl={generadoEl}
            altoMinimo={hoja ? ALTO_HOJA : undefined}
          />
        </div>
      </div>
    </>
  )
}
