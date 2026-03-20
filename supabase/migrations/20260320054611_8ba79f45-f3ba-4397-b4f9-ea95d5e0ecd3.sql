DROP POLICY IF EXISTS "Store members can view store profiles" ON public.profiles;

CREATE OR REPLACE FUNCTION public.get_current_user_store_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

CREATE POLICY "Store members can view store profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  store_id IS NOT NULL
  AND store_id = public.get_current_user_store_id()
);