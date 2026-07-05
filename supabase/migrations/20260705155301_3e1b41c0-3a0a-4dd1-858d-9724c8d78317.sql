ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS shipping_name text,
  ADD COLUMN IF NOT EXISTS shipping_phone text,
  ADD COLUMN IF NOT EXISTS shipping_address_line1 text,
  ADD COLUMN IF NOT EXISTS shipping_address_line2 text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_state text,
  ADD COLUMN IF NOT EXISTS shipping_pincode text;