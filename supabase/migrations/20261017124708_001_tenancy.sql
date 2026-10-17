-- 001 Tenancy: profiles, shops, memberships, settings, helpers, create_shop RPC
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter default privileges in schema public revoke all on tables from anon;

create type public.shop_role as enum ('owner', 'staff');

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create function private.prevent_shop_id_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.shop_id is distinct from old.shop_id then
    raise exception 'shop_id is immutable' using errcode = '42501';
  end if;
  return new;
end $$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  logo_url text,
  timezone text not null default 'UTC',
  locale text not null default 'en-US',
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  contact_email text,
  contact_phone text,
  contact_policy_ack_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shop_memberships (
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.shop_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index shop_memberships_user_idx on public.shop_memberships (user_id);

create table public.shop_settings (
  shop_id uuid primary key references public.shops (id) on delete cascade,
  sender_name text,
  reply_to_email text,
  business_hours jsonb not null default '{"start":"09:00","end":"17:00","days":[1,2,3,4,5]}',
  quiet_hours_start time not null default '20:00',
  quiet_hours_end time not null default '08:00',
  default_cadence_days int[] not null default '{2,7,14}',
  reminders_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger shops_updated_at before update on public.shops
  for each row execute function private.set_updated_at();
create trigger shop_settings_updated_at before update on public.shop_settings
  for each row execute function private.set_updated_at();
create trigger shop_settings_shop_id_immutable before update on public.shop_settings
  for each row execute function private.prevent_shop_id_change();

-- Membership helpers (security definer so policies don't recurse)
create function private.is_shop_member(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_memberships m
    where m.shop_id = p_shop and m.user_id = (select auth.uid())
  );
$$;

create function private.is_shop_owner(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_memberships m
    where m.shop_id = p_shop and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

create function private.shares_shop_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.shop_memberships a
    join public.shop_memberships b on a.shop_id = b.shop_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  );
$$;

revoke all on function private.is_shop_member(uuid), private.is_shop_owner(uuid),
  private.shares_shop_with(uuid) from public, anon;
grant execute on function private.is_shop_member(uuid), private.is_shop_owner(uuid),
  private.shares_shop_with(uuid) to authenticated;

-- Auto-create profile on signup
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.shop_memberships enable row level security;
alter table public.shop_settings enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_shop_with(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy shops_select on public.shops for select to authenticated
  using (private.is_shop_member(id));
create policy shops_update_owner on public.shops for update to authenticated
  using (private.is_shop_owner(id)) with check (private.is_shop_owner(id));

-- Memberships: read-only from clients. Changes go through server routes (service role).
create policy memberships_select on public.shop_memberships for select to authenticated
  using (private.is_shop_member(shop_id));

create policy shop_settings_select on public.shop_settings for select to authenticated
  using (private.is_shop_member(shop_id));
create policy shop_settings_update_owner on public.shop_settings for update to authenticated
  using (private.is_shop_owner(shop_id)) with check (private.is_shop_owner(shop_id));

-- Onboarding RPC: the only way a client creates a shop. One shop per user in the MVP.
create function public.create_shop(
  p_name text,
  p_timezone text default 'UTC',
  p_currency text default 'USD',
  p_locale text default 'en-US',
  p_contact_email text default null,
  p_policy_ack boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_shop uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not coalesce(p_policy_ack, false) then
    raise exception 'contact policy acknowledgement required' using errcode = '22023';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 then
    raise exception 'invalid shop name' using errcode = '22023';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid currency' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'invalid timezone' using errcode = '22023';
  end if;
  if exists (select 1 from public.shop_memberships where user_id = v_uid) then
    raise exception 'user already belongs to a shop' using errcode = '23505';
  end if;

  insert into public.shops (name, timezone, currency, locale, contact_email, contact_policy_ack_at, created_by)
  values (btrim(p_name), p_timezone, p_currency, coalesce(p_locale, 'en-US'), p_contact_email, now(), v_uid)
  returning id into v_shop;

  insert into public.shop_memberships (shop_id, user_id, role) values (v_shop, v_uid, 'owner');
  insert into public.shop_settings (shop_id, reply_to_email) values (v_shop, p_contact_email);
  return v_shop;
end $$;

revoke all on function public.create_shop(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.create_shop(text, text, text, text, text, boolean) to authenticated;

revoke all on all tables in schema public from anon;
