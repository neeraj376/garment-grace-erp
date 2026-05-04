DO $$
DECLARE
  v_video text := 'https://kwbbkvfudrzznrhoumej.supabase.co/storage/v1/object/public/product-media/8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6/bulk-video-shared.mp4';
  v_base text := 'https://kwbbkvfudrzznrhoumej.supabase.co/storage/v1/object/public/product-media/8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6/bulk-thumb-';
  i int;
BEGIN
  FOR i IN 1..194 LOOP
    UPDATE public.products
    SET photo_url = v_base || i || '.jpg',
        video_url = v_video
    WHERE sku ~ ('^SKU-1777826[0-9]+-' || i || '$');
  END LOOP;
END $$;