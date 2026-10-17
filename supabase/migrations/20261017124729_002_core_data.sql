-- 002 Core data: customers, vehicles, opportunities, line items, notes, status history, imports
create type public.consent_status as enum ('unknown', 'granted', 'withdrawn');
create type public.opportunity_status as enum (
  'new', 'follow_up_scheduled', 'contacted', 'customer_interested',
  'appointment_requested', 'approved', 'work_completed', 'paid',
  'declined_again', 'opted_out', 'closed'
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  preferred_channel text not null default 'email' check (preferred_channel in ('email', 'phone', 'none')),
  consent_status public.consent_status not null default 'unknown',
  consent_source text,
  consent_channel text,
  consent_policy_version text,
  consent_at timestamptz,
  opted_out_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, shop_id)
);
create index customers_shop_email_idx on public.customers (shop_id, lower(email));
create index customers_shop_name_idx on public.customers (shop_id, lower(name));

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  customer_id uuid not null,
  year smallint check (year is null or year between 1900 and 2100),
  make text,
  model text,
  registration text,
  vin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, shop_id),
  foreign key (customer_id, shop_id) references public.customers (id, shop_id) on delete cascade
);
create index vehicles_shop_customer_idx on public.vehicles (shop_id, customer_id);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  filename text,
  status text not null default 'uploaded' check (status in ('uploaded', 'previewed', 'confirmed', 'failed')),
  column_mapping jsonb,
  total_rows int not null default 0,
  imported_rows int not null default 0,
  skipped_rows int not null default 0,
  duplicate_rows int not null default 0,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (id, shop_id)
);

create table public.import_row_errors (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  import_id uuid not null,
  row_number int not null,
  field text,
  message text not null,
  raw_row jsonb,
  created_at timestamptz not null default now(),
  foreign key (import_id, shop_id) references public.imports (id, shop_id) on delete cascade
);
create index import_row_errors_import_idx on public.import_row_errors (shop_id, import_id);

create table public.repair_opportunities (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  customer_id uuid not null,
  vehicle_id uuid,
  import_id uuid,
  description text not null check (char_length(description) between 1 and 2000),
  estimate_amount numeric(12, 2) check (estimate_amount is null or estimate_amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  declined_at date,
  status public.opportunity_status not null default 'new',
  assigned_to uuid references auth.users (id) on delete set null,
  next_action_at timestamptz,
  next_action_note text,
  sequence_paused boolean not null default false,
  approved_amount numeric(12, 2) check (approved_amount is null or approved_amount >= 0),
  approved_at timestamptz,
  completed_at timestamptz,
  paid_amount numeric(12, 2) check (paid_amount is null or paid_amount >= 0),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, shop_id),
  foreign key (customer_id, shop_id) references public.customers (id, shop_id) on delete cascade,
  foreign key (vehicle_id, shop_id) references public.vehicles (id, shop_id) on delete set null (vehicle_id),
  foreign key (import_id, shop_id) references public.imports (id, shop_id) on delete set null (import_id),
  -- Recovered revenue must be an explicit record: paid needs amount + date.
  constraint paid_requires_amount_and_date
    check (status <> 'paid' or (paid_amount is not null and paid_at is not null))
);
create index opportunities_shop_status_idx on public.repair_opportunities (shop_id, status);
create index opportunities_shop_customer_idx on public.repair_opportunities (shop_id, customer_id);
create index opportunities_shop_next_action_idx on public.repair_opportunities (shop_id, next_action_at);

create table public.repair_line_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  opportunity_id uuid not null,
  description text not null check (char_length(description) between 1 and 500),
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  amount numeric(12, 2) check (amount is null or amount >= 0),
  created_at timestamptz not null default now(),
  foreign key (opportunity_id, shop_id) references public.repair_opportunities (id, shop_id) on delete cascade
);
create index line_items_opportunity_idx on public.repair_line_items (shop_id, opportunity_id);

create table public.opportunity_notes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  opportunity_id uuid not null,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (opportunity_id, shop_id) references public.repair_opportunities (id, shop_id) on delete cascade
);
create index opportunity_notes_idx on public.opportunity_notes (shop_id, opportunity_id, created_at);

create table public.opportunity_status_history (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  opportunity_id uuid not null,
  from_status public.opportunity_status,
  to_status public.opportunity_status not null,
  actor_id uuid,
  created_at timestamptz not null default now(),
  foreign key (opportunity_id, shop_id) references public.repair_opportunities (id, shop_id) on delete cascade
);
create index status_history_idx on public.opportunity_status_history (shop_id, opportunity_id, created_at);

-- Status history is written by trigger only (actor = auth.uid()).
create function private.log_opportunity_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.opportunity_status_history (shop_id, opportunity_id, from_status, to_status, actor_id)
    values (new.shop_id, new.id, null, new.status, (select auth.uid()));
  elsif new.status is distinct from old.status then
    insert into public.opportunity_status_history (shop_id, opportunity_id, from_status, to_status, actor_id)
    values (new.shop_id, new.id, old.status, new.status, (select auth.uid()));
  end if;
  return new;
end $$;

create trigger opportunity_status_log after insert or update of status on public.repair_opportunities
  for each row execute function private.log_opportunity_status();

-- Timestamps + shop_id immutability
do $$
declare t text;
begin
  foreach t in array array['customers', 'vehicles', 'repair_opportunities'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function private.set_updated_at()', t, t);
  end loop;
  foreach t in array array['customers', 'vehicles', 'imports', 'import_row_errors', 'repair_opportunities',
                           'repair_line_items', 'opportunity_notes', 'opportunity_status_history'] loop
    execute format('create trigger %I_shop_id_immutable before update on public.%I for each row execute function private.prevent_shop_id_change()', t, t);
  end loop;
end $$;

-- RLS: members read/write their shop; deletes are owner-only.
do $$
declare t text;
begin
  foreach t in array array['customers', 'vehicles', 'imports', 'repair_opportunities', 'repair_line_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_shop_member(shop_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.is_shop_member(shop_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.is_shop_member(shop_id)) with check (private.is_shop_member(shop_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.is_shop_owner(shop_id))', t || '_delete', t);
  end loop;

  -- Append-style tables: members read; members insert; no client update/delete.
  alter table public.import_row_errors enable row level security;
  create policy import_row_errors_select on public.import_row_errors for select to authenticated
    using (private.is_shop_member(shop_id));
  create policy import_row_errors_insert on public.import_row_errors for insert to authenticated
    with check (private.is_shop_member(shop_id));

  alter table public.opportunity_notes enable row level security;
  create policy opportunity_notes_select on public.opportunity_notes for select to authenticated
    using (private.is_shop_member(shop_id));
  create policy opportunity_notes_insert on public.opportunity_notes for insert to authenticated
    with check (private.is_shop_member(shop_id) and author_id = (select auth.uid()));

  -- Status history: read-only for clients (trigger writes it).
  alter table public.opportunity_status_history enable row level security;
  create policy status_history_select on public.opportunity_status_history for select to authenticated
    using (private.is_shop_member(shop_id));
end $$;

revoke all on all tables in schema public from anon;
