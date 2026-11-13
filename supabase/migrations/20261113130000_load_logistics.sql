begin;

alter table public.loads
  add column driver_id uuid references public.profiles(id) on delete set null,
  add column driver_name_snapshot text,
  add column layout_3d jsonb,
  add column volume_fill_ratio numeric check (volume_fill_ratio between 0 and 1);

create index loads_driver_idx on public.loads (driver_id, status, planned_date) where driver_id is not null;

create table public.load_destinations (
  load_id uuid not null references public.loads(id) on delete cascade,
  stop_order integer not null check (stop_order between 1 and 99),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  address text,
  delivered_at timestamptz,
  delivered_by uuid references auth.users(id) on delete set null,
  receiver_name text,
  signature_png text,
  photo_jpeg text,
  primary key (load_id, stop_order)
);

alter table public.load_destinations enable row level security;
revoke all on table public.load_destinations from public, anon, authenticated;

-- Mantém a validação transacional de saldo, peso e situação já usada pelo Comercial.
alter function public.save_load(uuid, jsonb, jsonb) rename to save_load_core;
revoke all on function public.save_load_core(uuid, jsonb, jsonb) from public, anon, authenticated;

create function public.save_load(p_load_id uuid, p_load jsonb, p_items jsonb)
returns table (id uuid, load_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved record;
  v_vehicle public.vehicles%rowtype;
  v_driver public.profiles%rowtype;
  v_driver_id uuid := nullif(p_load->>'driver_id', '')::uuid;
  v_layout jsonb := p_load->'layout_3d';
  v_position jsonb;
  v_existing_layout jsonb;
  v_volume numeric := 0;
  v_length numeric;
  v_width numeric;
  v_height numeric;
  v_utilization numeric;
  v_box record;
  v_order record;
  v_spec jsonb;
  v_stop jsonb;
begin
  if not public.can_manage_sales() then
    raise exception 'Acesso não permitido.' using errcode = '42501';
  end if;

  if p_load_id is not null then
    select loads.layout_3d into v_existing_layout from public.loads where loads.id = p_load_id for update;
    if v_existing_layout is not null and v_layout is null then
      raise exception 'Abra a montagem 3D para alterar esta carga.' using errcode = '22023';
    end if;
  end if;

  if v_driver_id is not null then
    select * into v_driver from public.profiles where profiles.id = v_driver_id and profiles.active;
    if not found then
      raise exception 'Selecione um motorista com acesso ativo.' using errcode = '22023';
    end if;
  end if;

  select * into v_vehicle from public.vehicles where vehicles.id = (p_load->>'vehicle_id')::uuid for share;
  if v_layout is not null then
    v_length := v_vehicle.body_length_cm / 100.0;
    v_width := v_vehicle.body_width_cm / 100.0;
    v_height := v_vehicle.body_height_cm / 100.0;
    if v_length is null or v_width is null or v_height is null or nullif(p_load->>'planned_date','') is null then
      raise exception 'Informe a data e as medidas internas da carroceria.' using errcode = '22023';
    end if;

    if jsonb_typeof(v_layout->'positions') is distinct from 'array'
      or jsonb_typeof(v_layout->'specs') is distinct from 'object'
      or jsonb_typeof(v_layout->'destinations') is distinct from 'object'
      or jsonb_array_length(v_layout->'positions') not between 1 and 1500 then
      raise exception 'A montagem 3D está incompleta.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(p_items) e where e->>'packing' <> 'loose') then
      raise exception 'Use sacas soltas na montagem 3D.' using errcode = '22023';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_items) e
      join public.quote_items qi on qi.id = (e->>'quote_item_id')::uuid
      join public.quotes q on q.id = qi.quote_id
      where v_layout->'credit'->>q.customer_id::text = 'blocked'
    ) then
      raise exception 'Há cliente com restrição de crédito informada.' using errcode = '22023';
    end if;
    if exists (
      with demand as (
        select coalesce(qi.product_id, qi.id)::text as product, sum((e->>'quantity')::int) as bags
        from jsonb_array_elements(p_items) e
        join public.quote_items qi on qi.id = (e->>'quote_item_id')::uuid
        group by coalesce(qi.product_id, qi.id)
      )
      select 1 from demand where nullif(v_layout->'stock'->product->>'now', '')::int < bags
        and ((p_load->>'planned_date')::date <= (now() at time zone 'America/Cuiaba')::date
          or nullif(v_layout->'stock'->product->>'expected', '')::int < bags)
    ) then
      raise exception 'O estoque informado é insuficiente para a data de saída.' using errcode = '22023';
    end if;

    create temporary table pg_temp.logistics_boxes (
      key text primary key,
      stop integer not null,
      x numeric not null, y numeric not null, z numeric not null,
      w numeric not null, d numeric not null, h numeric not null
    ) on commit drop;

    for v_order in
      select (e->>'quote_item_id')::uuid as item_id, (e->>'quantity')::integer as bags,
        (e->>'stop_order')::integer as stop, qi.product_id
      from jsonb_array_elements(p_items) e
      join public.quote_items qi on qi.id = (e->>'quote_item_id')::uuid
    loop
      v_spec := v_layout->'specs'->coalesce(v_order.product_id::text, v_order.item_id::text);
      if v_order.bags > 1500 or v_order.bags <= 0 or v_spec is null
        or coalesce((v_spec->>'length')::numeric, 0) not between 5 and 300
        or coalesce((v_spec->>'width')::numeric, 0) not between 5 and 200
        or coalesce((v_spec->>'height')::numeric, 0) not between 2 and 150
        or coalesce((v_spec->>'perStack')::int, 0) not between 1 and 30 then
        raise exception 'Confira as medidas e a quantidade de sacas por pilha.' using errcode = '22023';
      end if;

      for v_box in
        select v_order.item_id::text || ':' || n as key,
          (v_spec->>'length')::numeric / 100 as length,
          (v_spec->>'width')::numeric / 100 as width,
          (v_spec->>'height')::numeric / 100 * least((v_spec->>'perStack')::int,
            v_order.bags - n * (v_spec->>'perStack')::int) as height
        from generate_series(0, (v_order.bags - 1) / (v_spec->>'perStack')::int) n
      loop
        select p into v_position from jsonb_array_elements(v_layout->'positions') p where p->>'key' = v_box.key;
        if v_position is null or not (
          (abs((v_position->>'w')::numeric - v_box.length) < 0.0001 and abs((v_position->>'d')::numeric - v_box.width) < 0.0001)
          or (abs((v_position->>'w')::numeric - v_box.width) < 0.0001 and abs((v_position->>'d')::numeric - v_box.length) < 0.0001)
        ) then
          raise exception 'Posicione todos os volumes na carroceria.' using errcode = '22023';
        end if;
        insert into pg_temp.logistics_boxes values (v_box.key, v_order.stop,
          (v_position->>'x')::numeric, (v_position->>'y')::numeric, (v_position->>'z')::numeric,
          (v_position->>'w')::numeric, (v_position->>'d')::numeric, v_box.height);
        v_volume := v_volume + v_box.length * v_box.width * v_box.height;
      end loop;
    end loop;

    if (select count(*) from pg_temp.logistics_boxes) <> jsonb_array_length(v_layout->'positions')
      or exists (select 1 from pg_temp.logistics_boxes where x < -0.0001 or x+w > v_length+0.0001
        or z < -v_width/2-0.0001 or z+d > v_width/2+0.0001 or y < -0.0001 or y+h > v_height-0.05+0.0001) then
      raise exception 'Há volumes fora das medidas úteis da carroceria.' using errcode = '22023';
    end if;
    if exists (
      select 1 from pg_temp.logistics_boxes a join pg_temp.logistics_boxes b on a.key < b.key
      where least(a.x+a.w,b.x+b.w)-greatest(a.x,b.x)>0.0001
        and least(a.z+a.d,b.z+b.d)-greatest(a.z,b.z)>0.0001
        and least(a.y+a.h,b.y+b.h)-greatest(a.y,b.y)>0.0001
    ) or exists (
      select 1 from pg_temp.logistics_boxes a where a.y > 0.0001 and coalesce((
        select sum(greatest(0,least(a.x+a.w,b.x+b.w)-greatest(a.x,b.x)) *
                   greatest(0,least(a.z+a.d,b.z+b.d)-greatest(a.z,b.z)))
        from pg_temp.logistics_boxes b where b.stop = a.stop and abs(a.y-b.y-b.h)<0.0001
      ), 0) < a.w*a.d*0.7499
    ) then
      raise exception 'Confira a sobreposição e o apoio dos volumes.' using errcode = '22023';
    end if;
    if (select count(distinct stop) from pg_temp.logistics_boxes) <>
      (select max(stop) from pg_temp.logistics_boxes) or exists (
      with bands as (select stop, min(x) as front, max(x+w) as rear from pg_temp.logistics_boxes group by stop)
      select 1 from bands a join bands b on a.stop < b.stop where a.front < b.rear - 0.0001
    ) then
      raise exception 'A sequência de descarga precisa acompanhar a posição dos destinos na carroceria.' using errcode = '22023';
    end if;

    v_utilization := v_volume / (v_length * v_width * v_height);
    drop table pg_temp.logistics_boxes;
  end if;

  select * into v_saved from public.save_load_core(p_load_id, p_load, p_items);
  if v_layout is not null and exists (select 1 from public.loads
    where loads.id = v_saved.id and total_weight_kg > v_vehicle.capacity_kg * 0.95) then
    raise exception 'A montagem 3D precisa manter 5%% de reserva no peso do veículo.' using errcode = '22023';
  end if;

  update public.loads
  set driver_id = v_driver_id,
      driver_name_snapshot = coalesce(v_driver.display_name, v_driver.login),
      layout_3d = v_layout,
      volume_fill_ratio = v_utilization
  where loads.id = v_saved.id;

  delete from public.load_destinations d where d.load_id = v_saved.id;
  for v_order in
    select distinct on (li.stop_order) li.stop_order, q.customer_id, q.customer_name_snapshot, c.address
    from public.load_items li join public.quotes q on q.id = li.quote_id
    left join public.customers c on c.id = q.customer_id
    where li.load_id = v_saved.id
    order by li.stop_order, q.quote_number
  loop
    v_stop := v_layout->'destinations'->v_order.stop_order::text;
    if v_layout is not null and (
      coalesce(length(btrim(v_stop->>'address')), 0) not between 5 and 500 or exists (
        select 1 from public.load_items li join public.quotes q on q.id = li.quote_id
        where li.load_id = v_saved.id and li.stop_order = v_order.stop_order
          and q.customer_id is distinct from v_order.customer_id
      ) or v_order.customer_id is null
    ) then
      raise exception 'Cada destino precisa de um cliente e endereço de entrega.' using errcode = '22023';
    end if;
    insert into public.load_destinations (load_id, stop_order, customer_id, customer_name, address)
    values (v_saved.id, v_order.stop_order, v_order.customer_id,
      coalesce(v_order.customer_name_snapshot, 'Sem cliente vinculado'),
      coalesce(v_stop->>'address', nullif(concat_ws(', ', v_order.address->>'street', v_order.address->>'complement',
        v_order.address->>'district', v_order.address->>'city', v_order.address->>'state', v_order.address->>'postal_code'), '')));
  end loop;

  return query select v_saved.id, v_saved.load_number;
