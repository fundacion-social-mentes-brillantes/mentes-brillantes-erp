'use client'

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export function PdfReportButton({ displayMonthName }: { displayMonthName: string }) {
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGeneratePdf = async () => {
    try {
      setIsGenerating(true)
      
      const dashboardElement = document.getElementById('dashboard-content')
      if (!dashboardElement) {
        throw new Error('No se encontró el contenido del dashboard')
      }

      // Añadir temporalmente clase para forzar estilos de impresión si es necesario
      dashboardElement.classList.add('pdf-export-mode')

      const canvas = await html2canvas(dashboardElement, {
        scale: 2, // Mejor resolución
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      })

      dashboardElement.classList.remove('pdf-export-mode')

      const imgData = canvas.toDataURL('image/jpeg', 1.0)
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width

      // Cabecera del Documento
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
      console.error('Error generando PDF:', error)
      alert('Hubo un error al generar el reporte PDF. Por favor intenta nuevamente.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <button
      onClick={handleGeneratePdf}
      disabled={isGenerating}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:pointer-events-none disabled:opacity-50
        bg-emerald-600 text-white shadow-md hover:bg-emerald-700 hover:shadow-lg h-10 px-4 py-2 ${isGenerating ? 'animate-pulse' : ''}`}
    >
      {isGenerating ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FileDown className="w-4 h-4" />
      )}
      <span>{isGenerating ? 'Generando...' : 'Reporte Gerencial (PDF)'}</span>
    </button>
  )
}
