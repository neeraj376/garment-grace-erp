CREATE TABLE public.home_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  image_url text NOT NULL,
  headline text,
  subheadline text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active banners"
  ON public.home_banners FOR SELECT
  USING (is_active = true);

CREATE POLICY "Store members can view all banners"
  ON public.home_banners FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Store members can insert banners"
  ON public.home_banners FOR INSERT TO authenticated
  WITH CHECK (store_id IN (SELECT store_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Store members can update banners"
  ON public.home_banners FOR UPDATE TO authenticated
  USING (store_id IN (SELECT store_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Store members can delete banners"
  ON public.home_banners FOR DELETE TO authenticated
  USING (store_id IN (SELECT store_id FROM profiles WHERE user_id = auth.uid()));

CREATE TRIGGER update_home_banners_updated_at
  BEFORE UPDATE ON public.home_banners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_home_banners_store_active ON public.home_banners(store_id, is_active, sort_order);