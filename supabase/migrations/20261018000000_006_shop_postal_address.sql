-- 006 Shop mailing address (required in the footer of follow-up emails, CAN-SPAM).
alter table public.shops
  add column postal_address text check (postal_address is null or char_length(postal_address) between 5 and 300);
