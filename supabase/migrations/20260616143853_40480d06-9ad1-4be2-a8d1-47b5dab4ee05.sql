
CREATE TABLE public.shop_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_visitors TO authenticated;
GRANT ALL ON public.shop_visitors TO service_role;
ALTER TABLE public.shop_visitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view visitors"
  ON public.shop_visitors FOR SELECT TO authenticated USING (true);

CREATE INDEX shop_visitors_verified_at_idx ON public.shop_visitors (verified_at DESC);

CREATE TABLE public.shop_mobile_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.shop_mobile_otps TO service_role;
ALTER TABLE public.shop_mobile_otps ENABLE ROW LEVEL SECURITY;
-- no policies: only service_role (edge functions) can access

CREATE INDEX shop_mobile_otps_phone_idx ON public.shop_mobile_otps (phone, used, expires_at DESC);
