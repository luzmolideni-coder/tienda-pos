-- =====================================================================================
-- Tienda POS · Blindaje de seguridad
-- Ejecutar completo en Supabase → SQL Editor. Es idempotente: se puede volver a correr.
--
-- Problema que resuelve: la app usa la clave pública (anon) sin Supabase Auth, así que la
-- base no sabe quién llama y el "rol" solo existía en el navegador. Desde ahora:
--   1. El login con PIN emite un token de sesión guardado en la base (sesiones_pos).
--   2. Las tablas sensibles dejan de ser legibles/escribibles con la clave pública.
--   3. Todo pasa por funciones SECURITY DEFINER que validan el token y leen el rol de
--      usuarios en el servidor; las de Dirección exigen ADMIN. Las funciones que ya existían
--      (registrar_venta, crear_pedido, …) solo se llaman a través de envoltorios con token.
--   4. El login limita intentos fallidos para que no se puedan probar los 10,000 PINs.
--
-- Después de ejecutarlo, recarga la app: todos tendrán que volver a entrar con su PIN.
-- =====================================================================================

begin;

-- ---------------------------------------------------------------- 1. Sesiones y login

create table if not exists public.sesiones_pos (
  token      uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  creada_en  timestamptz not null default now(),
  expira_en  timestamptz not null default now() + interval '18 hours'
);

create table if not exists public.intentos_login (
  id        bigserial primary key,
  creado_en timestamptz not null default now(),
  exitoso   boolean not null
);

alter table public.sesiones_pos enable row level security;
alter table public.intentos_login enable row level security;
revoke all on table public.sesiones_pos, public.intentos_login from anon, authenticated;
revoke all on sequence public.intentos_login_id_seq from anon, authenticated;

-- Usuario dueño del token. Lanza SESION_INVALIDA si no existe o expiró, y SOLO_ADMIN si se pide ADMIN.
create or replace function public._pos_usuario(p_token uuid, p_solo_admin boolean default false)
returns public.usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.usuarios;
begin
  select u.* into v
  from sesiones_pos s
  join usuarios u on u.id = s.usuario_id
  where s.token = p_token
    and s.expira_en > now()
    and coalesce(u.activo, true);
  if not found then
    raise exception 'SESION_INVALIDA';
  end if;
  if p_solo_admin and upper(v.rol) <> 'ADMIN' then
    raise exception 'SOLO_ADMIN';
  end if;
  return v;
end;
$$;

