
-- Create a function to deduct stock FIFO when invoice items are inserted
CREATE OR REPLACE FUNCTION public.deduct_stock_fifo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _remaining integer;
  _batch record;
  _store_id uuid;
BEGIN
  -- Get store_id from the invoice
  SELECT store_id INTO _store_id FROM invoices WHERE id = NEW.invoice_id;
  
  _remaining := NEW.quantity;
  
  -- Loop through batches FIFO (oldest first) and deduct
  FOR _batch IN
    SELECT id, quantity
    FROM inventory_batches
    WHERE product_id = NEW.product_id
      AND store_id = _store_id
      AND quantity > 0
    ORDER BY received_at ASC, created_at ASC
  LOOP
    IF _remaining <= 0 THEN EXIT; END IF;
    
    IF _batch.quantity >= _remaining THEN
      UPDATE inventory_batches SET quantity = quantity - _remaining WHERE id = _batch.id;
      -- Save batch_id on invoice_item
      UPDATE invoice_items SET batch_id = _batch.id WHERE id = NEW.id;
      _remaining := 0;
    ELSE
      _remaining := _remaining - _batch.quantity;
      UPDATE inventory_batches SET quantity = 0 WHERE id = _batch.id;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Create trigger on invoice_items
CREATE TRIGGER trg_deduct_stock_on_invoice
AFTER INSERT ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.deduct_stock_fifo();
