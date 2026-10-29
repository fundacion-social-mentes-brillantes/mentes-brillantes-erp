'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { MEDIOS_POR_DEFECTO, nombreMedio, recordarMedios, type MedioPago } from '@/lib/medios-pago'

// Las cuentas de dinero llegan del layout (que las lee de medios_pago) y aqui
// quedan a mano para cualquier formulario: asi un nombre cambiado o una cuenta
// nueva en Configuracion se ven en todas partes sin tocar cada pantalla.

const MediosContexto = createContext<MedioPago[]>(MEDIOS_POR_DEFECTO)

export function MediosPagoProvider({ medios, children }: { medios: MedioPago[]; children: ReactNode }) {
  // Tambien se recuerdan para metodoPagoLegible(), que nombra fuera de React.
  recordarMedios(medios)
  return <MediosContexto.Provider value={medios}>{children}</MediosContexto.Provider>
}

export function useMediosPago(): MedioPago[] {
  return useContext(MediosContexto)
}

/**
 * Las <option> de un <select> de metodo de pago: las cuentas activas en su
 * orden. Si el registro que se edita usa una cuenta ya oculta, esa tambien
 * aparece, para no cambiarla sin querer.
 */
export function OpcionesMedioPago({ actual, excluir }: { actual?: string | null; excluir?: string | null }) {
  const medios = useMediosPago()
  const visibles = medios.filter((m) => m.activo && m.clave !== excluir)
  const falta = actual && actual !== excluir && !visibles.some((m) => m.clave === actual) ? actual : null
  return (
    <>
      {visibles.map((m) => (
        <option key={m.clave} value={m.clave}>
          {m.nombre}
        </option>
      ))}
      {falta && <option value={falta}>{nombreMedio(falta)}</option>}
    </>
  )
}
