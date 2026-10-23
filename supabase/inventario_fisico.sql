-- =====================================================================================
-- Tienda POS · Inventario físico (conteo)
-- Ejecutar completo en Supabase → SQL Editor DESPUÉS de seguridad.sql. Es idempotente.
--
-- · pos_ajustar_inventario: fija stock_actual con lo contado físicamente, en la tienda
--   del usuario de la sesión (token), y deja registro en ajustes_inventario.
--   A OPERACION solo le confirma lo que capturó (conteo ciego); a ADMIN le devuelve
--   también la existencia anterior y la diferencia.
-- · La clave pública deja de poder modificar inventario_tienda directamente: solo cambia
--   por compras, ventas (trigger) o este conteo. Sigue siendo legible.
-- =====================================================================================

begin;

create table if not exists public.ajustes_inventario (
  id             uuid primary key default gen_random_uuid(),
  tienda_id      uuid not null references public.tiendas (id),
  producto_id    uuid not null references public.productos (id),
  usuario_id     uuid not null references public.usuarios (id),
  stock_anterior numeric,
  stock_contado  numeric not null,
  diferencia     numeric,
  motivo         text not null default 'CONTEO_FISICO',
  creado_en      timestamptz not null default now()
);

alter table public.ajustes_inventario enable row level security;
revoke all on table public.ajustes_inventario from anon, authenticated;

create or replace function public.pos_ajustar_inventario(p_token uuid, p_producto_id uuid, p_cantidad_contada numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  u          public.usuarios;
  v_contado  numeric := p_cantidad_contada;
  v_anterior numeric;
  v_existe   boolean;
begin
  select * into u from _pos_usuario(p_token);
  if u.tienda_id is null then
    raise exception 'Tu usuario no tiene tienda asignada';
  end if;
  if v_contado is null or v_contado < 0 then
    raise exception 'La cantidad contada no es válida';
  end if;
  if not exists (select 1 from productos where id = p_producto_id) then
    raise exception 'El producto no existe';
  end if;

  -- Bloquea el renglón para que una venta simultánea no se pierda entre la lectura y el ajuste.
  select stock_actual, true into v_anterior, v_existe
  from inventario_tienda
  where tienda_id = u.tienda_id and producto_id = p_producto_id
  for update;

  if coalesce(v_existe, false) then
    update inventario_tienda set stock_actual = v_contado
    where tienda_id = u.tienda_id and producto_id = p_producto_id;
  else
    insert into inventario_tienda (id, tienda_id, producto_id, stock_actual)
    values (gen_random_uuid(), u.tienda_id, p_producto_id, v_contado);
  end if;

  insert into ajustes_inventario (tienda_id, producto_id, usuario_id, stock_anterior, stock_contado, diferencia)
  values (u.tienda_id, p_producto_id, u.id, v_anterior, v_contado, v_contado - coalesce(v_anterior, 0));

  if upper(u.rol::text) = 'ADMIN' then
    return json_build_object(
      'producto_id', p_producto_id, 'stock_contado', v_contado,
      'stock_anterior', v_anterior, 'diferencia', v_contado - coalesce(v_anterior, 0)
    );
  end if;
  return json_build_object('producto_id', p_producto_id, 'stock_contado', v_contado);
end;
$$;

revoke all on function public.pos_ajustar_inventario(uuid, uuid, numeric) from public;
grant execute on function public.pos_ajustar_inventario(uuid, uuid, numeric) to anon, authenticated;

-- inventario_tienda: solo lectura para la clave pública.
alter table public.inventario_tienda enable row level security;
revoke insert, update, delete, truncate on table public.inventario_tienda from anon, authenticated;
grant select on table public.inventario_tienda to anon, authenticated;
do $$
begin
  -- Con RLS activo, la lectura necesita una política; se crea solo si no hay ninguna de SELECT.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inventario_tienda' and cmd in ('SELECT', 'ALL')
  ) then
    create policy inventario_tienda_lectura on public.inventario_tienda for select to anon, authenticated using (true);
  end if;
end;
$$;

commit;