create or replace function public.iniciar_sesion_pos(p_pin text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v       public.usuarios;
  v_token uuid;
begin
  -- Freno global: más de 20 PIN incorrectos en 5 minutos bloquea el login unos minutos.
  if (select count(*) from intentos_login where not exitoso and creado_en > now() - interval '5 minutes') >= 20 then
    raise exception 'DEMASIADOS_INTENTOS';
  end if;

  select * into v from usuarios where pin::text = p_pin and coalesce(activo, true) limit 1;
  if not found then
    insert into intentos_login (exitoso) values (false);
    return null;
  end if;

  insert into intentos_login (exitoso) values (true);
  delete from intentos_login where creado_en < now() - interval '1 day';
  delete from sesiones_pos where expira_en < now();
  insert into sesiones_pos (usuario_id) values (v.id) returning token into v_token;

  return json_build_object('id', v.id, 'nombre', v.nombre, 'rol', v.rol, 'tienda_id', v.tienda_id, 'token', v_token);
end;
$$;

create or replace function public.cerrar_sesion_pos(p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from sesiones_pos where token = p_token;
$$;

-- ---------------------------------------------------------------- 2. Turnos y caja (POS)

create or replace function public._turno_json(t public.turnos)
returns json
language sql
immutable
as $$
  select json_build_object(
    'id', t.id, 'usuario_id', t.usuario_id, 'tienda_id', t.tienda_id,
    'fondo_inicial', t.fondo_inicial, 'fecha_apertura', t.fecha_apertura
  );
$$;

-- Turno ABIERTO del usuario o de su tienda (prefiere el propio y el más reciente). null si no hay.
create or replace function public.pos_turno_abierto(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.usuarios;
  t public.turnos;
begin
  select * into u from _pos_usuario(p_token);
  select * into t
  from turnos
  where estado = 'ABIERTO'
    and (usuario_id = u.id or (u.tienda_id is not null and tienda_id = u.tienda_id))
  order by (usuario_id = u.id) desc, fecha_apertura desc
  limit 1;
  if not found then
    return null;
  end if;
  return _turno_json(t);
end;
$$;

-- Abre turno; si ya hay uno abierto para el usuario o su tienda, devuelve ese (evita duplicados).
create or replace function public.pos_abrir_turno(p_token uuid, p_fondo_inicial numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  u        public.usuarios;
  t        public.turnos;
  v_previo json;
begin
  select * into u from _pos_usuario(p_token);
  if p_fondo_inicial is null or p_fondo_inicial < 0 then
    raise exception 'El fondo inicial no es válido';
  end if;
  v_previo := pos_turno_abierto(p_token);
  if v_previo is not null then
    return v_previo;
  end if;
  insert into turnos (id, tienda_id, usuario_id, estado, fondo_inicial, fecha_apertura)
  values (gen_random_uuid(), u.tienda_id, u.id, 'ABIERTO', round(p_fondo_inicial, 2), now())
  returning * into t;
  return _turno_json(t);
end;
$$;

create or replace function public.pos_registrar_movimiento(
  p_token uuid, p_turno_id uuid, p_tipo text, p_monto numeric, p_concepto text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.usuarios;
begin
  select * into u from _pos_usuario(p_token);
  if upper(p_tipo) not in ('ENTRADA', 'PAGO_PROVEEDOR', 'GASTO') then
    raise exception 'Tipo de movimiento no válido';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;
  if not exists (
    select 1 from turnos
    where id = p_turno_id and estado = 'ABIERTO'
      and (usuario_id = u.id or tienda_id = u.tienda_id or upper(u.rol) = 'ADMIN')
  ) then
    raise exception 'El turno no está abierto';
  end if;
  insert into movimientos_caja (id, turno_id, usuario_id, tipo, monto, concepto)
  values (gen_random_uuid(), p_turno_id, u.id, upper(p_tipo), round(p_monto, 2), left(coalesce(p_concepto, ''), 200));
end;
$$;

-- Cifras de efectivo de un turno (uso interno).
create or replace function public._cifras_turno(p_turno_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fondo numeric;
  v_ef numeric; v_tar numeric; v_tra numeric; v_num int;
  v_ent numeric; v_pag numeric; v_gas numeric;
begin
  select fondo_inicial into v_fondo from turnos where id = p_turno_id;
  select
    coalesce(sum(total) filter (where lower(metodo_pago) = 'efectivo'), 0),
    coalesce(sum(total) filter (where lower(metodo_pago) = 'tarjeta'), 0),
    coalesce(sum(total) filter (where lower(metodo_pago) = 'transferencia'), 0),
    count(*)
  into v_ef, v_tar, v_tra, v_num
  from ventas where turno_id = p_turno_id;
  select
    coalesce(sum(monto) filter (where upper(tipo) = 'ENTRADA'), 0),
    coalesce(sum(monto) filter (where upper(tipo) = 'PAGO_PROVEEDOR'), 0),
    coalesce(sum(monto) filter (where upper(tipo) = 'GASTO'), 0)
  into v_ent, v_pag, v_gas
  from movimientos_caja where turno_id = p_turno_id;

  return json_build_object(
    'fondo_inicial', v_fondo, 'num_ventas', v_num,
    'ventas_efectivo', v_ef, 'ventas_tarjeta', v_tar, 'ventas_transferencia', v_tra,
    'entradas', v_ent, 'pagos_proveedores', v_pag, 'gastos', v_gas,
    'efectivo_esperado', round(v_fondo + v_ef + v_ent - v_pag - v_gas, 2)
  );
end;
$$;

-- Cifras en vivo para el corte completo: solo ADMIN (el resto hace corte ciego).
create or replace function public.pos_cifras_turno(p_token uuid, p_turno_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _pos_usuario(p_token, true);
  return _cifras_turno(p_turno_id);
end;
$$;

-- Cierra el turno calculando todo en la base. ADMIN recibe las cifras completas; los demás
-- (corte ciego) solo el efectivo que reportaron y la hora de cierre.
create or replace function public.pos_cerrar_turno(p_token uuid, p_turno_id uuid, p_efectivo_contado numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  u         public.usuarios;
  t         public.turnos;
  c         json;
  v_contado numeric := round(p_efectivo_contado, 2);
  v_cierre  timestamptz := now();
  v_esp     numeric;
  v_dif     numeric;
  v_dep     numeric;
begin
  select * into u from _pos_usuario(p_token);
  if v_contado is null or v_contado < 0 then
    raise exception 'El efectivo contado no es válido';
  end if;

  -- Bloquea el turno para que dos tablets no lo cierren a la vez.
  select * into t from turnos where id = p_turno_id and estado = 'ABIERTO' for update;
  if not found then
    raise exception 'El turno no existe o ya está cerrado';
  end if;
  if t.usuario_id <> u.id and t.tienda_id is distinct from u.tienda_id and upper(u.rol) <> 'ADMIN' then
    raise exception 'No puedes cerrar el turno de otra tienda';
  end if;

  c := _cifras_turno(p_turno_id);
  v_esp := (c ->> 'efectivo_esperado')::numeric;
  v_dif := round(v_contado - v_esp, 2);
  v_dep := greatest(0, round(v_contado - t.fondo_inicial, 2));

  update turnos set
    estado               = 'CERRADO',
    fecha_cierre         = v_cierre,
    ventas_efectivo      = (c ->> 'ventas_efectivo')::numeric,
    ventas_tarjeta       = (c ->> 'ventas_tarjeta')::numeric,
    ventas_transferencia = (c ->> 'ventas_transferencia')::numeric,
    efectivo_esperado    = v_esp,
    efectivo_contado     = v_contado,
    diferencia           = v_dif,
    deposito_caja_fuerte = v_dep
  where id = p_turno_id;

  if upper(u.rol) = 'ADMIN' then
    return (c::jsonb || jsonb_build_object(
      'efectivo_contado', v_contado, 'diferencia', v_dif, 'deposito', v_dep, 'fecha_cierre', v_cierre
    ))::json;
  end if;
  return json_build_object('efectivo_contado', v_contado, 'fecha_cierre', v_cierre);
end;
$$;

-- ---------------------------------------------------------------- 3. Pedidos (Dirección)

create or replace function public.pos_rechazar_pedido(p_token uuid, p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _pos_usuario(p_token, true);
  update pedidos set estado = 'RECHAZADO' where id = p_pedido_id and estado = 'SOLICITADO';
  if not found then
    raise exception 'El pedido ya no está SOLICITADO';
  end if;
end;
$$;

-- ---------------------------------------------------------------- 4. Panel de Dirección (solo ADMIN)

-- Totales del periodo; la app calcula utilidad, margen y ticket promedio a partir de ellos.
create or replace function public.panel_kpis(p_token uuid, p_tienda_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r json;
begin
  perform _pos_usuario(p_token, true);

  with v as (
    select id, total, lower(metodo_pago) as metodo
    from ventas
    where created_at >= p_desde and created_at < p_hasta
      and (p_tienda_id is null or tienda_id = p_tienda_id)
  ),
  mv as (
    select upper(m.tipo) as tipo, m.monto
    from movimientos_caja m
    join turnos t on t.id = m.turno_id
    where m.created_at >= p_desde and m.created_at < p_hasta
      and (p_tienda_id is null or t.tienda_id = p_tienda_id)
  )
  select json_build_object(
    'ventas_totales',    coalesce((select sum(total) from v), 0),
    'num_ventas',        (select count(*) from v),
    'costo_vendido',     coalesce((select sum(vi.cantidad * coalesce(vi.costo_unitario_historico, 0))
                                   from venta_items vi join v on v.id = vi.venta_id), 0),
    'efectivo',          coalesce((select sum(total) from v where metodo = 'efectivo'), 0),
    'tarjeta',           coalesce((select sum(total) from v where metodo = 'tarjeta'), 0),
    'transferencia',     coalesce((select sum(total) from v where metodo = 'transferencia'), 0),
    'entradas',          coalesce((select sum(monto) from mv where tipo = 'ENTRADA'), 0),
    'pagos_proveedores', coalesce((select sum(monto) from mv where tipo = 'PAGO_PROVEEDOR'), 0),
    'gastos',            coalesce((select sum(monto) from mv where tipo = 'GASTO'), 0)
  ) into r;
  return r;
end;
$$;

-- Existencias por tienda × producto activo. Sin renglón en inventario_tienda cuenta como 0.
-- Usa stock_minimo si la columna existe; si no, stock_objetivo.
create or replace function public.panel_inventario(p_token uuid, p_tienda_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r json;
begin
  perform _pos_usuario(p_token, true);
  select coalesce(json_agg(fila order by fila.tienda_nombre, fila.producto_nombre), '[]'::json) into r
  from (
    select
      ti.id as tienda_id,
      ti.nombre as tienda_nombre,
      p.id as producto_id,
      p.nombre as producto_nombre,
      coalesce(it.stock_actual, 0) as stock_actual,
      coalesce((to_jsonb(it) ->> 'stock_minimo')::numeric, (to_jsonb(it) ->> 'stock_objetivo')::numeric, 0) as stock_minimo,
      it.id is not null as registrado
    from tiendas ti
    cross join productos p
    left join inventario_tienda it on it.tienda_id = ti.id and it.producto_id = p.id
    where p.activo and (p_tienda_id is null or ti.id = p_tienda_id)
  ) fila;
  return r;
end;
$$;

-- Turnos cerrados del periodo con el nombre del cajero (solo el nombre, nada más de usuarios).
create or replace function public.panel_cortes(p_token uuid, p_tienda_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r json;
begin
  perform _pos_usuario(p_token, true);
  select coalesce(json_agg(c order by c.fecha_cierre desc), '[]'::json) into r
  from (
    select
      t.id, t.usuario_id, u.nombre as usuario_nombre, ti.nombre as tienda_nombre,
      t.fecha_apertura, t.fecha_cierre, t.fondo_inicial,
      t.ventas_efectivo, t.ventas_tarjeta, t.ventas_transferencia,
      t.efectivo_esperado, t.efectivo_contado, t.diferencia, t.deposito_caja_fuerte
    from turnos t
    left join usuarios u on u.id = t.usuario_id
    left join tiendas ti on ti.id = t.tienda_id
    where t.estado = 'CERRADO'
      and t.fecha_cierre >= p_desde and t.fecha_cierre < p_hasta
      and (p_tienda_id is null or t.tienda_id = p_tienda_id)
  ) c;
  return r;
end;
$$;

-- ---------------------------------------------------------------- 5. Envoltorios con token para funciones existentes
-- registrar_venta, procesar_recepcion_compra, crear_pedido y aprobar_pedido se podían llamar sin
-- sesión y con cualquier usuario_id. Estos envoltorios validan el token, toman usuario y tienda de
-- la sesión y llaman a las originales, que dejan de ser públicas.
-- La llamada se arma con literales (%L) para que Postgres resuelva solo los tipos de cada
-- parámetro (uuid, numeric, text, json/jsonb) sin depender de cómo se declararon.

create or replace function public.pos_registrar_venta(
  p_token uuid, p_turno_id uuid, p_total numeric, p_paga_con numeric, p_cambio numeric, p_metodo_pago text, p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.usuarios;
begin
  select * into u from _pos_usuario(p_token);
  if not exists (
    select 1 from turnos
    where id = p_turno_id and estado = 'ABIERTO' and (usuario_id = u.id or tienda_id = u.tienda_id)
  ) then
    raise exception 'El turno no está abierto';
  end if;
  execute format(
    'select registrar_venta(p_tienda_id => %L, p_usuario_id => %L, p_turno_id => %L, p_total => %L, '
    'p_paga_con => %L, p_cambio => %L, p_metodo_pago => %L, p_items => %L)',
    u.tienda_id, u.id, p_turno_id, p_total, p_paga_con, p_cambio, p_metodo_pago, p_items
  );
end;
$$;

create or replace function public.pos_procesar_recepcion(
  p_token uuid, p_proveedor_id uuid, p_pedido_id uuid, p_total_ticket numeric, p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.usuarios;
begin
  select * into u from _pos_usuario(p_token);
  execute format(
    'select procesar_recepcion_compra(p_tienda_id => %L, p_usuario_id => %L, p_proveedor_id => %L, '
    'p_pedido_id => %L, p_total_ticket => %L, p_items => %L)',
    u.tienda_id, u.id, p_proveedor_id, p_pedido_id, p_total_ticket, p_items
  );
end;
$$;

create or replace function public.pos_crear_pedido(p_token uuid, p_proveedor_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.usuarios;
begin
  select * into u from _pos_usuario(p_token);
  execute format(
    'select crear_pedido(p_tienda_id => %L, p_proveedor_id => %L, p_solicitado_por => %L, p_items => %L)',
    u.tienda_id, p_proveedor_id, u.id, p_items
  );
end;
$$;

create or replace function public.pos_aprobar_pedido(p_token uuid, p_pedido_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.usuarios;
begin
  select * into u from _pos_usuario(p_token, true);
  execute format(
    'select aprobar_pedido(p_pedido_id => %L, p_aprobado_por => %L, p_items => %L)',
    p_pedido_id, u.id, p_items
  );
end;
$$;

-- ---------------------------------------------------------------- 6. Cerrar tablas sensibles

do $$
declare
  t text;
begin
  foreach t in array array['ventas', 'venta_items', 'turnos', 'movimientos_caja', 'historial_costos', 'usuarios'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- 7. Permisos de ejecución

-- Internas: nadie las llama desde fuera.
revoke all on function public._pos_usuario(uuid, boolean) from public, anon, authenticated;
revoke all on function public._turno_json(public.turnos) from public, anon, authenticated;
revoke all on function public._cifras_turno(uuid) from public, anon, authenticated;

-- Originales sin token: solo se llaman desde los envoltorios (que corren como dueño).
-- login_con_pin y cerrar_turno_ciego quedan reemplazadas por iniciar_sesion_pos y pos_cerrar_turno.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('login_con_pin', 'cerrar_turno_ciego', 'registrar_venta', 'procesar_recepcion_compra',
                        'crear_pedido', 'aprobar_pedido')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- Públicas para la app (cada una valida el token por dentro).
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('iniciar_sesion_pos', 'cerrar_sesion_pos', 'pos_turno_abierto', 'pos_abrir_turno',
                        'pos_registrar_movimiento', 'pos_cifras_turno', 'pos_cerrar_turno', 'pos_rechazar_pedido',
                        'pos_registrar_venta', 'pos_procesar_recepcion', 'pos_crear_pedido', 'pos_aprobar_pedido',
                        'panel_kpis', 'panel_inventario', 'panel_cortes')
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end;
$$;

commit;
