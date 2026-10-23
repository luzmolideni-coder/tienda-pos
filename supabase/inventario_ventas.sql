-- =====================================================================================
-- Tienda POS · Descontar inventario con cada venta
-- Ejecutar completo en Supabase → SQL Editor. Es idempotente: se puede volver a correr.
--
-- registrar_venta guarda la venta y sus partidas pero no toca inventario_tienda, así que
-- las existencias solo subían con las compras. Este trigger en venta_items:
--   · Al insertar una partida, resta su cantidad del inventario de la tienda de la venta.
--   · Al borrar una partida (p. ej. una venta anulada), devuelve la cantidad.
-- Funciona sin importar qué función registró la venta.
--
-- Una venta nunca se bloquea por inventario: si el sistema dice que hay menos de lo que
-- se vende (porque no se capturó una compra o no hay renglón), la existencia queda en 0.
-- Si el producto no tenía renglón en inventario_tienda, se crea en 0.
-- Las ventas anteriores a este script NO se descuentan: conviene hacer un conteo físico
-- y ajustar stock_actual a mano después de ejecutarlo.
-- =====================================================================================

begin;

-- Si ya existe otro trigger en venta_items que mueva inventario, se detiene para no
-- descontar dos veces.
do $$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.venta_items'::regclass
      and not t.tgisinternal
      and t.tgname <> 'trg_venta_items_inventario'
      and position('inventario_tienda' in pg_get_functiondef(p.oid)) > 0
  ) then
    raise exception 'Ya hay otro trigger en venta_items que modifica inventario_tienda; revisarlo antes de continuar';
  end if;
end;
$$;

create or replace function public._venta_items_inventario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partida venta_items;
  v_tienda  uuid;
  v_delta   numeric;
begin
  if tg_op = 'INSERT' then
    v_partida := new;
    v_delta := -coalesce(new.cantidad, 0);
  else
    v_partida := old;
    v_delta := coalesce(old.cantidad, 0);
  end if;

  if v_partida.producto_id is null or v_delta = 0 then
    return null;
  end if;

  select tienda_id into v_tienda from ventas where id = v_partida.venta_id;
  if v_tienda is null then
    return null;  -- venta sin tienda (o ya borrada en cascada): nada que mover
  end if;

  update inventario_tienda
  set stock_actual = greatest(0, coalesce(stock_actual, 0) + v_delta)
  where tienda_id = v_tienda and producto_id = v_partida.producto_id;

  if not found then
    insert into inventario_tienda (id, tienda_id, producto_id, stock_actual)
    values (gen_random_uuid(), v_tienda, v_partida.producto_id, greatest(0, v_delta));
  end if;

  return null;
end;
$$;

revoke all on function public._venta_items_inventario() from public, anon, authenticated;

drop trigger if exists trg_venta_items_inventario on public.venta_items;
create trigger trg_venta_items_inventario
after insert or delete on public.venta_items
for each row execute function public._venta_items_inventario();

commit;
