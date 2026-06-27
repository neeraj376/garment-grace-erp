
CREATE OR REPLACE FUNCTION public.cancel_online_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order record;
  _item record;
  _inv_item record;
  _restored_via_batch boolean;
  _batch_id uuid;
  _store_id uuid;
BEGIN
  SELECT * INTO _order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF _order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Order already cancelled');
  END IF;

  _store_id := _order.store_id;

  -- Restore stock for each order item
  FOR _item IN
    SELECT id, product_id, quantity FROM order_items WHERE order_id = p_order_id
  LOOP
    _restored_via_batch := false;

    -- Try to use the linked invoice's batch_id (exact restoration)
    FOR _inv_item IN
      SELECT ii.batch_id, ii.quantity
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.store_id = _store_id
        AND SUBSTRING(i.invoice_number FROM 5) = SUBSTRING(_order.order_number FROM 5)
        AND ii.product_id = _item.product_id
        AND ii.batch_id IS NOT NULL
    LOOP
      UPDATE inventory_batches
      SET quantity = quantity + _inv_item.quantity
      WHERE id = _inv_item.batch_id;
      _restored_via_batch := true;
    END LOOP;

    -- Fallback: add to most recent batch, or insert a new one
    IF NOT _restored_via_batch THEN
      SELECT id INTO _batch_id
      FROM inventory_batches
      WHERE product_id = _item.product_id AND store_id = _store_id
      ORDER BY received_at DESC, created_at DESC
      LIMIT 1;

      IF _batch_id IS NOT NULL THEN
        UPDATE inventory_batches
        SET quantity = quantity + _item.quantity
        WHERE id = _batch_id;
      ELSE
        INSERT INTO inventory_batches (product_id, store_id, quantity, buying_price, received_at)
        VALUES (_item.product_id, _store_id, _item.quantity, 0, now());
      END IF;
    END IF;
  END LOOP;

  -- Remove the linked invoice (and its items via cascade) so reports don't count the cancelled sale
  DELETE FROM invoices
  WHERE store_id = _store_id
    AND SUBSTRING(invoice_number FROM 5) = SUBSTRING(_order.order_number FROM 5);

  -- Mark order cancelled
  UPDATE orders
  SET status = 'cancelled'
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_online_order(uuid) TO authenticated, service_role;
