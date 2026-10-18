-- 007 Allow customers to approve a repair directly from the reply link.
alter table public.customer_responses
  drop constraint if exists customer_responses_response_type_check;
alter table public.customer_responses
  add constraint customer_responses_response_type_check
  check (response_type in ('approve', 'callback', 'appointment', 'interested', 'not_now', 'opt_out'));
