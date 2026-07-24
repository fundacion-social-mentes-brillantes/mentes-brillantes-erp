# MCP Financiero — Mentes Brillantes

Servidor **MCP remoto, solo lectura**, que vive dentro del mismo ERP. Deja que
Claude consulte TODO el sistema financiero en lenguaje natural, respetando la
misma lógica del programa (reusa las funciones del bot cajero).

- **URL del conector (Streamable HTTP):** `https://mentes-brillantes-erp.vercel.app/api/mcp/mcp`
- **Login:** con la **misma cuenta del ERP** (correo y contraseña) **o con Google**.
- **Quién puede entrar:** solo usuarios con rol `admin` o `caja` en la tabla
  `perfiles`. Cualquier otro (o sin cuenta) → bloqueado.
- **Solo lectura:** no puede crear, editar ni borrar nada.

> **No necesita variables de entorno nuevas.** El ERP es su propio servidor
> OAuth: firma los tokens con una clave derivada del `SUPABASE_SERVICE_ROLE_KEY`
> que ya existe en Vercel. El login por **correo/contraseña funciona desde el
> primer momento**. Google es opcional y solo requiere una configuración única
> en la consola de Supabase (Paso 2).

## Herramientas que expone (≈18, todas de solo lectura)
Por persona: `estado_persona`, `pagos_persona`, `ultimo_pago_persona`,
`compras_persona`, `donaciones_persona`, `sesiones_coach_persona` (incluye
sesiones migradas). Global: `compradores_de_concepto` (ej. quiénes compraron
"pasos"), `cartera_pendiente`, `conteos`, `periodos`, `socios_liquidacion`,
`buscar_global`. Por rango de fechas: `resumen_periodo`, `egresos`,
`ventas_externas`, `donaciones_resumen`, `alertas`.

---

## Cómo funciona la seguridad (resumen)

1. Claude descubre el servidor OAuth del propio ERP vía
   `/.well-known/oauth-authorization-server` y se registra solo (DCR).
2. Claude abre la página de login del ERP (`/api/mcp/oauth/authorize`) con PKCE.
3. El usuario entra con su **correo/contraseña del ERP** o con **Google**.
4. El ERP verifica el rol en `perfiles`: solo `admin`/`caja` obtienen un código.
5. Claude canjea el código (validando PKCE) por un token de acceso (1 h) y uno
   de refresco (30 días). **En cada refresco se vuelve a comprobar el rol en la
   base**, así que si a alguien se le quita el permiso, deja de tener acceso.

Todos los tokens son JWT firmados y de vida corta; el `redirect_uri` se valida
de forma estricta (anti open-redirect) y la página de login escapa todo el HTML.

---

## Paso 1 — (Solo correo/contraseña) Nada que configurar

El MCP ya está activo con login por correo/contraseña. Salta al **Paso 3** si de
momento no quieres el botón de Google.

Verifica que está vivo abriendo en el navegador:
`https://mentes-brillantes-erp.vercel.app/.well-known/oauth-authorization-server`
Debe devolver un JSON con `authorization_endpoint`, `token_endpoint`, etc.

---

## Paso 2 — (Opcional) Activar login con Google

Esto habilita el botón **"Continuar con Google"** tanto en el ERP como en el MCP.
Es una configuración **de una sola vez** en Google Cloud + Supabase.

### 2.1 Crear la credencial en Google Cloud
1. [console.cloud.google.com](https://console.cloud.google.com) → crea/elige un proyecto.
2. **APIs & Services → OAuth consent screen** → tipo **External** → completa
   nombre de la app y correo de soporte → guarda. (Con "Testing" basta; agrega
   los 4 correos como *Test users* si no publicas la app.)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   tipo **Web application**.
4. En **Authorized redirect URIs** agrega la URL que te da Supabase (paso 2.2):
   `https://<TU-REF>.supabase.co/auth/v1/callback`
5. Copia el **Client ID** y **Client secret**.

### 2.2 Pegar la credencial en Supabase
1. [supabase.com/dashboard](https://supabase.com/dashboard) → tu proyecto →
   **Authentication → Providers → Google** → actívalo.
2. Pega el **Client ID** y **Client secret** de Google → guarda.
3. Copia el **Callback URL** que muestra ahí y verifica que sea el mismo que
   pusiste en el paso 2.1 (item 4).

### 2.3 Autorizar las URLs de retorno del ERP
En Supabase → **Authentication → URL Configuration → Redirect URLs**, agrega:
```
https://mentes-brillantes-erp.vercel.app/auth/callback
https://mentes-brillantes-erp.vercel.app/api/mcp/oauth/google-callback
```
(La primera es para el login con Google del ERP; la segunda para el del MCP.)

> Importante: la cuenta de Google de cada persona debe corresponder a un usuario
> con rol `admin`/`caja` en `perfiles`. Si alguien ya tenía cuenta con
> correo/contraseña y entra con el mismo correo por Google, el sistema lo
> reconoce por correo y respeta su rol.

---

## Paso 3 — Cada usuario instala el conector (por usuario, no local)

En **claude.ai → Settings → Connectors → Add custom connector**:
1. **URL:** `https://mentes-brillantes-erp.vercel.app/api/mcp/mcp`
2. Claude abrirá la página de login del ERP.
3. Inicia sesión con tu **correo/contraseña del ERP** o con **Google** (tu cuenta
   debe tener rol `admin` o `caja`).
4. Listo: aparecerán las herramientas del ERP. Pregunta en lenguaje natural, ej.:
   *"¿cuánto debe Sirley Urbano?"*, *"quiénes compraron pasos"*,
   *"resumen del último período"*, *"sesiones coach de Daniel Alarcón con fechas"*.

Cada uno de los 4 repite el Paso 3 en su propia cuenta de Claude.

---

## Seguridad (detalle)
- **Solo `admin`/`caja`** obtienen token; cualquier otro correo/rol → rechazado.
- **PKCE (S256) obligatorio** y `redirect_uri` validado estrictamente.
- **Tokens JWT firmados y cortos** (acceso 1 h, refresco 30 días); el refresco
  **revalida el rol en la base** en cada uso (revocación efectiva al dar de baja).
- **Solo lectura:** cero riesgo de alterar finanzas.
- La clave de firma se deriva del `SUPABASE_SERVICE_ROLE_KEY` (nunca se expone al
  cliente) — no hay secretos nuevos que gestionar.
- Endpoints del MCP y `/.well-known` excluidos del middleware de sesión.
