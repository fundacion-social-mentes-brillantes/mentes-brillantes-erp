# MCP unificado de Mentes Brillantes

Esta guía explica cómo conectar el ERP de Mentes Brillantes con Claude o
ChatGPT mediante un único servidor MCP remoto. Cada persona se autentica con su
propia cuenta: no se comparte una sesión, contraseña ni conexión entre usuarios.

## Dirección única del conector

Usa exactamente esta URL, sin cambiar la ruta ni agregar una barra al final:

```text
https://mentes-brillantes-erp.vercel.app/api/mcp/mcp
```

El servidor usa Streamable HTTP y OAuth 2.1. No requiere instalar un servidor
local ni copiar claves del ERP en Claude o ChatGPT.

## Qué permite y qué no

- Consulta información financiera y operativa del ERP (22 herramientas de solo
  lectura).
- **Registra movimientos** (30 operaciones), siempre en dos pasos: primero un
  borrador que no escribe nada, y solo después la confirmación explícita de la
  persona. Ver "Cómo se registran los movimientos".
- Solo admite usuarios del ERP con rol `admin` o `caja`, con **exactamente los
  mismos permisos que tendrían usando el ERP por navegador**.
- El funcionamiento del ERP normal no depende de que Claude o ChatGPT estén
  conectados.

El servicio conserva el estado técnico mínimo necesario para autenticar,
renovar o revocar conexiones, y registra auditoría técnica de acceso.

## Cómo se registran los movimientos

Nada se escribe de un solo golpe. El flujo siempre es el mismo:

1. **`preparar_*`** calcula lo que pasaría y **no escribe nada**. Devuelve el
   detalle (persona, cuenta, monto, fecha y cómo queda el saldo antes y
   después) más un `confirmacion_id`.
2. Se le muestra ese resumen a la persona y se espera su aprobación explícita.
3. **`confirmar_operacion`** ejecuta. El paso a "ejecutando" es un UPDATE
   condicional, así que **un mismo borrador no puede escribir dos veces**
   aunque se reintente o se duplique la confirmación.
4. **`cancelar_operacion`** descarta un borrador que no se aprobó.

Los borradores caducan a los 10 minutos y avisan si detectan una operación
idéntica ejecutada en las últimas 24 horas (por ejemplo, la misma foto de un
comprobante enviada dos veces).

Las operaciones destructivas (anular, eliminar, revertir, cerrar liquidación)
exigen además una confirmación reforzada y son **solo de rol `admin`**. No
existe ninguna herramienta que borre en lote: siempre un registro a la vez.

### Un caso típico: registrar el pago de una sesión coach

Se le envía a Claude la foto del comprobante. De ahí salen el nombre, el monto
y la fecha del pago. Si no se indica la fecha de la sesión, se consulta la
agenda (que comparte los códigos de persona con el ERP). Después se prepara la
cuenta de cobro, el pago y la sesión, se muestra el borrador y solo se registra
tras la aprobación.

## Acceso individual

Antes de conectar a una persona, verifica que:

1. Tenga un usuario activo en la autenticación del ERP.
2. Su registro en `perfiles` tenga el rol `admin` o `caja`.
3. Use su propia cuenta de Claude o ChatGPT.
4. Su plan y las políticas de su espacio de trabajo permitan conectores MCP
   personalizados.

Cada combinación de persona y cliente se autoriza por separado. Por ejemplo,
Ana puede conectar su usuario del ERP en Claude y Carlos el suyo en ChatGPT.
Incluso si una misma persona usa las dos plataformas, deberá autorizar cada
conexión de forma independiente.

### Formas de iniciar sesión

La pantalla de autorización del ERP ofrece estas opciones:

- **Continuar con mi sesión activa del ERP.** Si la persona ya inició sesión en
  el ERP en ese mismo navegador, puede reutilizarla mediante este botón. La
  acción requiere consentimiento explícito: la sesión nunca se usa para
  autorizar el conector hasta que la persona presiona el botón. El formulario
  usa un consentimiento firmado de 10 minutos, ligado al cliente, callback,
  PKCE y permisos solicitados. Claude y ChatGPT no reciben las cookies ni las
  credenciales de esa sesión.
- **Correo y contraseña del ERP.** Es la alternativa disponible cuando no hay
  una sesión activa. La contraseña se escribe únicamente en la página del ERP
  durante el flujo OAuth; Claude y ChatGPT no la reciben.
