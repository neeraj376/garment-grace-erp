UPDATE public.products
SET photo_url = 'https://kwbbkvfudrzznrhoumej.supabase.co/storage/v1/object/public/product-media/products%2Frc-polo-black-leopard-1778.jpg',
    updated_at = now()
WHERE sku IN ('SKU-1778256901793', 'SKU-1778251228493');