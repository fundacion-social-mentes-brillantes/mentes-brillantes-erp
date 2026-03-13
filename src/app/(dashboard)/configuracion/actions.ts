'use server'

import { createClient } from '@/lib/supabase/server'
import Papa from 'papaparse'
import { revalidatePath } from 'next/cache'

export async function actualizarConfiguracionEmpresa(formData: FormData) {
  const supabase = await createClient()
  if (!supabase) throw new Error('Supabase no configurado')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  // Verify admin role
  const { data: userData } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (userData?.rol !== 'admin') throw new Error('Solo los administradores pueden modificar la configuración')

  const nombre = formData.get('nombre') as string
  const nit = formData.get('nit') as string
  const correo = formData.get('correo') as string
  const telefono = formData.get('telefono') as string
  const ciudad = formData.get('ciudad') as string

  if (!nombre || !nit) throw new Error('El nombre y el NIT son obligatorios')

  const { error } = await supabase
    .from('configuracion_empresa')
    .update({ 
      nombre, 
      nit, 
      correo: correo || null, 
      telefono: telefono || null, 
      ciudad: ciudad || null, 
      updated_at: new Date().toISOString() 
    })
    .eq('id', 1)

  if (error) throw new Error('Error al actualizar la configuración: ' + error.message)

  revalidatePath('/', 'layout')
  
  return { success: true }
}

