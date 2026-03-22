<div align="center">
<img width="1200" height="475" alt="Mentes Brillantes ERP" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ERP Fundación Social Gimnasio Emocional Mentes Brillantes

Sistema interno (Next.js + Supabase) para la gestión administrativa y financiera de la fundación: panel gerencial, cuentas por cobrar, movimientos de caja, egresos, socios, liquidaciones y módulos operativos de asistentes.

## Funcionalidades actuales
- Autenticación Supabase y roles básicos (admin/caja/consulta).
- Dashboard con indicadores de ingresos, egresos, utilidad y cartera; gráfico de balance diario.
- Gestión de movimientos (pagos/abonos) con filtros y estados.
- Cuentas por cobrar: creación, edición, aplicación de abonos y control de estado.
- Egresos con categorías y notas.
- Socios, adelantos y liquidaciones con generación de reporte PDF.
- Módulo de asistentes (altas/consultas).
- Exportes PDF del dashboard (html2canvas + jsPDF) optimizados para legibilidad.

## Stack tecnológico
- Next.js 16 (React 19) con App Router.
- Supabase (Auth + Postgres).
- Tailwind CSS v4.
- Recharts, Lucide Icons.
- Vitest para pruebas.

## Requisitos
- Node.js ≥ 18.18 y npm.
- Proyecto Supabase con URL y anon key configuradas.

## Instalación local
1) Instalar dependencias  
```bash
npm install
```
2) Configurar variables en `.env.local` (ver sección siguiente).  
3) Ejecutar en desarrollo  
```bash
npm run dev
```

## Variables de entorno
Obligatorias:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

(Las claves GEMINI/AI Studio ya no son necesarias para el funcionamiento actual.)

## Scripts disponibles
- `npm run dev` — servidor de desarrollo.
- `npm run build` — build de producción (Next).
- `npm run start` — servidor de producción local.
- `npm run lint` — linting.
- `npm run test` — suite Vitest (con parches para Windows y uso de `.tmp`).

## Notas de base de datos / Supabase
- Esquema principal en `supabase/schema.sql`.
- Objetos adicionales requeridos para contabilidad avanzada (no incluidos aún en `schema.sql`):  
  - Vista `vw_movimientos_generales`  
  - Tabla `movimientos_saldo_favor`  
  - Tabla `auditoria_financiera`  
  - RPC `aplicar_saldo_favor_trx`
- Ajusta roles/seguridad en Supabase según los perfiles `rol_usuario`.

## Estado actual
- Pruebas: suite Vitest pasando en entorno local (Windows).  
- Build: en algunos entornos Windows puede fallar por `spawn EPERM` al crear artefactos de `.next`; revisar antivirus/permisos si aparece.  
- UI: soporta tema claro/oscuro con tokens centralizados en `globals.css` y toggle en el header.

## Observaciones / pendientes conocidos
- Asegurar la creación de los objetos contables adicionales en la base de datos antes de usar movimientos avanzados o saldo a favor.
- Investigar y mitigar el `spawn EPERM` durante `npm run build` en Windows (suele resolverse permitiendo escritura en `.next` o desactivando bloqueos del AV).
