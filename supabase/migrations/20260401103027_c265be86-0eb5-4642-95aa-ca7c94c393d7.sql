ALTER TABLE public.user_permissions ADD COLUMN can_edit_invoices boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_permissions ADD COLUMN can_upload_inventory boolean NOT NULL DEFAULT false;