- **Google.** Está oculto y deshabilitado por defecto. Solo aparece cuando el
  proveedor Google ya está activo en Supabase **y** la variable de servidor
  `MCP_GOOGLE_AUTH_ENABLED` tiene exactamente el valor `true`. El correo de
  Google debe corresponder al perfil autorizado del ERP.

No compartas contraseñas, códigos, tokens, cookies ni secretos de Google o
Supabase por chat. Configura credenciales solamente en los paneles oficiales.

## Conectar en Claude

### Cuenta personal Pro o Max

1. Abre **Settings > Connectors** en Claude o Claude Desktop.
2. Selecciona **Add custom connector**.
3. Usa un nombre reconocible, por ejemplo `Mentes Brillantes ERP`.
4. Pega la dirección exacta del conector.
5. Selecciona **Add** y luego **Connect**.
6. En la página del ERP, inicia sesión con el usuario individual y autoriza el
   acceso de lectura.
7. En un chat nuevo, abre **Search and tools** y habilita el conector o las
   herramientas que necesites.

### Claude Team o Enterprise

Un Owner o Primary Owner debe agregar primero el conector en
**Settings > Connectors > Organization connectors**. Después, cada miembro
habilitado selecciona **Connect** y completa el login con su propio usuario del
ERP. La autenticación del administrador no debe reutilizarse para los demás.

Anthropic documenta actualmente los conectores MCP remotos para Claude Pro,
Max, Team y Enterprise, pero la disponibilidad y los nombres de los menús
pueden cambiar. Consulta la
[guía oficial para construir conectores MCP remotos de Claude](https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers).

## Conectar en ChatGPT

ChatGPT presenta los MCP personalizados como **apps**. La configuración inicial
normalmente la hace un administrador o una persona autorizada del espacio de
trabajo:

1. En ChatGPT web, habilita **Developer mode** desde la configuración de Apps
   o del espacio de trabajo.
2. Abre **Settings > Apps > Create** o **Workspace settings > Apps > Create**,
   según el rol disponible.
3. Crea una app llamada `Mentes Brillantes ERP`.
4. Pega la dirección exacta del conector y selecciona OAuth como método de
   autenticación si la interfaz lo solicita.
5. Ejecuta **Scan tools**, completa el login de prueba y revisa que aparezcan
   únicamente acciones de lectura.
6. Guarda la app. En un espacio de trabajo, el Owner/Admin debe publicarla y
   habilitarla para las personas o grupos correspondientes.
7. Cada usuario abre la app en **Settings > Apps**, selecciona **Connect** e
   inicia sesión con su propia cuenta del ERP.
8. En un chat nuevo, selecciona la app desde el menú de herramientas o
   menciónala cuando la interfaz lo permita.

