
UPDATE public.orders
SET payment_status='paid', status='confirmed', payment_id='pay_TAcjsbnSqREXJD', payment_method='razorpay'
WHERE id='7fad2c4f-860f-420d-81c2-a4c7f7f48de0';

UPDATE public.inventory_batches SET quantity = quantity - 1 WHERE id='b1115a57-20e1-4f48-884f-3b1d6d0780ac';
UPDATE public.inventory_batches SET quantity = quantity - 1 WHERE id='e8e48776-f8b2-4ba7-874e-1505405bc7d7';
UPDATE public.inventory_batches SET quantity = quantity - 1 WHERE id='a5cda35c-68cf-4a91-a9bc-b2971341d6bf';
