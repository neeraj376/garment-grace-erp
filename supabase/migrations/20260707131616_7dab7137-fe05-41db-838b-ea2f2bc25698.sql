
DO $$
DECLARE
  _token text;
BEGIN
  SELECT decrypted_secret INTO _token FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key';
  PERFORM net.http_post(
    url := 'https://kwbbkvfudrzznrhoumej.supabase.co/functions/v1/send-order-confirmation',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||_token),
    body := jsonb_build_object('order_id','7fad2c4f-860f-420d-81c2-a4c7f7f48de0')
  );
  PERFORM net.http_post(
    url := 'https://kwbbkvfudrzznrhoumej.supabase.co/functions/v1/send-order-alert',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||_token),
    body := jsonb_build_object('order_id','7fad2c4f-860f-420d-81c2-a4c7f7f48de0')
  );
END $$;