La documentación de OpenAI indica actualmente soporte MCP completo en ChatGPT
Business, Enterprise y Edu, con controles administrativos. En Pro puede estar
disponible el acceso de lectura mediante `search` y `fetch` en modo
desarrollador. La función está en evolución y puede variar por plan, rol,
región, superficie o política del espacio de trabajo. Revisa la
[disponibilidad oficial del modo desarrollador y las apps MCP](https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta)
antes de configurar varios usuarios. Para el contrato técnico vigente, consulta
también la [autenticación OAuth de plugins](https://developers.openai.com/plugins/build/auth)
y el [contrato MCP de `search` y `fetch`](https://developers.openai.com/api/docs/mcp).

## Las herramientas de consulta (22)

### Consultas por persona

1. `estado_persona`: totales facturados, abonados, pendientes y saldo a favor.
2. `pagos_persona`: pagos o abonos válidos recientes.
3. `ultimo_pago_persona`: último pago válido registrado.
4. `compras_persona`: cuentas o conceptos comprados, con sus saldos.
5. `donaciones_persona`: donaciones registradas.
6. `sesiones_coach_persona`: sesiones del módulo actual y registros migrados,
   con fechas, sin exponer notas privadas del coach.

### Consultas globales y por concepto

7. `compradores_de_concepto`: personas asociadas a un concepto o producto.
8. `cartera_pendiente`: cartera global, personas con deuda y mayores saldos.
9. `conteos`: conteos de asistentes y cuentas pendientes.
10. `periodos`: períodos o liquidaciones abiertos y cerrados.
11. `socios_liquidacion`: reparto y liquidación más reciente de los socios.
12. `buscar_global`: búsqueda operativa directa dentro del ERP.

### Consultas por fecha

13. `resumen_periodo`: ingresos, egresos y utilidad estimada de un rango.
14. `egresos`: egresos activos del rango solicitado.
15. `ventas_externas`: ventas externas activas del rango.
16. `donaciones_resumen`: total de donaciones válidas del rango.
17. `alertas`: alertas operativas respaldadas por evidencia.

### Revisión y control

18. `ultimos_movimientos`: lo último registrado en todo el ERP (pagos,
    egresos, donaciones, ventas, cuentas y saldo a favor), ordenado por cuándo
    se registró.
19. `cambios_agenda`: diferencias entre la agenda de la familia y el ERP
    (sesiones dictadas sin registrar, fechas movidas, eventos borrados que ya
    estaban cobrados, personas que faltan en el ERP).
20. `sesiones_prepagadas_sin_usar`: sesiones coach pagadas que llevan mucho sin
    marcarse como dictadas; suele indicar que la sesión sí se dio y nunca se
    registró.

### Compatibilidad de búsqueda

18. `search`: búsqueda resumida y segura para clientes MCP, incluida la
    recuperación de conocimiento de ChatGPT.
19. `fetch`: obtiene un resultado seleccionado por su identificador seguro.

Cuando una consulta pueda superar el límite seguro de lectura, la respuesta
debe indicar si está completa o truncada. Si aparece como parcial, reduce el
rango, usa un filtro más específico o divide la pregunta; no uses un subtotal
parcial como si fuera el total definitivo.

## Las 30 operaciones de escritura

Todas pasan por borrador y confirmación. La columna de rol es **la misma que
en el ERP por navegador**: si mañana entra una cajera y se le da el MCP con su
usuario, no puede hacer más (ni menos) de lo que haría haciendo clic en la web.
Hay una prueba automática que lo comprueba (`roles-escritura.test.ts`).

| Operación | Rol | Riesgo |
|---|---|---|
| `preparar_registrar_pago` | admin, caja | crear |
| `preparar_cuenta` | admin, caja | crear |
| `preparar_persona` / `preparar_editar_persona` | admin, caja | crear / editar |
| `preparar_venta_externa` | admin, caja | crear |
| `preparar_donacion` | admin, caja | crear |
| `preparar_anticipo` | admin, caja | crear |
| `preparar_aplicar_saldo_favor` | admin, caja | editar |
| `preparar_sesion_coach` | admin, caja | crear |
| `preparar_egreso` | **solo admin** | crear |
| `preparar_editar_movimiento` / `preparar_editar_valor_cuenta` / `preparar_corregir_monto_pago` | solo admin | editar |
| `preparar_anular_movimiento` / `preparar_eliminar_movimiento` | solo admin | **destructiva** |
| `preparar_eliminar_cuenta` / `preparar_eliminar_persona` | solo admin | **destructiva** |
| `preparar_editar_sesion_coach` / `preparar_eliminar_sesion_coach` | solo admin | editar / **destructiva** |
| `preparar_revertir_abono` / `preparar_revertir_anticipo` | solo admin | **destructiva** |
| `preparar_pagar_deudas_con_saldo` | solo admin | editar |
| `preparar_estado_persona_activa` / `preparar_estado_socio_activo` | solo admin | **destructiva** |
| `preparar_socio` / `preparar_editar_socio` | solo admin | crear / editar |
| `preparar_periodo` / `preparar_fecha_fin_periodo` | solo admin | crear / editar |
| `preparar_adelanto_socio` | solo admin | crear |
| `preparar_cerrar_liquidacion` | solo admin | **destructiva** |
| `confirmar_operacion` / `cancelar_operacion` | según la operación | — |

Fuera del MCP a propósito: crear usuarios y cambiar contraseñas (implica
manejar credenciales), la migración de datos y la configuración de la empresa.

La lógica contable **no está duplicada**: vive en `src/lib/operaciones/` y la
usan tanto la web como el MCP, para que no puedan divergir.

## Conexión con la agenda

La agenda (`agenda-mentes-brillantes`) comparte los códigos de persona con el
ERP. La integración es asimétrica a propósito:

- **Del ERP a la agenda:** la agenda consulta y muestra la verdad contable
  (deuda, saldo a favor, estado del paquete coach). La lee en vivo; no la
  copia.
- **De la agenda al ERP:** solo avisa. La agenda reporta sus sesiones coach y
  el ERP calcula diferencias, pero **nada entra a la contabilidad sin
  aprobación**. Se revisan con `cambios_agenda` y llegan cada mañana por
  Telegram.

En fechas manda la agenda (es donde se reprograma); en dinero manda el ERP.

## Ejemplos de uso

- “Muéstrame el estado financiero de Sirley Urbano.”
- “¿Quiénes compraron el concepto Pasos?”
- “Resume ingresos, egresos y utilidad de mayo de 2026.”
- “Lista las sesiones coach de Daniel Alarcón con sus fechas.”
- “Busca información relacionada con el código MB-104.”

Para períodos importantes, es preferible indicar fechas completas, por ejemplo
`2026-05-01` a `2026-05-31`.

## Seguridad y privacidad

La autorización usa OAuth 2.1 con Authorization Code y PKCE S256. El recurso
autorizado corresponde a la dirección exacta del MCP. Los códigos son de un
solo uso, los tokens quedan vinculados al usuario y al cliente, y la renovación
vuelve a comprobar que el usuario siga activo y conserve un rol permitido.

El contrato de salida del MCP excluye:

- números de cédula;
- notas privadas de sesiones coach;
- notas internas u otros campos sensibles que no sean necesarios para responder.

Sí pueden enviarse al proveedor de IA los datos necesarios para la consulta,
como nombres, códigos internos, compras, pagos, saldos y fechas. Por ello:

- conecta solamente cuentas autorizadas;
- evita escribir cédulas u otros datos innecesarios en el mensaje;
- revisa la respuesta antes de copiarla o compartirla;
- aplica las políticas de privacidad de Mentes Brillantes y del proveedor de IA.

La auditoría técnica registra datos como usuario, rol, cliente, herramienta,
estado y duración de la llamada. No guarda los argumentos ni resultados de la
herramienta, cédulas, notas coach o el contenido completo de la conversación.

## Desconectar, cambiar de usuario o recuperar acceso

### Claude

Ve a **Settings > Connectors**, abre el menú del conector y selecciona
**Disconnect** o **Remove**. Para usar otra cuenta, desconecta primero, vuelve a
agregar o conectar el MCP y completa de nuevo el login del ERP.

### ChatGPT

Ve a **Settings > Apps**, abre `Mentes Brillantes ERP` y selecciona
**Disconnect**. Luego elige **Connect** para autorizar otra vez. Si la app fue
publicada en un espacio de trabajo, deshabilitarla para todos corresponde al
Owner/Admin; desconectar la cuenta individual no afecta a los demás usuarios.

Si el navegador reutiliza una sesión de Google o del ERP que no corresponde,
cierra esa sesión en el navegador antes de reconectar. No compartas perfiles de
navegador entre personas.

Para bloquear de inmediato a alguien que ya no debe consultar el ERP, cambia su
rol o desactiva su usuario en el ERP. Después, desconecta su app o conector en
la plataforma correspondiente.

## Activar Google una sola vez

Esta sección es para quien administra Google Cloud y Supabase. No es necesaria
si todos usarán la sesión activa o correo y contraseña del ERP. Mantén
`MCP_GOOGLE_AUTH_ENABLED=false` —o no definas la variable— hasta completar y
verificar toda la configuración del proveedor.

1. En Google Cloud, configura la pantalla de consentimiento y crea un cliente
   OAuth de tipo **Web application**.
2. Agrega como redirect URI autorizada la URL de callback que muestra Supabase,
   con el formato `https://<REFERENCIA>.supabase.co/auth/v1/callback`.
3. En **Supabase > Authentication > Providers > Google**, habilita el proveedor
   e introduce allí el Client ID y Client secret. No los copies en chats,
   documentos ni código fuente.
4. En **Supabase > Authentication > URL Configuration > Redirect URLs**,
   autoriza:

   ```text
   https://mentes-brillantes-erp.vercel.app/auth/callback
   https://mentes-brillantes-erp.vercel.app/api/mcp/oauth/google-callback
   ```

5. Confirma que cada correo de Google tenga un perfil del ERP con rol `admin`
   o `caja`.
6. Solo después de verificar los pasos anteriores, configura en el entorno de
   servidor del despliegue:

   ```text
   MCP_GOOGLE_AUTH_ENABLED=true
   ```

7. Vuelve a desplegar y confirma que el botón **Continuar con Google** aparezca
   y complete el flujo. Si la variable no es exactamente `true`, el botón sigue
   oculto y la ruta de inicio de Google permanece deshabilitada.

## Solución de problemas

### “No tengo permiso” o “rol no autorizado”

Revisa que el usuario exista, esté activo y que `perfiles.rol` sea exactamente
`admin` o `caja`. Una cuenta de Google con otro correo no hereda el permiso.

### ChatGPT no muestra “Create” o “Developer mode”

Comprueba el plan, que estés usando ChatGPT web, tu rol en el espacio de trabajo
y las políticas definidas por el administrador. La disponibilidad puede cambiar
con el despliegue gradual de la función.

### El conector aparece, pero no muestra herramientas

- En Claude, habilítalo desde **Search and tools**.
- En ChatGPT, vuelve a ejecutar **Scan tools** o solicita al administrador
  **Refresh** de las acciones y su publicación.
- Abre un chat nuevo después de actualizar la configuración.

ChatGPT puede conservar una versión aprobada de las herramientas. Cuando cambie
el servidor MCP, el administrador deberá revisar y actualizar esa versión.

### La URL da `401 Unauthorized` al abrirla en el navegador

Es normal antes de iniciar sesión: el endpoint está protegido por OAuth. Agrega
la URL desde Claude o ChatGPT para comenzar la autorización.

### El login termina en un error de recurso o redirección

Confirma que pegaste exactamente:

```text
https://mentes-brillantes-erp.vercel.app/api/mcp/mcp
```

No uses solo el dominio, una ruta antigua ni una barra final adicional. Si el
problema persiste, desconecta la integración y créala de nuevo.

### Google no permite entrar

Si el botón no aparece, confirma primero que el proveedor Google esté habilitado
en Supabase y que `MCP_GOOGLE_AUTH_ENABLED=true` esté configurado en el entorno
de servidor del despliegue. Si aparece pero el acceso falla, revisa que las
redirect URLs coincidan y que el correo tenga un perfil autorizado. Usa correo
y contraseña para distinguir un problema de Google de uno de permisos.

### No se reconoce la sesión activa del ERP

Comprueba que el ERP esté abierto y con la sesión iniciada en el mismo navegador
en el que se muestra la autorización. Regresa al flujo y presiona explícitamente
**Continuar con mi sesión activa del ERP**. Si la sesión expiró o pertenece a
otro perfil del navegador, inicia sesión de nuevo o usa correo y contraseña.

### Una fecha se interpreta mal o la respuesta es parcial

Usa fechas ISO (`YYYY-MM-DD`) o un mes con año explícito, por ejemplo
“mayo de 2026”. Si el resultado indica truncamiento, divide el período o usa un
filtro más concreto.

### La conexión expiró

Selecciona **Connect** otra vez y completa el flujo OAuth. Nunca envíes el token
o una captura que lo muestre a soporte.

Al reportar un problema, incluye plataforma, fecha y hora aproximada, nombre de
la herramienta y texto del error. No incluyas contraseñas, tokens, cookies,
códigos de recuperación ni secretos.

## Lista de comprobación antes de habilitar usuarios

- La dirección del conector coincide exactamente con la indicada en esta guía.
- Cada persona tiene su propio usuario activo y rol `admin` o `caja`.
- El administrador revisó que las 19 herramientas sean de lectura.
- `search` y `fetch` aparecen durante el escaneo de ChatGPT.
- El botón **Continuar con mi sesión activa del ERP** solo reutiliza la sesión
  después del consentimiento explícito y rechaza sesiones vencidas o sin rol.
- El login por correo y contraseña funciona como alternativa.
- Google permanece oculto con la configuración predeterminada; si se habilitó,
  el proveedor de Supabase está activo y `MCP_GOOGLE_AUTH_ENABLED=true`.
- Una cuenta sin rol permitido recibe acceso denegado.
- Las respuestas no muestran cédulas ni notas privadas del coach.
- Desconectar y volver a conectar solicita una autorización válida.
- Los resultados grandes indican claramente si son completos o parciales.

Completa esta lista después de cada despliegue relevante antes de ampliar el
acceso a más usuarios.
