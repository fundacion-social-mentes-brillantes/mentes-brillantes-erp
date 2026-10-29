-- El conector MCP escribe con la llave de servicio (ya revisó que quien pide
-- es admin), así que fn_crear_medio_pago también la acepta, igual que las
-- otras funciones de administración (ver 20260514202502_harden_rls_rpc_public_repo).
-- El resto de la función no cambia.

create or replace function public.fn_crear_medio_pago(p_nombre text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_base text;
  v_clave text;
  v_n integer := 1;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.mb_is_admin() then
    raise exception 'Solo un administrador puede agregar cuentas.';
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 60 then
    raise exception 'Escribe el nombre de la cuenta (de 2 a 60 letras).';
  end if;
  if exists (select 1 from public.medios_pago where lower(btrim(nombre)) = lower(v_nombre)) then
    raise exception 'Ya hay una cuenta que se llama así.';
  end if;

  v_base := btrim(regexp_replace(translate(lower(v_nombre), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '_', 'g'), '_');
  if length(v_base) < 2 then
    v_base := 'cuenta';
  end if;
  v_base := left(v_base, 50);
  v_clave := v_base;
  while v_clave = 'saldo_a_favor' or exists (select 1 from public.medios_pago where clave = v_clave) loop
    v_n := v_n + 1;
    v_clave := v_base || '_' || v_n;
  end loop;

  execute format('alter type public.metodo_pago add value if not exists %L', v_clave);
  insert into public.medios_pago (clave, nombre, activo, orden)
  values (v_clave, v_nombre, true, coalesce((select max(orden) from public.medios_pago where clave <> 'otro'), 0) + 10);
  return v_clave;
end;
$$;
revoke all on function public.fn_crear_medio_pago(text) from public, anon;
grant execute on function public.fn_crear_medio_pago(text) to authenticated, service_role;
