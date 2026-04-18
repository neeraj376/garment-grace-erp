-- Track when a customer was sent the WhatsApp group invite
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS group_invite_sent_at timestamptz;

-- Log of marketing messages sent
CREATE TABLE IF NOT EXISTS public.marketing_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone text NOT NULL,
  campaign text NOT NULL DEFAULT 'group_invite',
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_messages_store ON public.marketing_messages(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_group_invite ON public.customers(store_id, group_invite_sent_at);

ALTER TABLE public.marketing_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members can view marketing messages"
  ON public.marketing_messages FOR SELECT TO authenticated
  USING (store_id = public.get_current_user_store_id());

CREATE POLICY "Store members can insert marketing messages"
  ON public.marketing_messages FOR INSERT TO authenticated
  WITH CHECK (store_id = public.get_current_user_store_id());