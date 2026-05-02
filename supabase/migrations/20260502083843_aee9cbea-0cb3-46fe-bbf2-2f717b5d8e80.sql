UPDATE public.products
SET video_url = 'https://kwbbkvfudrzznrhoumej.supabase.co/storage/v1/object/public/product-media/8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6/gaastra-shirt-video-1730000000.mp4',
    updated_at = now()
WHERE store_id = '8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6'
  AND name = 'Gaastra Shirt';