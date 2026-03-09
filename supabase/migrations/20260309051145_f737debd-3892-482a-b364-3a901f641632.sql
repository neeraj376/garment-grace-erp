
-- Function to recalculate customer stats from remaining invoices
CREATE OR REPLACE FUNCTION public.recalculate_customer_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _customer_id uuid;
  _new_total numeric;
  _new_visits integer;
BEGIN
  -- Get the customer_id from the deleted invoice
  _customer_id := OLD.customer_id;
  
  -- If no customer linked, nothing to update
  IF _customer_id IS NULL THEN
    RETURN OLD;
  END IF;
  
  -- Recalculate from remaining invoices
  SELECT 
    COALESCE(SUM(total_amount), 0),
    COUNT(*)
  INTO _new_total, _new_visits
  FROM invoices
  WHERE customer_id = _customer_id
    AND status != 'fully_returned';
  
  -- Update customer record
  UPDATE customers
  SET total_spent = _new_total,
      visit_count = _new_visits,
      updated_at = now()
  WHERE id = _customer_id;
  
  RETURN OLD;
END;
$$;

-- Trigger fires after each invoice is deleted
CREATE TRIGGER trg_recalculate_customer_stats_on_delete
AFTER DELETE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_customer_stats();
