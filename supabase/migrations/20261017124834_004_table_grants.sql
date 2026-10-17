-- 004 Explicit least-privilege grants. RLS policies still decide which rows are visible.
-- authenticated: only the operations the policies intend. anon: nothing. service_role: server-side only.
grant select, update on public.profiles to authenticated;
grant select, update on public.shops to authenticated;
grant select on public.shop_memberships to authenticated;
grant select, update on public.shop_settings to authenticated;

grant select, insert, update, delete on
  public.customers, public.vehicles, public.imports, public.repair_opportunities, public.repair_line_items,
  public.message_templates, public.follow_up_sequences, public.sequence_steps
  to authenticated;

grant select, insert on public.import_row_errors, public.opportunity_notes to authenticated;
grant select on public.opportunity_status_history, public.message_logs, public.audit_events,
  public.subscription_entitlements to authenticated;
grant select, update on public.customer_responses to authenticated;
-- customer_action_tokens: intentionally no grant to anon/authenticated (server only).

grant all on all tables in schema public to service_role;
