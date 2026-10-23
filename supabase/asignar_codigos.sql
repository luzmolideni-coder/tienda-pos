-- =====================================================================================
-- Tienda POS · Asignar el código de barras real a productos con código provisional
-- Ejecutar completo en Supabase → SQL Editor DESPUÉS de seguridad.sql. Es idempotente.
--
-- Muchos productos se dieron de alta con códigos inventados (el sistema anterior exigía
-- uno). Durante el inventario, cuando se escanea el código real, pos_asignar_codigo lo
-- guarda en el producto:
--   · Solo acepta códigos EAN/UPC válidos (dígito verificador correcto).
--   · No permite un código que ya tenga otro producto (sin contar ceros a la izquierda).
--   · Si el producto ya tenía un código real distinto, solo ADMIN puede cambiarlo.
--   · Cada cambio queda en cambios_codigo_barras (quién, cuándo, antes y después).
-- =====================================================================================

begin;

-- EAN-8, UPC-A (12), EAN-13 y GTIN-14 con su dígito verificador.
create or replace function public.es_codigo_real(p_codigo text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_suma int := 0;
  v_digitos int[];
  i int;
  n int;
begin
  if p_codigo is null or p_codigo !~ '^[0-9]+$' or length(p_codigo) not in (8, 12, 13, 14) then
    return false;
  end if;
  n := length(p_codigo);
  -- Del penúltimo hacia la izquierda, los pesos se alternan 3, 1, 3, 1…
  for i in 1 .. n - 1 loop
    v_suma := v_suma + substr(p_codigo, n - i, 1)::int * (case when i % 2 = 1 then 3 else 1 end);
  end loop;
  return (10 - v_suma % 10) % 10 = substr(p_codigo, n, 1)::int;
end;
$$;

create table if not exists public.cambios_codigo_barras (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid not null references public.productos (id),
  usuario_id      uuid not null references public.usuarios (id),
  codigo_anterior text,
  codigo_nuevo    text not null,
  creado_en       timestamptz not null default now()
);

alter table public.cambios_codigo_barras enable row level security;
revoke all on table public.cambios_codigo_barras from anon, authenticated;

create or replace function public.pos_asignar_codigo(p_token uuid, p_producto_id uuid, p_codigo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  u          public.usuarios;
  v_codigo   text := btrim(p_codigo);
  v_anterior text;
  v_otro     text;
  v_guardado text;
begin
  select * into u from _pos_usuario(p_token);

  if not es_codigo_real(v_codigo) then
    raise exception 'El código % no es un código de barras válido', coalesce(v_codigo, '');
  end if;

  select codigo_barras into v_anterior from productos where id = p_producto_id for update;
  if not found then
    raise exception 'El producto no existe';
  end if;

  select nombre into v_otro
  from productos
  where id <> p_producto_id and ltrim(codigo_barras, '0') = ltrim(v_codigo, '0')
  limit 1;
  if v_otro is not null then
    raise exception 'Ese código ya es de "%"', v_otro;
  end if;

  if es_codigo_real(v_anterior) and ltrim(v_anterior, '0') <> ltrim(v_codigo, '0')
     and upper(u.rol::text) <> 'ADMIN' then
    raise exception 'Este producto ya tiene un código real (%). Solo Dirección puede cambiarlo', v_anterior;
  end if;

  -- El mismo código con o sin ceros a la izquierda (12 vs 13 dígitos) no es un cambio.
  if ltrim(coalesce(v_anterior, ''), '0') <> ltrim(v_codigo, '0') then
    update productos set codigo_barras = v_codigo where id = p_producto_id;
    insert into cambios_codigo_barras (producto_id, usuario_id, codigo_anterior, codigo_nuevo)
    values (p_producto_id, u.id, v_anterior, v_codigo);
    v_guardado := v_codigo;
  else
    v_guardado := v_anterior;
  end if;

  return json_build_object('producto_id', p_producto_id, 'codigo_anterior', v_anterior, 'codigo_nuevo', v_guardado);
end;
$$;

revoke all on function public.pos_asignar_codigo(uuid, uuid, text) from public;
grant execute on function public.pos_asignar_codigo(uuid, uuid, text) to anon, authenticated;

commit;
