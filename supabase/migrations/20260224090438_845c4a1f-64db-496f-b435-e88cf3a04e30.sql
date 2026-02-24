
ALTER TABLE public.invoices ADD COLUMN employee_id uuid REFERENCES public.employees(id);