end;
$$;

revoke all on function public.save_load(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_load(uuid, jsonb, jsonb) to authenticated;

create function public.load_drivers()
returns table (id uuid, name text)
language sql stable security definer set search_path = ''
as $$
  select p.id, coalesce(p.display_name, p.login)
  from public.profiles p
  where public.can_manage_sales() and p.active
  order by 2
$$;

-- O motorista recebe somente as cargas expedidas atribuídas à sua conta.
create function public.delivery_routes(p_load_id uuid default null)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(route) order by route.planned_date desc nulls last, route.load_number desc), '[]'::jsonb)
  from (
    select l.id, l.load_number, l.planned_date, l.status, l.vehicle_name_snapshot, l.vehicle_plate_snapshot,
      l.driver_id, l.driver_name_snapshot, (
        select coalesce(jsonb_agg(jsonb_build_object(
          'stop_order', d.stop_order, 'customer_name', d.customer_name, 'address', d.address,
          'delivered_at', d.delivered_at, 'receiver_name', d.receiver_name,
          'items', (select jsonb_agg(jsonb_build_object('product', qi.product_name_snapshot,
            'bags', li.quantity, 'weight', li.quantity * li.weight_kg_snapshot) order by q.quote_number, qi.display_order)
            from public.load_items li join public.quote_items qi on qi.id = li.quote_item_id
            join public.quotes q on q.id = li.quote_id
            where li.load_id = d.load_id and li.stop_order = d.stop_order)
        ) order by d.stop_order), '[]'::jsonb)
        from public.load_destinations d where d.load_id = l.id
      ) as stops
    from public.loads l
    where l.status <> 'cancelled' and (p_load_id is null or l.id = p_load_id)
      and (public.can_manage_sales() or (
        l.driver_id = auth.uid() and public.current_profile_role() is not null and l.status = 'shipped'
      ))
    order by l.planned_date desc nulls last, l.load_number desc
    limit 100
  ) route
