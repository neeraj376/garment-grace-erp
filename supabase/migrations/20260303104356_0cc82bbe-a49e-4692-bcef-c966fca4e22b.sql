
-- WooCommerce config table
CREATE TABLE public.woocommerce_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  woo_store_url text NOT NULL,
  last_product_sync timestamp with time zone,
  last_order_sync timestamp with time zone,
  last_stock_sync timestamp with time zone,
  sync_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(store_id)
);

ALTER TABLE public.woocommerce_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members can view woo config"
ON public.woocommerce_config FOR SELECT
USING (store_id IN (SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Store members can insert woo config"
ON public.woocommerce_config FOR INSERT
WITH CHECK (store_id IN (SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Store members can update woo config"
ON public.woocommerce_config FOR UPDATE
USING (store_id IN (SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Store members can delete woo config"
ON public.woocommerce_config FOR DELETE
USING (store_id IN (SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE TRIGGER update_woocommerce_config_updated_at
BEFORE UPDATE ON public.woocommerce_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
