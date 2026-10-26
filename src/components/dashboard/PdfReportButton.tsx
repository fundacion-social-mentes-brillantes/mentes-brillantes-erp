'use client'

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { useApariencia } from '@/components/theme/ThemeProvider'
import { variables } from '@/lib/tema/apariencia'

// html2canvas y jsPDF NO se importan arriba a proposito: entre las dos pesan
// ~174 KB comprimidos y solo hacen falta cuando alguien oprime el boton. Al
// estar arriba, viajaban al celular en cada carga del tablero aunque nadie
// generara un PDF. Se cargan dentro del handler, con el boton ya en "Generando".

async function loadLogoDataUrl() {
  const response = await fetch('/logo-mentes-brillantes.png')
  const blob = await response.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function PdfReportButton({ displayMonthName }: { displayMonthName: string }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const { apariencia } = useApariencia()

  const handleGeneratePdf = async () => {
    let clone: HTMLElement | null = null;
    
    try {
      setIsGenerating(true)

      // Se bajan aqui, con el boton ya mostrando "Generando...".
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      // Las partes del Inicio que van en el reporte: el período, la gráfica y la cartera.
      const partes = Array.from(document.querySelectorAll<HTMLElement>('[data-reporte-pdf]'))
      if (!partes.length) {
        throw new Error('No se encontró el contenido del dashboard')
      }

      // 1. Copiarlas una debajo de otra en una hoja aparte, siempre en modo claro
      //    (con el color escogido) y con fondo blanco para imprimir.
      clone = document.createElement('div')
      clone.setAttribute('data-modo', 'claro')
      clone.style.display = 'flex'
      clone.style.flexDirection = 'column'
      clone.style.gap = '16px'
      clone.style.padding = '8px'
      partes.forEach((parte) => clone!.appendChild(parte.cloneNode(true)))
      const lightVars: Record<string, string> = { ...variables(apariencia.acento, 'claro'), '--bg': '255, 255, 255' }
      Object.entries(lightVars).forEach(([key, value]) => clone!.style.setProperty(key, value))
      clone.style.backgroundColor = '#ffffff'
      clone.style.color = `rgb(${lightVars['--text-primary']})`
      
      // 2. Preparar el clon: oculto del viewport pero ocupando espacio renderizable
      clone.style.position = 'absolute'
      clone.style.top = '0'
      clone.style.left = '-9999px' // Oculto fuera de pantalla
      clone.style.width = `${Math.max(900, ...partes.map((p) => p.offsetWidth))}px` // Mantener ancho
      
      // 3. Remover clases problemáticas y forzar colores estándar
      const elementsWithBlur = clone.querySelectorAll('., ., .')
      elementsWithBlur.forEach(el => {
        el.classList.remove('', '', '')
      })

      // 4. Adjuntar al body para que el navegador lo pueda re-pintar y leer estilos computados
      document.body.appendChild(clone)
      
      // 5. Normalizar TODO color moderno (oklch, lab, color()) a formatos seguros para html2canvas
      // Es vital hacerlo después de adjuntar al DOM para que getComputedStyle funcione
      const allElements = clone.querySelectorAll('*')
      
      const safeFallbackColors: Record<string, string> = {
        color: '#18181b', // zinc-900 por defecto para texto
        backgroundColor: 'transparent',
        borderColor: '#e4e4e7', // zinc-200 por defecto para bordes
        fill: 'none',
        stroke: '#71717a' // zinc-500 por defecto para svg e iconos
      }

      const colorProperties = ['color', 'backgroundColor', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'fill', 'stroke'] as const

      Array.from(allElements).forEach((el) => {
        const computedStyle = window.getComputedStyle(el)
        
        colorProperties.forEach(prop => {
          const value = computedStyle[prop]
          // Si el valor computado usa funciones modernas que html2canvas no soporta
          if (value && (value.includes('oklch') || value.includes('lab') || value.includes('color(') || value.includes('oklab'))) {
            // Sobrescribir inline style con un fallback seguro RGB/HEX
            (el as HTMLElement).style[prop] = safeFallbackColors[prop] || '#000000'
          }
        })
      })

      // Limpieza manual adicional para fondos transparentes problemáticos
      elementsWithBlur.forEach(el => {
        if (el.classList.contains('bg-[#ffffff]/60') || el.classList.contains('bg-[#ffffff]/90')) {
          el.classList.remove('bg-[#ffffff]/60', 'bg-[#ffffff]/90')
          ;(el as HTMLElement).style.backgroundColor = '#ffffff'
        }
        if (el.classList.contains('bg-[#18181b]/90')) {
          el.classList.remove('bg-[#18181b]/90')
          ;(el as HTMLElement).style.backgroundColor = '#18181b'
        }
      })

      // 6. Capturar el clon limpio
      const canvas = await html2canvas(clone, {
        scale: 2, 
        useCORS: true,
        logging: true, // Habilitado para debug
        backgroundColor: '#ffffff'
      })

      const imgData = canvas.toDataURL('image/jpeg', 1.0)
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width

      // Cabecera del Documento
      try {
        const logo = await loadLogoDataUrl()
        pdf.addImage(logo, 'PNG', pdfWidth - 48, 9, 34, 20, undefined, 'FAST')
      } catch {
        // El logo es decorativo en el PDF; si falla, el reporte sigue generando.
      }
      pdf.setFontSize(22)
      pdf.setTextColor(24, 24, 27) // zinc-900
      pdf.text('Mentes Brillantes - Reporte Gerencial', 10, 20)
      
      pdf.setFontSize(12)
      pdf.setTextColor(113, 113, 122) // zinc-500
      pdf.text(`Período: ${displayMonthName}`, 10, 28)
      pdf.text(`Generado el: ${new Date().toLocaleDateString('es-CO')} ${new Date().toLocaleTimeString('es-CO')}`, 10, 34)

      // Divider
      pdf.setDrawColor(228, 228, 231) // zinc-200
      pdf.line(10, 40, pdfWidth - 10, 40)

      pdf.addImage(imgData, 'JPEG', 5, 45, pdfWidth - 10, pdfHeight - 10)

      pdf.save(`Reporte_Gerencial_${displayMonthName.replace(' ', '_')}.pdf`)
    } catch (error) {
      console.error('Error Fatal generando PDF:', error)
      alert('Hubo un error al generar el reporte PDF. Revisa la consola (F12) para más detalles.')
    } finally {
      setIsGenerating(false)
      // Limpieza: Asegurarnos de remover siempre el nodo clonado
      if (clone && document.body.contains(clone)) {
        document.body.removeChild(clone)
      }
    }
  }

  return (
    <button
      onClick={handleGeneratePdf}
      disabled={isGenerating}
      className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-linea bg-panel px-4 text-sm font-semibold text-tinta transition-colors hover:border-linea-fuerte hover:bg-suave disabled:pointer-events-none disabled:opacity-60"
    >
      {isGenerating ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FileDown className="w-4 h-4" />
      )}
      <span>{isGenerating ? 'Generando…' : 'Reporte Gerencial (PDF)'}</span>
    </button>
  )
}

