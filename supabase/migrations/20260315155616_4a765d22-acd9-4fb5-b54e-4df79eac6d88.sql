
-- User permissions table for sub-users
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  can_invoicing boolean NOT NULL DEFAULT true,
  can_inventory boolean NOT NULL DEFAULT false,
  can_photos boolean NOT NULL DEFAULT false,
  can_customers boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, store_id)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Owner (role='owner') can manage all permissions for their store
CREATE POLICY "Owners can manage permissions"
ON public.user_permissions
FOR ALL
TO authenticated
USING (
  store_id IN (
    SELECT p.store_id FROM profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'owner'
  )
)
WITH CHECK (
  store_id IN (
    SELECT p.store_id FROM profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'owner'
  )
);

-- Sub-users can view their own permissions
CREATE POLICY "Users can view own permissions"
ON public.user_permissions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Allow store members to view profiles of same store (for invoice creator display)
CREATE POLICY "Store members can view store profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT p.store_id FROM profiles p
    WHERE p.user_id = auth.uid()
  )
);

-- Trigger to update updated_at
CREATE TRIGGER update_user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
