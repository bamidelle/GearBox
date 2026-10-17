-- 003 Messaging, customer action tokens/responses, audit, entitlements
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, shop_id)
);

create table public.follow_up_sequences (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, shop_id)
);

create table public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  sequence_id uuid not null,
  template_id uuid not null,
  step_number int not null check (step_number >= 1),
  delay_days int not null check (delay_days >= 0),
  unique (id, shop_id),
  unique (sequence_id, step_number),
  foreign key (sequence_id, shop_id) references public.follow_up_sequences (id, shop_id) on delete cascade,
  foreign key (template_id, shop_id) references public.message_templates (id, shop_id)
);

create table public.message_logs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  opportunity_id uuid not null,
  customer_id uuid not null,
  step_id uuid,
  channel text not null default 'email' check (channel in ('email')),
  status text not null check (status in ('scheduled', 'sent', 'failed', 'suppressed', 'skipped')),
  -- Unique per opportunity + sequence step + scheduled occurrence: retries cannot double-send.
  send_key text not null unique,
  scheduled_for timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  foreign key (opportunity_id, shop_id) references public.repair_opportunities (id, shop_id) on delete cascade,
  foreign key (customer_id, shop_id) references public.customers (id, shop_id) on delete cascade
);
create index message_logs_shop_status_idx on public.message_logs (shop_id, status, scheduled_for);
create index message_logs_opportunity_idx on public.message_logs (shop_id, opportunity_id);

create table public.customer_action_tokens (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  opportunity_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, shop_id),
  foreign key (opportunity_id, shop_id) references public.repair_opportunities (id, shop_id) on delete cascade
);
create index action_tokens_opportunity_idx on public.customer_action_tokens (shop_id, opportunity_id);

create table public.customer_responses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  opportunity_id uuid not null,
  token_id uuid,
  response_type text not null check (response_type in ('callback', 'appointment', 'interested', 'not_now', 'opt_out')),
  message text check (message is null or char_length(message) <= 2000),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (opportunity_id, shop_id) references public.repair_opportunities (id, shop_id) on delete cascade,
  foreign key (token_id, shop_id) references public.customer_action_tokens (id, shop_id) on delete set null (token_id)
);
create index customer_responses_idx on public.customer_responses (shop_id, opportunity_id, created_at);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  actor_id uuid,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_events_shop_idx on public.audit_events (shop_id, created_at desc);

create table public.subscription_entitlements (
  shop_id uuid primary key references public.shops (id) on delete cascade,
  plan text not null default 'pilot',
  status text not null default 'active',
  max_opportunities int,
  max_seats int,
  max_monthly_emails int,
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['message_templates', 'follow_up_sequences', 'sequence_steps', 'message_logs',
                           'customer_action_tokens', 'customer_responses', 'audit_events', 'subscription_entitlements'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['message_templates', 'follow_up_sequences', 'sequence_steps', 'message_logs',
                           'customer_action_tokens', 'customer_responses', 'audit_events', 'subscription_entitlements'] loop
    execute format('create trigger %I_shop_id_immutable before update on public.%I for each row execute function private.prevent_shop_id_change()', t, t);
  end loop;
  foreach t in array array['message_templates', 'follow_up_sequences'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function private.set_updated_at()', t, t);
  end loop;
end $$;

-- Templates and sequences: members read, owners write.
create policy message_templates_select on public.message_templates for select to authenticated using (private.is_shop_member(shop_id));
create policy message_templates_write on public.message_templates for all to authenticated
  using (private.is_shop_owner(shop_id)) with check (private.is_shop_owner(shop_id));
create policy follow_up_sequences_select on public.follow_up_sequences for select to authenticated using (private.is_shop_member(shop_id));
create policy follow_up_sequences_write on public.follow_up_sequences for all to authenticated
  using (private.is_shop_owner(shop_id)) with check (private.is_shop_owner(shop_id));
create policy sequence_steps_select on public.sequence_steps for select to authenticated using (private.is_shop_member(shop_id));
create policy sequence_steps_write on public.sequence_steps for all to authenticated
  using (private.is_shop_owner(shop_id)) with check (private.is_shop_owner(shop_id));

-- Server-written, member-readable: message logs, audit trail, entitlements.
create policy message_logs_select on public.message_logs for select to authenticated using (private.is_shop_member(shop_id));
create policy audit_events_select on public.audit_events for select to authenticated using (private.is_shop_member(shop_id));
create policy entitlements_select on public.subscription_entitlements for select to authenticated using (private.is_shop_member(shop_id));

-- Customer responses: members read and mark handled; inserts come from the public page via the server.
create policy customer_responses_select on public.customer_responses for select to authenticated using (private.is_shop_member(shop_id));
create policy customer_responses_update on public.customer_responses for update to authenticated
  using (private.is_shop_member(shop_id)) with check (private.is_shop_member(shop_id));

-- Action tokens: deny-all for clients. Only the server (service role) touches them.
revoke all on public.customer_action_tokens from anon, authenticated;

revoke all on all tables in schema public from anon;
