import { Database, KeyRound, Settings, AlertCircle } from "lucide-react";

export function SetupSupabase() {
  return (
    <div className="min-h-screen bg-suave flex items-center justify-center p-4 font-sans">
      <div className="max-w-2xl w-full bg-panel rounded-2xl border border-linea overflow-hidden">
        <div className="p-8 border-b border-linea bg-acento text-sobre-acento">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-rojo/20 text-rojo rounded-lg">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Configuración Pendiente</h1>
          </div>
          <p className="text-gris">
            El sistema requiere conexión a Supabase para funcionar. Faltan las variables de entorno obligatorias.
          </p>
        </div>

        <div className="p-8 space-y-8">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-tinta flex items-center gap-2">
              <Database className="w-5 h-5 text-gris" />
              Paso 1: Obtén tus credenciales
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-gris ml-2">
              <li>Ve a tu proyecto en <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-info hover:underline">Supabase Dashboard</a>.</li>
              <li>Navega a <strong>Project Settings</strong> (icono de engranaje).</li>
              <li>Haz clic en <strong>API</strong> en el menú lateral.</li>
              <li>Copia la <strong>Project URL</strong> y la <strong>anon / public key</strong>.</li>
            </ol>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-tinta flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-gris" />
              Paso 2: Configura AI Studio
            </h2>
            <div className="bg-suave p-4 rounded-lg border border-linea">
              <p className="text-sm text-gris mb-4">
                En la interfaz de AI Studio, abre el panel de <strong>Secrets / Variables de Entorno</strong> y agrega exactamente estas dos llaves:
              </p>
              <div className="space-y-3 font-mono text-sm">
                <div>
                  <div className="text-xs text-gris mb-1">Variable 1:</div>
                  <div className="bg-acento text-verde p-2 rounded">NEXT_PUBLIC_SUPABASE_URL</div>
                </div>
                <div>
                  <div className="text-xs text-gris mb-1">Variable 2:</div>
                  <div className="bg-acento text-verde p-2 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-tinta flex items-center gap-2">
              <Settings className="w-5 h-5 text-gris" />
              Paso 3: Reinicia el entorno
            </h2>
            <p className="text-gris ml-7">
              Una vez agregadas las variables, el entorno de AI Studio se recargará automáticamente y esta pantalla desaparecerá, dándote acceso al sistema real.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
