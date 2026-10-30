'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Flashlight, FlashlightOff, RotateCcw, ScanLine, TriangleAlert, X } from 'lucide-react'
import { codigoDeBoleta } from '@/lib/operaciones/talleres-reglas'
import { formatearHora } from '@/lib/utils/fechas'
import { pesos } from '@/lib/utils/pesos'
import { marcarAsistenciaAction, registrarLlegadaQrAction } from '../actions'

// El lector de QR de la puerta: abre la camara de atras del celular y lee las
// boletas una tras otra. Cada QR marca la llegada al instante y muestra el
// nombre, con un pitido y (en Android) una vibracion. Lee con el BarcodeDetector
// del navegador donde lo hay (Chrome de Android); el iPhone no lo tiene, y ahi
// lee jsQR, que se carga solo al abrir el lector.

type Resultado =
  | {
      tipo: 'llego' | 'ya'
      nombre: string
      numero: number | null
      pendiente: number
      hora: string | null
      inscripcionId: string
      /** Lo que traia el QR, para no volver a leerlo enseguida si se deshace. */
      leido: string
    }
  | { tipo: 'error' | 'aviso'; texto: string }

type Tono = 'llego' | 'ya' | 'error'

// El mismo QR no se vuelve a leer en este rato (la persona sigue con el celular frente a la camara).
const ESPERA_MISMO_QR_MS = 10_000
// Descanso entre un intento de lectura y el siguiente.
const CADA_MS = 140

// ------------------------------------------------------------ sonido y vibracion

let audio: AudioContext | null = null

/** Se llama en un toque: el iPhone solo deja sonar el audio que se preparo en un toque. */
export function prepararSonido() {
  try {
    const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Contexto) return
    audio ??= new Contexto()
    void audio.resume()
  } catch {
    // Sin sonido: igual se ve en la pantalla.
  }
}

const AVISOS: Record<Tono, { tonos: Array<[hz: number, ms: number]>; vibra: number[] }> = {
  llego: { tonos: [[880, 110], [1320, 150]], vibra: [70] },
  ya: { tonos: [[620, 110], [620, 110]], vibra: [60, 60, 60] },
  error: { tonos: [[220, 320]], vibra: [220, 90, 220] },
}

function avisar(tipo: Tono) {
  const { tonos, vibra } = AVISOS[tipo]
  try {
    navigator.vibrate?.(vibra)
  } catch {}
  if (!audio || audio.state !== 'running') return
  let t = audio.currentTime
  for (const [hz, ms] of tonos) {
    const oscilador = audio.createOscillator()
    const volumen = audio.createGain()
    oscilador.frequency.value = hz
    volumen.gain.setValueAtTime(0.0001, t)
    volumen.gain.exponentialRampToValueAtTime(0.3, t + 0.012)
    volumen.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
    oscilador.connect(volumen).connect(audio.destination)
    oscilador.start(t)
    oscilador.stop(t + ms / 1000 + 0.02)
    t += ms / 1000 + 0.05
  }
}

// ------------------------------------------------------------ lectura del QR

type Detector = { detect(fuente: CanvasImageSource): Promise<Array<{ rawValue: string }>> }
type DetectorNativo = { new (opciones: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> }
type Lector = (video: HTMLVideoElement, lienzo: HTMLCanvasElement) => Promise<string | null>

async function crearLector(): Promise<Lector> {
  const Nativo = (window as unknown as { BarcodeDetector?: DetectorNativo }).BarcodeDetector
  if (Nativo) {
    try {
      const formatos = (await Nativo.getSupportedFormats?.()) ?? []
      if (formatos.includes('qr_code')) {
        const detector = new Nativo({ formats: ['qr_code'] })
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null
      }
    } catch {
      // Se lee con jsQR.
    }
  }
  const { default: jsQR } = await import('jsqr')
  return async (video, lienzo) => {
    const ancho = video.videoWidth
    const alto = video.videoHeight
    if (!ancho || !alto) return null
    // Un cuadro mas pequeno basta para un QR a un palmo de la camara, y se lee mas rapido.
    const escala = Math.min(1, 640 / Math.max(ancho, alto))
    lienzo.width = Math.round(ancho * escala)
    lienzo.height = Math.round(alto * escala)
    const ctx = lienzo.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height)
    const { data, width, height } = ctx.getImageData(0, 0, lienzo.width, lienzo.height)
    // attemptBoth: tambien lee un QR claro sobre fondo oscuro (una boleta en modo oscuro).
    return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null
  }
}

function mensajeCamara(error: unknown): string {
  const nombre = (error as { name?: string } | null)?.name
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
    return 'No hay permiso para usar la cámara. Permítela en el candado de la barra de direcciones (en el iPhone: Ajustes › Safari › Cámara) y vuelve a abrir el lector.'
  }
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return 'Este aparato no tiene una cámara que se pueda usar.'
  if (nombre === 'NotReadableError') return 'La cámara la está usando otra aplicación. Ciérrala y vuelve a abrir el lector.'
  return 'No se pudo abrir la cámara. Vuelve a intentarlo.'
}

