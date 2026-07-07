
-- Remove any previous schedule with the same name
DO $$ BEGIN
  PERFORM cron.unschedule('razorpay-reconcile-5min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'razorpay-reconcile-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://kwbbkvfudrzznrhoumej.supabase.co/functions/v1/razorpay-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')
    ),
    body := jsonb_build_object('since_days', 2, 'send_emails', true)
  );
  $cron$
);
