
ALTER TABLE public.shop_visitors ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.shop_visitors ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.shop_visitors DROP CONSTRAINT IF EXISTS shop_visitors_phone_key;
CREATE UNIQUE INDEX IF NOT EXISTS shop_visitors_email_unique ON public.shop_visitors (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.shop_email_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.shop_email_otps TO service_role;
ALTER TABLE public.shop_email_otps ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS shop_email_otps_email_idx ON public.shop_email_otps (lower(email), used, expires_at DESC);
