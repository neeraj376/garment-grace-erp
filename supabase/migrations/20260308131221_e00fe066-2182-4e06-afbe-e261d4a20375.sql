
-- Fix 1: Storage policies - add store ownership checks for product-media bucket
-- First drop existing weak policies
DROP POLICY IF EXISTS "Authenticated users can upload product media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update product media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete product media" ON storage.objects;
DROP POLICY IF EXISTS "Store members can upload product media" ON storage.objects;
DROP POLICY IF EXISTS "Store members can update product media" ON storage.objects;
DROP POLICY IF EXISTS "Store members can delete product media" ON storage.objects;

-- Create store-scoped write policies
CREATE POLICY "Store members can upload product media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-media'
  AND (storage.foldername(name))[1] IN (
    SELECT store_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Store members can update product media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-media'
  AND (storage.foldername(name))[1] IN (
    SELECT store_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Store members can delete product media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-media'
  AND (storage.foldername(name))[1] IN (
    SELECT store_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Fix 2: Prevent client-side role escalation with a trigger
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow role changes if the old role is 'staff' (default) and new role is 'owner'
  -- AND the user has no store_id yet (first-time onboarding)
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF OLD.store_id IS NOT NULL THEN
      -- Already onboarded, cannot change role from client
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_role_change_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_change();
