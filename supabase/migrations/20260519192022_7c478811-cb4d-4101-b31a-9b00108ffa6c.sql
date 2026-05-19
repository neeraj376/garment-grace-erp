DELETE FROM public.order_items WHERE order_id = (SELECT id FROM public.orders WHERE order_number = 'ORD-MPD0M43I');
DELETE FROM public.orders WHERE order_number = 'ORD-MPD0M43I';