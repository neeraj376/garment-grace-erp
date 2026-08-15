CREATE OR REPLACE FUNCTION public.recalc_invoice_totals(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub numeric := 0;
  v_tax numeric := 0;
  v_tot numeric := 0;
  v_orig int := 0;
  v_ret int := 0;
  v_status text;
BEGIN
  SELECT
    COALESCE(ROUND(SUM(ii.unit_price * GREATEST(ii.quantity - ii.returned_quantity, 0)), 2), 0),
    COALESCE(ROUND(SUM(ii.tax_amount * (GREATEST(ii.quantity - ii.returned_quantity, 0)::numeric / NULLIF(ii.quantity, 0))), 2), 0),
    COALESCE(ROUND(SUM(ii.total * (GREATEST(ii.quantity - ii.returned_quantity, 0)::numeric / NULLIF(ii.quantity, 0))), 2), 0),
    COALESCE(SUM(ii.quantity), 0),
    COALESCE(SUM(ii.returned_quantity), 0)
  INTO v_sub, v_tax, v_tot, v_orig, v_ret
  FROM public.invoice_items ii
  WHERE ii.invoice_id = p_invoice_id;

  IF v_ret <= 0 THEN
    RETURN;
  END IF;

  IF v_ret >= v_orig THEN
    v_status := 'fully_returned';
  ELSE
    v_status := 'partially_returned';
  END IF;

  UPDATE public.invoices
  SET subtotal = v_sub,
      tax_amount = v_tax,
      total_amount = v_tot,
      status = v_status,
      pending_amount = LEAST(COALESCE(pending_amount, 0), v_tot)
  WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_invoice_totals_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_invoice_totals(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS recalc_invoice_totals_on_item_return ON public.invoice_items;
CREATE TRIGGER recalc_invoice_totals_on_item_return
AFTER UPDATE OF returned_quantity ON public.invoice_items
FOR EACH ROW
WHEN (NEW.returned_quantity IS DISTINCT FROM OLD.returned_quantity)
EXECUTE FUNCTION public.trg_recalc_invoice_totals_items();

CREATE OR REPLACE FUNCTION public.trg_recalc_invoice_totals_returns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_invoice_totals(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS recalc_invoice_totals_on_return ON public.invoice_returns;
CREATE TRIGGER recalc_invoice_totals_on_return
AFTER INSERT OR DELETE ON public.invoice_returns
FOR EACH ROW
EXECUTE FUNCTION public.trg_recalc_invoice_totals_returns();

REVOKE EXECUTE ON FUNCTION public.recalc_invoice_totals(uuid) FROM anon, authenticated;