$$;

create function public.save_delivery_proof(p_load_id uuid, p_stop_order integer, p_receiver text, p_signature text, p_photo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.loads l where l.id = p_load_id and l.status = 'shipped' and (
      public.can_manage_sales() or (l.driver_id = auth.uid() and public.current_profile_role() is not null)
    )
  ) then
    raise exception 'Comprovação disponível para cargas expedidas autorizadas.' using errcode = '42501';
  end if;

  if coalesce(length(btrim(p_receiver)), 0) not between 2 and 120
    or coalesce(length(p_signature), 0) not between 60 and 250000
    or coalesce(length(p_photo), 0) not between 60 and 1100000
    or left(p_signature, length('data:image/png;base64,iVBORw0KGgo')) <> 'data:image/png;base64,iVBORw0KGgo'
    or left(p_photo, length('data:image/jpeg;base64,/9j/')) <> 'data:image/jpeg;base64,/9j/' then
    raise exception 'Informe o recebedor, uma assinatura e uma foto válidas.' using errcode = '22023';
  end if;

  update public.load_destinations
  set delivered_at = now(), delivered_by = auth.uid(), receiver_name = btrim(p_receiver),
      signature_png = p_signature, photo_jpeg = p_photo
  where load_id = p_load_id and stop_order = p_stop_order and delivered_at is null;
  if not found then
    raise exception 'Destino inexistente ou entrega já comprovada.' using errcode = '22023';
  end if;
