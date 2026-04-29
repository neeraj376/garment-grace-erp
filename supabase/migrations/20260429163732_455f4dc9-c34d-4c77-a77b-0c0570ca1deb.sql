CREATE TABLE public.employee_auth_passwords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  password text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_auth_passwords ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (bypasses RLS) can access. Clients cannot read.