export async function procesarMigracion(tipo: string, rows: any[]) {
  const supabase = await createClient()
  if (!supabase) return { success: false, message: 'Supabase no configurado' }

  if (!tipo || !rows || !Array.isArray(rows)) {
    return { success: false, message: 'Faltan datos o formato inválido' }
  }

  let inserted = 0
  let ignored = 0
  let errors = 0
  const errorMsgs: string[] = []

  // Helpers para buscar IDs
  const getAsistenteId = async (nombreOrId: string) => {
    if (!nombreOrId) return null;
    const { data } = await supabase.from('asistentes').select('id').or(`nombre.ilike.%${nombreOrId}%,legacy_row_id.eq.${nombreOrId},legacy_asistente_id.eq.${nombreOrId}`).limit(1).single()
    return data?.id || null
  }

  const getSocioId = async (nombreOrId: string) => {
    if (!nombreOrId) return null;
    const { data } = await supabase.from('socios').select('id').or(`nombre.ilike.%${nombreOrId}%,legacy_row_id.eq.${nombreOrId}`).limit(1).single()
    return data?.id || null
  }

  const getPeriodoIdByDate = async (dateStr: string) => {
    if (!dateStr) return null;
    const { data } = await supabase.from('periodos')
      .select('id')
      .lte('fecha_inicio', dateStr)
      .gte('fecha_fin', dateStr)
      .limit(1).single()
    return data?.id || null
  }

  const parseDate = (d: string) => {
    if (!d) return new Date().toISOString().split('T')[0];
    // Si viene como DD/MM/YYYY
    if (d.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
      const [day, month, year] = d.split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return d;
  }

  const parseBoolean = (val: any) => {
    if (val === undefined || val === null || val === '') return true;
    const str = String(val).trim().toLowerCase();
    if (str === 'false' || str === 'n' || str === '0' || str === 'no') return false;
    return true;
  }

  const parseCurrency = (val: any) => {
    if (val === undefined || val === null || val === '') return 0;
    // Convertir a string, quitar $, comas, espacios y comillas
    const cleaned = String(val).replace(/[$,\s"']/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    
    // Skip completely empty or garbage rows (e.g. a single stray character at the end of the file)
    // Si la fila tiene menos de 3 columnas (y esperamos 5-8), casi seguro es basura.
    if (!row || Object.keys(row).length < 3) {
      ignored++;
      continue;
    }
    
    try {
      const rowId = row.row_id || `mig_${Date.now()}_${index}`

      if (tipo === 'asistentes') {
        const { error } = await supabase.from('asistentes').insert([{
          legacy_row_id: rowId,
          legacy_asistente_id: row.asistente_id || null,
          codigo: row.codigo || null,
          nombre: row.nombre || 'Sin Nombre',
          cedula: row.cedula || null,
          correo: row.correo || null,
          telefono: row.telefono || null,
          activo: parseBoolean(row.activo)
        }])
        if (error) {
          if (error.code === '23505') ignored++ // Unique violation
          else { errors++; errorMsgs.push(`Fila ${index + 1}: ${error.message}`) }
        } else inserted++
      }

      else if (tipo === 'socios') {
        const { error } = await supabase.from('socios').insert([{
          legacy_row_id: rowId,
          nombre: row.nombre || 'Sin Nombre',
          porcentaje_participacion: parseFloat(row.porcentaje || '0'),
          activo: parseBoolean(row.activo)
        }])
        if (error) {
          if (error.code === '23505') ignored++
          else { errors++; errorMsgs.push(`Fila ${index + 1}: ${error.message}`) }
        } else inserted++
      }

      else if (tipo === 'periodos') {
        const fInicio = parseDate(row.fecha_inicio);
        const fFin = parseDate(row.fecha_fin);
        const { error } = await supabase.from('periodos').insert([{
          legacy_row_id: rowId,
          nombre: `Período ${fInicio}`,
          fecha_inicio: fInicio,
          fecha_fin: fFin,
          estado: 'abierto'
        }])
        if (error) {
          if (error.code === '23505') ignored++
          else { errors++; errorMsgs.push(`Fila ${index + 1}: ${error.message}`) }
        } else inserted++
      }

      else if (tipo === 'adelantos') {
        const socio_id = await getSocioId(row.socio)
        const fechaAdelanto = parseDate(row.date)
        const periodo_id = await getPeriodoIdByDate(fechaAdelanto)
        
        if (!socio_id) {
          errors++; errorMsgs.push(`Fila ${index + 1}: Socio no encontrado (${row.socio})`)
          continue
        }
        if (!periodo_id) {
          errors++; errorMsgs.push(`Fila ${index + 1}: No hay un período que cubra la fecha ${fechaAdelanto}`)
          continue
        }

        const { error } = await supabase.from('adelantos_socios').insert([{
          legacy_row_id: rowId,
          socio_id,
          periodo_id,
          monto: parseFloat(row.monto || '0'),
          fecha: fechaAdelanto,
          notas: row.notas || null
        }])
        if (error) {
          if (error.code === '23505') ignored++
          else { errors++; errorMsgs.push(`Fila ${index + 1}: ${error.message}`) }
        } else inserted++
      }

      else if (tipo === 'movimientos') {
        const tipoMov = (row.tipo || '').toLowerCase().trim()
        const concepto = (row.concepto || '').trim()
        const valor_compra = parseCurrency(row.valor_compra)
        const valor_abonado = parseCurrency(row.valor_abonado)
        const monto = parseCurrency(row.monto)
        const asistente_ref = (row.asistente_ref || '').trim()
        
        // Parsear fecha, no usar hoy como respaldo
        let fechaStr = row.Fecha || row.fecha || row.Date || row.date
        let fecha = null

        if (fechaStr) {
          try {
            // Limpiar espacios
            fechaStr = fechaStr.trim()
            
            // Caso 1: DD/MM/YYYY o DD-MM-YYYY
            if (fechaStr.includes('/') || (fechaStr.includes('-') && fechaStr.split('-')[0].length <= 2)) {
              const separator = fechaStr.includes('/') ? '/' : '-'
              const parts = fechaStr.split(separator)
              if (parts.length === 3) {
                // Asumimos DD/MM/YYYY
                const day = parts[0].padStart(2, '0')
                const month = parts[1].padStart(2, '0')
                let year = parts[2]
                // Si el año tiene 2 dígitos (ej. 23), asumimos 2000+
                if (year.length === 2) year = `20${year}`
                
                fecha = `${year}-${month}-${day}`
              }
            } 
            // Caso 2: YYYY-MM-DD o YYYY/MM/DD
            else if (fechaStr.includes('-') || fechaStr.includes('/')) {
              const separator = fechaStr.includes('-') ? '-' : '/'
              const parts = fechaStr.split(separator)
              if (parts.length === 3 && parts[0].length === 4) {
                const year = parts[0]
                const month = parts[1].padStart(2, '0')
                const day = parts[2].padStart(2, '0')
                fecha = `${year}-${month}-${day}`
              }
            }
          } catch (e) {}
        }

        if (!fecha) {
          errors++; errorMsgs.push(`Fila ${index + 1}: Fecha inválida o faltante ("${fechaStr || 'vacío'}"). No se usará la fecha actual.`);
          continue;
        }

        const metodoRaw = (row.metodo_pago || 'efectivo').toLowerCase()
        let metodo = 'otro'
        if (metodoRaw.includes('efectivo')) metodo = 'efectivo'
        else if (metodoRaw.includes('nequi')) metodo = 'nequi'
        else if (metodoRaw.includes('daviplata')) metodo = 'daviplata'

        // Validar Asistente (Búsqueda estricta por legacy_asistente_id)
        let asistente_id = null;
        if (asistente_ref) {
          const { data } = await supabase.from('asistentes').select('id').eq('legacy_asistente_id', asistente_ref).limit(1).single()
          asistente_id = data?.id || null
        }

        if (tipoMov === 'egreso' || tipoMov === 'gasto') {
          if (asistente_ref) {
            errors++; errorMsgs.push(`Fila ${index + 1}: Es un Egreso pero tiene un Asistente vinculado (${asistente_ref}). Ambigüedad.`);
            continue;
          }
          const { error } = await supabase.from('egresos').insert([{
            legacy_row_id: rowId,
            concepto,
            monto: monto > 0 ? monto : valor_compra,
            categoria: 'Otros',
            metodo_pago: metodo,
            fecha,
            notas: row.nota || null
          }])
          if (error) {
            if (error.code === '23505') ignored++
            else { errors++; errorMsgs.push(`Fila ${index + 1}: ${error.message}`) }
          } else inserted++
        } 
        else if (tipoMov === 'ingreso' || tipoMov === 'cobro' || tipoMov === 'cuenta' || tipoMov === 'cortesía' || tipoMov === 'cortesia') {
          if (!asistente_id && asistente_ref) {
            errors++; errorMsgs.push(`Fila ${index + 1}: El Asistente Ref "${asistente_ref}" no existe en la base de datos actual.`);
            continue;
          }
          if (!asistente_ref) {
            errors++; errorMsgs.push(`Fila ${index + 1}: No tiene Asistente Ref.`);
            continue;
          }

          // Abono Huérfano
          if (valor_compra === 0 && (monto < 0 || valor_abonado > 0)) {
            errors++; errorMsgs.push(`Fila ${index + 1}: Abono huérfano (Valor Compra es 0 y no hay cuenta vinculada en esta fila).`);
            continue;
          }
          // Saldo a favor inconsistente
          if (valor_abonado > valor_compra && valor_compra > 0) {
            errors++; errorMsgs.push(`Fila ${index + 1}: Ambigüedad matemática (Valor Abonado ${valor_abonado} es mayor al Valor Compra ${valor_compra}).`);
            continue;
          }

          // Cortesía
          if (valor_compra === 0 && valor_abonado === 0 && monto === 0) {
            errors++; errorMsgs.push(`Fila ${index + 1}: Cortesía (valor 0) no soportada por el esquema actual (requiere valor > 0).`);
            continue;
          }
          // Ingreso Total (Contado)
          else if (valor_compra === valor_abonado && monto === 0 && valor_compra > 0) {
            const { data: cuenta, error: errCuenta } = await supabase.from('cuentas_por_cobrar').insert([{
              legacy_row_id: rowId,
              asistente_id,
              concepto,
              valor_total: valor_compra,
              fecha_emision: fecha,
              estado: 'pagado'
            }]).select('id').single()

            if (errCuenta) {
              if (errCuenta.code === '23505') ignored++
              else { errors++; errorMsgs.push(`Fila ${index + 1}: ${errCuenta.message}`) }
              continue
            }

            const { error: errAbono } = await supabase.from('pagos_abonos').insert([{
              legacy_row_id: `${rowId}_abono`,
              cuenta_id: cuenta.id,
              monto: valor_abonado,
              metodo_pago: metodo,
              fecha_pago: fecha,
              notas: row.nota || 'Ingreso de contado migrado'
            }])
            if (errAbono) {
              errors++; errorMsgs.push(`Fila ${index + 1} (Abono): ${errAbono.message}`)
            }
            inserted++
          }
          // Pago Parcial (Venta a Crédito)
          else if (valor_compra > valor_abonado && monto > 0) {
            const { data: cuenta, error: errCuenta } = await supabase.from('cuentas_por_cobrar').insert([{
              legacy_row_id: rowId,
              asistente_id,
              concepto,
              valor_total: valor_compra,
              fecha_emision: fecha,
              estado: valor_abonado > 0 ? 'parcial' : 'pendiente'
            }]).select('id').single()

            if (errCuenta) {
              if (errCuenta.code === '23505') ignored++
              else { errors++; errorMsgs.push(`Fila ${index + 1}: ${errCuenta.message}`) }
              continue
            }

            if (valor_abonado > 0) {
              const { error: errAbono } = await supabase.from('pagos_abonos').insert([{
                legacy_row_id: `${rowId}_abono`,
                cuenta_id: cuenta.id,
                monto: valor_abonado,
                metodo_pago: metodo,
                fecha_pago: fecha,
                notas: row.nota || 'Abono inicial migrado'
              }])
              if (errAbono) {
                errors++; errorMsgs.push(`Fila ${index + 1} (Abono): ${errAbono.message}`)
              }
            }
            inserted++
          }
          else {
            errors++; errorMsgs.push(`Fila ${index + 1}: Caso no contemplado en las reglas matemáticas (Compra: ${valor_compra}, Abonado: ${valor_abonado}, Monto: ${monto}).`);
            continue;
          }
        } else {
          errors++; errorMsgs.push(`Fila ${index + 1}: Tipo de movimiento desconocido ("${tipoMov}").`);
          continue;
        }
      }

    } catch (err: any) {
      errors++
      errorMsgs.push(`Fila ${index + 1}: Excepción - ${err.message}`)
    }
  }

  return {
    success: true,
    message: 'Migración completada',
    stats: { total: rows.length, inserted, ignored, errors },
    errors: errorMsgs.slice(0, 10)
  }
}
