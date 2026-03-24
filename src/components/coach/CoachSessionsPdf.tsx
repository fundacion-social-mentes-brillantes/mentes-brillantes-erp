'use client'
import { useState } from 'react'
import jsPDF from 'jspdf'

type Sesion = { fecha: string; notas?: string | null }

export function CoachSessionsPdf({
  asistenteNombre,
  sesionesCompradas,
  sesionesRealizadas,
  sesionesRestantes,
  sesiones,
}: {
  asistenteNombre: string
  sesionesCompradas: number
  sesionesRealizadas: number
  sesionesRestantes: number
  sesiones: Sesion[]
}) {
  const [observacion, setObservacion] = useState('')
  const [generating, setGenerating] = useState(false)

  const handleExport = async () => {
    setGenerating(true)
    try {
      const doc = new jsPDF()
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text('Resumen de sesiones guía coach', 16, 20)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      let y = 28
      doc.text('Asistente: ' + asistenteNombre, 16, y)
      y += 6
      doc.text('Profesional: Psicóloga Alexandra Ortega', 16, y)
      y += 10
      doc.setFont('helvetica', 'bold')
      doc.text('Paquete actual', 16, y)
      doc.setFont('helvetica', 'normal')
      y += 7
      doc.text('Sesiones compradas: ' + sesionesCompradas, 16, y); y += 6
      doc.text('Sesiones realizadas: ' + sesionesRealizadas, 16, y); y += 6
      doc.text('Sesiones restantes: ' + sesionesRestantes, 16, y); y += 10
      doc.setFont('helvetica', 'bold')
      doc.text('Sesiones registradas', 16, y)
      doc.setFont('helvetica', 'normal')
      y += 7
      if (sesiones.length === 0) {
        doc.text('No hay sesiones registradas en este módulo.', 16, y); y += 10
      } else {
        sesiones.slice(0, 15).forEach((s) => {
          const line = '• ' + s.fecha + (s.notas ? ' — ' + s.notas : '')
          doc.text(line, 16, y)
          y += 6
        })
        if (sesiones.length > 15) {
          doc.text('... (' + (sesiones.length - 15) + ' más)', 16, y); y += 6
        }
        y += 6
      }
      doc.setFont('helvetica', 'bold')
      doc.text('Observaciones de la sesión / notas clínicas', 16, y)
      doc.setFont('helvetica', 'normal')
      y += 8
      const obs = observacion?.trim() || '______________________________'
      doc.text(doc.splitTextToSize(obs, 180), 16, y)
      const today = new Date().toLocaleDateString('es-CO')
      doc.setFontSize(10)
      doc.text('Fecha de expedición: ' + today, 16, 285)
      doc.save('sesiones-coach-' + (asistenteNombre || 'asistente') + '.pdf')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-[rgb(var(--text-muted))]">Observación (opcional)</label>
      <textarea
        className="w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 py-2 text-sm"
        rows={3}
        value={observacion}
        onChange={(e) => setObservacion(e.target.value)}
        placeholder="Anota lo trabajado para que salga en el PDF"
      />
      <button
        type="button"
        onClick={handleExport}
        disabled={generating}
        className="inline-flex items-center justify-center rounded-md bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] px-4 py-2 text-sm font-medium hover:bg-[rgb(var(--accent-strong))] disabled:opacity-60"
      >
        {generating ? 'Generando PDF...' : 'Exportar PDF'}
      </button>
    </div>
  )
}
