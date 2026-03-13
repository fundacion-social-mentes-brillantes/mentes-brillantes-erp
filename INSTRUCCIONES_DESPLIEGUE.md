# Instrucciones de Despliegue y Uso - Mentes Brillantes ERP

Este documento contiene las instrucciones exactas para desplegar el sistema internamente, configurar la base de datos y utilizar el sistema en el día a día sin conocimientos técnicos avanzados.

## 1. Requisitos Previos

- Una cuenta gratuita en **Supabase** (https://supabase.com).
- Una cuenta gratuita en **Vercel** (https://vercel.com) o cualquier plataforma de hosting compatible con Next.js.
- Cuenta de **GitHub** para alojar el código fuente.

## 2. Configuración de la Base de Datos (Supabase)

1. Crea un nuevo proyecto en Supabase.
2. Ve a la sección **SQL Editor** en el panel izquierdo.
3. Copia el contenido del archivo `supabase/schema.sql` que se encuentra en este repositorio.
4. Pégalo en el editor SQL y haz clic en **Run**. Esto creará todas las tablas, enums, vistas y triggers necesarios.
5. Ve a **Authentication > Providers** y asegúrate de que "Email" esté habilitado. Desactiva "Confirm email" si deseas que los usuarios puedan iniciar sesión inmediatamente sin verificar su correo.

## 3. Variables de Entorno

Necesitarás configurar las siguientes variables de entorno tanto en tu entorno local (`.env.local`) como en tu plataforma de despliegue (ej. Vercel):

```env
# URL de tu proyecto Supabase (Ej: https://xxxx.supabase.co)
NEXT_PUBLIC_SUPABASE_URL="tu_supabase_url"

# Clave pública anónima de Supabase (anon key)
NEXT_PUBLIC_SUPABASE_ANON_KEY="tu_supabase_anon_key"
```

*Nota: Puedes encontrar estas credenciales en Supabase yendo a **Project Settings > API**.*

## 4. Despliegue en Vercel (Recomendado)

1. Sube tu código a un repositorio privado en GitHub.
2. Inicia sesión en Vercel y haz clic en **Add New... > Project**.
3. Importa tu repositorio de GitHub.
4. En la sección **Environment Variables**, añade `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Haz clic en **Deploy**. En un par de minutos, tu aplicación estará en vivo.

## 5. Creación de Usuarios (Administradores y Caja)

El sistema utiliza la autenticación de Supabase. Para crear el primer usuario:

1. Ve a tu panel de Supabase > **Authentication > Users**.
2. Haz clic en **Add User > Create New User**.
3. Ingresa el correo y la contraseña del usuario (ej. `admin@mentesbrillantes.com`).
4. Una vez creado, el usuario podrá iniciar sesión en la pantalla principal de la aplicación (`/login`).

*Nota: Por defecto, el sistema asigna el rol 'consulta'. Si deseas darle permisos de 'admin', debes ir al **Table Editor > perfiles** en Supabase y cambiar su rol manualmente.*

## 6. Migración de Datos desde AppSheet (CSV)

Si vienes de AppSheet, puedes importar tus datos históricos fácilmente:

1. Exporta tus tablas de AppSheet a formato CSV.
2. Inicia sesión en el nuevo sistema y ve a **Configuración > Migración de Datos**.
3. Sube los archivos en el siguiente orden estricto para evitar errores de relación:
   - **1º Asistentes** (Asegúrate de que las columnas se llamen `Row ID`, `Nombre`, `Cedula`, etc.)
   - **2º Socios**
   - **3º Períodos**
   - **4º Adelantos**
   - **5º Movimientos** (Cuentas, Abonos, Egresos)
4. El sistema ignorará automáticamente los registros duplicados basándose en el `Row ID` original de AppSheet.

## 7. Uso Diario (Guía Rápida)

- **Dashboard:** Revisa el estado financiero del mes actual (Ingresos, Egresos, Cuentas Pendientes).
- **Asistentes:** Registra nuevos pacientes/clientes. Si un asistente deja de asistir, puedes "Desactivarlo" en lugar de borrarlo para mantener su historial.
- **Cuentas por Cobrar:** Cuando un asistente adquiere un servicio (ej. Terapia Mensual), crea una "Nueva Cuenta". Si paga de inmediato, registra un "Abono" por el valor total. Si paga a cuotas, registra abonos parciales. El sistema calculará el saldo pendiente automáticamente.
- **Egresos:** Registra todos los gastos operativos (arriendo, servicios, honorarios).
- **Liquidaciones:**
  1. Crea un "Nuevo Período" (ej. Marzo 2026).
  2. Si un socio pide dinero por adelantado, regístralo en "Adelantos".
  3. A fin de mes, ve al período y haz clic en "Cerrar Período y Liquidar". El sistema calculará automáticamente cuánto le toca a cada socio descontando sus adelantos.

## 8. Soporte y Mantenimiento
- El sistema está diseñado para ser de bajo costo. Al usar Supabase (Plan Gratuito) y Vercel (Plan Hobby/Gratuito), los costos mensuales deberían ser $0 mientras el volumen de datos sea moderado (menos de 500MB de base de datos).
- No se requiere mantenimiento de servidores.
