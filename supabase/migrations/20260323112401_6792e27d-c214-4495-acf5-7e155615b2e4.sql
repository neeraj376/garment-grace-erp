ALTER TABLE public.user_permissions
  ADD COLUMN can_dashboard boolean NOT NULL DEFAULT false,
  ADD COLUMN can_reports boolean NOT NULL DEFAULT false,
  ADD COLUMN can_loyalty boolean NOT NULL DEFAULT false,
  ADD COLUMN can_employees boolean NOT NULL DEFAULT false,
  ADD COLUMN can_stock_summary boolean NOT NULL DEFAULT false,
  ADD COLUMN can_settings boolean NOT NULL DEFAULT false;