// ------------------------------------------------------------ el lector

export function EscanerQr({
  tallerId,
  llegaron,
  total,
  alCerrar,
}: {
  tallerId: string
  llegaron: number
  total: number
  alCerrar: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const pista = useRef<MediaStreamTrack | null>(null)
  const ocupado = useRef(false)
  const leidos = useRef(new Map<string, number>())
  const [estado, setEstado] = useState<'abriendo' | 'leyendo' | 'sin-camara'>('abriendo')
  const [problema, setProblema] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [conteo, setConteo] = useState({ llegaron, total })
  // null: este celular no deja prender la linterna desde la pagina.
  const [linterna, setLinterna] = useState<boolean | null>(null)
  const [deshaciendo, setDeshaciendo] = useState(false)

  const procesar = useCallback(
    async (texto: string) => {
      const ahora = Date.now()
      const antes = leidos.current.get(texto)
      if (antes && ahora - antes < ESPERA_MISMO_QR_MS) return
      leidos.current.set(texto, ahora)

      if (!codigoDeBoleta(texto)) {
        avisar('error')
        setResultado({ tipo: 'error', texto: 'Ese QR no es una entrada de un taller.' })
        return
      }
      ocupado.current = true
      try {
        const r = await registrarLlegadaQrAction(tallerId, texto)
        if (!r.llegada) {
          avisar('error')
          setResultado({ tipo: 'error', texto: r.error ?? 'No se pudo registrar la llegada.' })
          return
        }
        const l = r.llegada
        avisar(l.yaHabiaLlegado ? 'ya' : 'llego')
        setConteo({ llegaron: l.llegaron, total: l.total })
        setResultado({
          tipo: l.yaHabiaLlegado ? 'ya' : 'llego',
          nombre: l.nombre,
          numero: l.numero,
          pendiente: l.pendiente,
          hora: l.horaLlegada,
          inscripcionId: l.inscripcionId,
          leido: texto,
        })
      } catch {
        // Sin conexion: que el mismo QR se pueda volver a leer enseguida.
        leidos.current.delete(texto)
        avisar('error')
        setResultado({ tipo: 'error', texto: 'Sin conexión: no se registró. Vuelve a mostrar el QR.' })
      } finally {
        ocupado.current = false
      }
    },
    [tallerId]
  )

  useEffect(() => {
    let vivo = true
    let reloj = 0
    let flujo: MediaStream | null = null

    const abrir = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setEstado('sin-camara')
        setProblema('Este navegador no deja usar la cámara aquí. Abre el ERP en Chrome o en Safari.')
        return
      }
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
      } catch (e) {
        if (!vivo) return
        setEstado('sin-camara')
        setProblema(mensajeCamara(e))
        return
      }
      const v = video.current
      if (!vivo || !v) {
        flujo.getTracks().forEach((t) => t.stop())
        return
      }
      v.srcObject = flujo
      await v.play().catch(() => {})
      const [primera] = flujo.getVideoTracks()
      pista.current = primera ?? null
      const capacidades = (primera?.getCapabilities?.() ?? {}) as { torch?: boolean }
      if (capacidades.torch) setLinterna(false)

      const leer = await crearLector()
      if (!vivo) return
      setEstado('leyendo')
      const vuelta = async () => {
        if (!vivo) return
        if (!ocupado.current && v.readyState >= 2 && lienzo.current) {
          try {
            const texto = await leer(v, lienzo.current)
            if (texto && vivo) await procesar(texto)
          } catch {
            // Un cuadro que no se pudo leer: sigue con el siguiente.
          }
        }
        if (vivo) reloj = window.setTimeout(vuelta, CADA_MS)
      }
      void vuelta()
    }
    void abrir()

    return () => {
      vivo = false
      window.clearTimeout(reloj)
      flujo?.getTracks().forEach((t) => t.stop())
    }
  }, [procesar])

  // Con la tecla Escape (en un computador) tambien se cierra.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [alCerrar])

  const alternarLinterna = async () => {
    const track = pista.current
    if (!track || linterna === null) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !linterna } as MediaTrackConstraintSet] })
      setLinterna(!linterna)
    } catch {
      setLinterna(null)
    }
  }

  const deshacer = async () => {
    if (resultado?.tipo !== 'llego') return
    const { inscripcionId, nombre, leido } = resultado
    setDeshaciendo(true)
    try {
      const r = await marcarAsistenciaAction(tallerId, inscripcionId, false)
      if (r?.error) {
        setResultado({ tipo: 'error', texto: r.error })
        return
      }
      setConteo((c) => ({ ...c, llegaron: Math.max(0, c.llegaron - 1) }))
      setResultado({ tipo: 'aviso', texto: `Se quitó la llegada de ${nombre}.` })
      // Su celular puede seguir frente a la camara: que no la vuelva a marcar enseguida.
      leidos.current.set(leido, Date.now())
    } catch {
      setResultado({ tipo: 'error', texto: 'Sin conexión: no se pudo deshacer.' })
    } finally {
      setDeshaciendo(false)
    }
  }

  const borde =
    resultado?.tipo === 'llego' ? 'border-verde' : resultado?.tipo === 'ya' ? 'border-ambar' : resultado?.tipo === 'error' ? 'border-rojo' : 'border-white/80'

  // z-[70]: por encima de todo, incluido el aviso de «Instalar Mentes Brillantes» (z-[60]).

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Lector de QR de las entradas"
      className="fixed inset-0 z-[70] flex flex-col bg-black text-white"
      onPointerDown={prepararSonido}
    >
      <video ref={video} muted playsInline autoPlay aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      <canvas ref={lienzo} aria-hidden className="hidden" />

      {/* el visor: lo de afuera se oscurece y el borde cambia de color con cada lectura */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
        <div
          className={`aspect-square w-[min(72vw,320px)] rounded-[28px] border-[3px] shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)] transition-colors duration-200 ${borde}`}
        />
      </div>

      <div className="relative flex items-center justify-between gap-3 px-4 pt-[max(14px,env(safe-area-inset-top))]">
        <p className="rounded-full bg-black/60 px-4 py-2 text-sm">
          Llegaron <span className="cifra text-lg font-bold">{conteo.llegaron}</span> de {conteo.total}
        </p>
        <div className="flex items-center gap-2">
          {linterna !== null && (
            <button
              type="button"
              onClick={alternarLinterna}
              aria-pressed={linterna}
              aria-label={linterna ? 'Apagar la linterna' : 'Prender la linterna'}
              className="grid h-11 w-11 place-items-center rounded-full bg-black/60"
            >
              {linterna ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
            </button>
          )}
          <button
            type="button"
            onClick={alCerrar}
            className="flex h-11 items-center gap-1.5 rounded-full bg-black/60 px-4 text-sm font-semibold"
          >
            <X className="h-5 w-5" aria-hidden />
            Cerrar
          </button>
        </div>
      </div>

      <div className="relative mt-auto px-4 pb-[max(18px,env(safe-area-inset-bottom))]">
        <div role="status" aria-live="polite" className="mx-auto max-w-md">
          {estado === 'sin-camara' ? (
            <div className="rounded-2xl bg-panel p-5 text-tinta">
              <p className="flex items-start gap-2 font-semibold">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rojo" aria-hidden />
                {problema}
              </p>
              <p className="mt-2 text-sm text-gris">Mientras tanto, busca a cada persona por su nombre en la lista.</p>
            </div>
          ) : resultado ? (
            <TarjetaResultado resultado={resultado} deshaciendo={deshaciendo} alDeshacer={deshacer} />
          ) : (
            <p className="flex items-center justify-center gap-2 rounded-2xl bg-black/60 px-4 py-3 text-center text-base">
              <ScanLine className="h-5 w-5" aria-hidden />
              {estado === 'abriendo' ? 'Abriendo la cámara…' : 'Apunta al QR de la boleta'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function TarjetaResultado({
  resultado,
  deshaciendo,
  alDeshacer,
}: {
  resultado: Resultado
  deshaciendo: boolean
  alDeshacer: () => void
}) {
  if ('texto' in resultado) {
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-panel p-4 text-tinta">
        <CircleAlert className={`mt-0.5 h-6 w-6 shrink-0 ${resultado.tipo === 'error' ? 'text-rojo' : 'text-gris'}`} aria-hidden />
        <p className="font-semibold">{resultado.texto}</p>
      </div>
    )
  }
  const llego = resultado.tipo === 'llego'
  return (
    <div className="rounded-2xl bg-panel p-4 text-tinta">
      <div className="flex items-start gap-3">
        {llego ? (
          <CircleCheck className="h-8 w-8 shrink-0 text-verde" aria-hidden />
        ) : (
          <TriangleAlert className="h-8 w-8 shrink-0 text-ambar" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${llego ? 'text-verde' : 'text-ambar'}`}>
            {llego ? 'Llegó' : `Esta entrada ya se usó${resultado.hora ? ` a las ${formatearHora(resultado.hora)}` : ''}`}
          </p>
          <p className="text-xl font-bold leading-tight">{resultado.nombre}</p>
          <p className="mt-0.5 text-sm text-gris">
            {resultado.numero ? `Entrada N.º ${resultado.numero}` : 'Entrada'}
            {llego && resultado.hora ? ` · ${formatearHora(resultado.hora)}` : ''}
          </p>
        </div>
      </div>
      {resultado.pendiente > 0 && (
        <p className="mt-3 rounded-xl bg-ambar/12 px-3 py-2 text-sm font-semibold text-ambar">
          Debe {pesos(resultado.pendiente)}: cóbrale en la lista al cerrar el lector.
        </p>
      )}
      {llego && (
        <button
          type="button"
          onClick={alDeshacer}
          disabled={deshaciendo}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-gris underline underline-offset-4 disabled:opacity-60"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          {deshaciendo ? 'Deshaciendo…' : 'Deshacer (no era esta persona)'}
        </button>
      )}
    </div>
  )
}