end;
$$;

create function public.delivery_proof(p_load_id uuid, p_stop_order integer)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('signature', d.signature_png, 'photo', d.photo_jpeg)
  from public.load_destinations d join public.loads l on l.id = d.load_id
  where d.load_id = p_load_id and d.stop_order = p_stop_order and d.delivered_at is not null and (
    public.can_manage_sales() or (
      l.driver_id = auth.uid() and public.current_profile_role() is not null and l.status = 'shipped'
    )
  )
$$;

revoke all on function public.load_drivers(), public.delivery_routes(uuid),
  public.save_delivery_proof(uuid, integer, text, text, text), public.delivery_proof(uuid, integer) from public, anon, authenticated;
grant execute on function public.load_drivers(), public.delivery_routes(uuid),
  public.save_delivery_proof(uuid, integer, text, text, text), public.delivery_proof(uuid, integer) to authenticated;

-- Fonte para um futuro integrador fiscal no servidor. Não inclui os arquivos de comprovação.
create view public.load_fiscal_destinations with (security_invoker = true) as
select l.id as load_id, l.load_number, l.planned_date, l.shipped_at,
  l.vehicle_plate_snapshot, d.stop_order, d.customer_id, d.customer_name, d.address, d.delivered_at,
  li.quote_id, li.quote_item_id, li.quantity, li.quantity * li.weight_kg_snapshot as weight_kg
from public.loads l
join public.load_destinations d on d.load_id = l.id
join public.load_items li on li.load_id = d.load_id and li.stop_order = d.stop_order
where l.status = 'shipped';

revoke all on public.load_fiscal_destinations from public, anon, authenticated;
grant select on public.loads, public.load_destinations, public.load_items, public.load_fiscal_destinations to service_role;

-- Preserva os romaneios existentes e cria destinos pendentes para cargas anteriores.
insert into public.load_destinations (load_id, stop_order, customer_id, customer_name, address)
select distinct on (li.load_id, li.stop_order) li.load_id, li.stop_order, q.customer_id,
  coalesce(q.customer_name_snapshot, 'Sem cliente vinculado'),
  nullif(concat_ws(', ', c.address->>'street', c.address->>'complement', c.address->>'district',
    c.address->>'city', c.address->>'state', c.address->>'postal_code'), '')
from public.load_items li join public.quotes q on q.id = li.quote_id
left join public.customers c on c.id = q.customer_id
order by li.load_id, li.stop_order, q.quote_number;

commit;
