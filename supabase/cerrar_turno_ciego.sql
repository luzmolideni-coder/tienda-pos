-- Corte ciego: la cajera solo envía el efectivo contado; esperado, diferencia y
-- depósito se calculan aquí y nunca viajan al navegador.
-- Ejecutar en Supabase → SQL Editor.

create or replace function public.cerrar_turno_ciego(p_turno_id uuid, p_efectivo_contado numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno       turnos%rowtype;
  v_cierre      timestamptz := now();
  v_contado     numeric := round(p_efectivo_contado, 2);
  v_efectivo    numeric;
  v_tarjeta     numeric;
  v_transfer    numeric;
  v_entradas    numeric;
  v_salidas     numeric;
  v_esperado    numeric;
begin
  if v_contado is null or v_contado < 0 then
    raise exception 'El efectivo contado no es válido';
  end if;

  -- Bloquea el turno para que dos tablets no lo cierren a la vez.
  select * into v_turno from turnos where id = p_turno_id and estado = 'ABIERTO' for update;
  if not found then
    raise exception 'El turno no existe o ya está cerrado';
  end if;

  select
    coalesce(sum(v.total) filter (where lower(v.metodo_pago) = 'efectivo'), 0),
    coalesce(sum(v.total) filter (where lower(v.metodo_pago) = 'tarjeta'), 0),
    coalesce(sum(v.total) filter (where lower(v.metodo_pago) = 'transferencia'), 0)
  into v_efectivo, v_tarjeta, v_transfer
  from ventas v
  where v.turno_id = p_turno_id;

  select
    coalesce(sum(m.monto) filter (where upper(m.tipo) = 'ENTRADA'), 0),
    coalesce(sum(m.monto) filter (where upper(m.tipo) in ('PAGO_PROVEEDOR', 'GASTO')), 0)
  into v_entradas, v_salidas
  from movimientos_caja m
  where m.turno_id = p_turno_id;

  v_esperado := round(v_turno.fondo_inicial + v_efectivo + v_entradas - v_salidas, 2);

  update turnos set
    estado               = 'CERRADO',
    fecha_cierre         = v_cierre,
    ventas_efectivo      = v_efectivo,
    ventas_tarjeta       = v_tarjeta,
    ventas_transferencia = v_transfer,
    efectivo_esperado    = v_esperado,
    efectivo_contado     = v_contado,
    diferencia           = round(v_contado - v_esperado, 2),
    deposito_caja_fuerte = greatest(0, round(v_contado - v_turno.fondo_inicial, 2))
  where id = p_turno_id;

  -- Solo lo que la cajera puede ver.
  return json_build_object('efectivo_contado', v_contado, 'fecha_cierre', v_cierre);
end;
$$;

revoke all on function public.cerrar_turno_ciego(uuid, numeric) from public;
grant execute on function public.cerrar_turno_ciego(uuid, numeric) to anon, authenticated;
