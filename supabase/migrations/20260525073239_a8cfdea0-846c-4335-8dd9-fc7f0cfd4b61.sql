
-- WhatsApp numbers in the rotation pool
CREATE TABLE public.whatsapp_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  label text NOT NULL,
  phone text NOT NULL,
  provider text NOT NULL DEFAULT 'interakt',
  api_url text,
  api_key text,
  template_name text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  message_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members can view whatsapp numbers"
ON public.whatsapp_numbers FOR SELECT TO authenticated
USING (store_id = public.get_current_user_store_id());

CREATE POLICY "Store members can insert whatsapp numbers"
ON public.whatsapp_numbers FOR INSERT TO authenticated
WITH CHECK (store_id = public.get_current_user_store_id());

CREATE POLICY "Store members can update whatsapp numbers"
ON public.whatsapp_numbers FOR UPDATE TO authenticated
USING (store_id = public.get_current_user_store_id());

CREATE POLICY "Store members can delete whatsapp numbers"
ON public.whatsapp_numbers FOR DELETE TO authenticated
USING (store_id = public.get_current_user_store_id());

CREATE TRIGGER trg_whatsapp_numbers_updated_at
BEFORE UPDATE ON public.whatsapp_numbers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sticky assignment: keep the same customer on the same number
CREATE TABLE public.whatsapp_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  customer_phone text NOT NULL,
  number_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, customer_phone)
);

ALTER TABLE public.whatsapp_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members can view whatsapp assignments"
ON public.whatsapp_assignments FOR SELECT TO authenticated
USING (store_id = public.get_current_user_store_id());

CREATE POLICY "Store members can delete whatsapp assignments"
ON public.whatsapp_assignments FOR DELETE TO authenticated
USING (store_id = public.get_current_user_store_id());

-- Inbound log
CREATE TABLE public.whatsapp_inbound_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  from_phone text,
  message_text text,
  assigned_number_id uuid,
  forwarded_ok boolean NOT NULL DEFAULT false,
  error text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_inbound_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members can view whatsapp inbound log"
ON public.whatsapp_inbound_log FOR SELECT TO authenticated
USING (store_id = public.get_current_user_store_id());

CREATE INDEX idx_whatsapp_numbers_store_sort ON public.whatsapp_numbers(store_id, sort_order);
CREATE INDEX idx_whatsapp_inbound_log_store_created ON public.whatsapp_inbound_log(store_id, created_at DESC);
