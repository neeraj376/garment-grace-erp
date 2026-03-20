
CREATE OR REPLACE FUNCTION public.clear_photos_on_zero_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total_stock integer;
BEGIN
  SELECT COALESCE(SUM(quantity), 0) INTO _total_stock
  FROM inventory_batches
  WHERE product_id = NEW.product_id;

  IF _total_stock <= 0 THEN
    UPDATE products
    SET photo_url = NULL, video_url = NULL
    WHERE id = NEW.product_id
      AND (photo_url IS NOT NULL OR video_url IS NOT NULL);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clear_photos_on_zero_stock
AFTER INSERT OR UPDATE ON public.inventory_batches
FOR EACH ROW
EXECUTE FUNCTION public.clear_photos_on_zero_stock();
