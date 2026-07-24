# MCP Financiero — Mentes Brillantes

Servidor **MCP remoto, solo lectura**, que vive dentro del mismo ERP. Deja que
Claude (y otros clientes MCP) consulten TODO el sistema financiero con lenguaje
natural, respetando la misma lógica del programa (reusa las funciones del bot).

- **URL del conector (Streamable HTTP):** `https://mentes-brillantes-erp.vercel.app/api/mcp/mcp`
- **Metadata OAuth:** `https://mentes-brillantes-erp.vercel.app/.well-known/oauth-protected-resource`
- **Estado sin configurar:** responde `401` (bloqueado). Se activa al poner las 3
  variables de entorno en Vercel y redesplegar.
- **Solo lectura:** no puede crear, editar ni borrar nada. Los datos se leen con
  `service_role`; la seguridad real es OAuth + lista blanca de correos.

## Herramientas que expone (≈18, todas de solo lectura)
Por persona: `estado_persona`, `pagos_persona`, `ultimo_pago_persona`,
`compras_persona`, `donaciones_persona`, `sesiones_coach_persona` (incluye
sesiones migradas). Global: `compradores_de_concepto` (ej. quiénes compraron
"pasos"), `cartera_pendiente`, `conteos`, `periodos`, `socios_liquidacion`,
`buscar_global`. Por rango de fechas: `resumen_periodo`, `egresos`,
`ventas_externas`, `donaciones_resumen`, `alertas`.

---

## Paso 1 — Elegir el proveedor OAuth

El MCP no guarda contraseñas: confía en un proveedor de identidad (Authorization
Server). Dos caminos válidos:

### Opción A — WorkOS AuthKit (recomendada, más fácil y confiable)
Está hecha para MCP: soporta el registro dinámico que Claude necesita y login
con Microsoft/Google. Tiene plan gratuito.
1. Crea cuenta en workos.com → AuthKit.
2. Activa los proveedores de login que usan (Microsoft y/o Google).
3. Copia:
   - **Issuer** (algo como `https://<tuapp>.authkit.app` o el dominio AuthKit).
   - **Client ID** (será el `audience`).

### Opción B — Microsoft Entra ID (sin proveedor nuevo; ya tienen Azure)
1. Azure Portal → **Microsoft Entra ID → App registrations → New registration**.
   - Redirect URI (Web): `https://claude.ai/api/mcp/auth_callback` (y, si usan
     Claude Desktop, agrega también el que indique Claude al conectar).
2. **Expose an API** → agrega un scope (ej. `erp.read`); anota el
   *Application ID URI* (`api://<client-id>`).
3. Anota:
   - **Issuer:** `https://login.microsoftonline.com/<TENANT_ID>/v2.0`
   - **Audience:** el **Client ID** (o el `api://<client-id>` del scope).
   - Crea un **client secret** (lo usarás al añadir el conector en Claude).

> Nota: Google "a secas" no sirve con esta validación (sus access tokens no son
> JWT verificables). Si quieren login con Google, úsenlo **a través de AuthKit**.

---

## Paso 2 — Variables de entorno en Vercel

Proyecto `mentes-brillantes-erp` → Settings → Environment Variables (Production):

| Variable | Valor |
|---|---|
| `MCP_OAUTH_ISSUER` | El *issuer* del Paso 1 |
| `MCP_OAUTH_AUDIENCE` | El *client id* / audience del Paso 1 |
| `MCP_ALLOWED_EMAILS` | Los 4 correos, separados por coma. Opcional rol: `ana@x.com:admin, juan@x.com:caja` |

Luego **Redeploy** (o push a `main`) para que tomen efecto.

Verifica que quedó activo: al abrir
`https://mentes-brillantes-erp.vercel.app/.well-known/oauth-protected-resource`
el campo `authorization_servers` debe mostrar tu issuer.

---

## Paso 3 — Cada usuario instala el conector (por usuario, no local)

En **claude.ai → Settings → Connectors → Add custom connector**:
1. **URL:** `https://mentes-brillantes-erp.vercel.app/api/mcp/mcp`
2. Si pide credenciales OAuth (opción Entra): pega el **Client ID** y **Client
   secret**. Con AuthKit normalmente se registra solo.
3. Claude abrirá el login del proveedor → inicia sesión con tu correo (debe estar
   en `MCP_ALLOWED_EMAILS`).
4. Listo: aparecerán las herramientas del ERP. Pregunta en lenguaje natural, ej.:
   *"¿cuánto debe Sirley Urbano?"*, *"quiénes compraron pasos"*,
   *"resumen del último período"*, *"sesiones coach de Daniel Alarcón con fechas"*.

Cada uno de los 4 repite el Paso 3 en su propia cuenta de Claude.

---

## Seguridad
- Solo los correos en `MCP_ALLOWED_EMAILS` pueden entrar (todo lo demás → 401).
- Token validado criptográficamente (JWKS) contra el proveedor, con issuer y
  audience esperados.
- Solo lectura: cero riesgo de alterar finanzas.
- Endpoints del MCP excluidos del middleware de sesión (no redirigen a /login).
