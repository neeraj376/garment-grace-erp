
-- Enable trigram for fast ILIKE search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- invoices: filtered by store_id and ordered by created_at
CREATE INDEX IF NOT EXISTS idx_invoices_store_created ON public.invoices (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices (customer_id);

-- invoice_items: joined by invoice_id, filtered by product_id/batch_id
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON public.invoice_items (product_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_batch_id ON public.invoice_items (batch_id);

-- products: store_id + is_active + created_at is the dominant filter
CREATE INDEX IF NOT EXISTS idx_products_store_active_created ON public.products (store_id, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON public.products USING gin (sku gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm ON public.products USING gin (brand gin_trgm_ops);

-- inventory_batches: filtered by product_id and store_id
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_id ON public.inventory_batches (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_store_product ON public.inventory_batches (store_id, product_id);

-- orders: filtered by store_id, ordered by created_at; joined by customer/shipping
CREATE INDEX IF NOT EXISTS idx_orders_store_created ON public.orders (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_address_id ON public.orders (shipping_address_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);

-- order_items: joined by order_id and product_id
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);

-- customers: store_id filter
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON public.customers (store_id);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON public.customers (mobile);

-- shop_customers: phone/email lookups
CREATE INDEX IF NOT EXISTS idx_shop_customers_phone ON public.shop_customers (phone);

-- shipping_addresses: lookup by customer
CREATE INDEX IF NOT EXISTS idx_shipping_addresses_customer_id ON public.shipping_addresses (customer_id);

-- invoice_returns: lookups
CREATE INDEX IF NOT EXISTS idx_invoice_returns_invoice_id ON public.invoice_returns (invoice_id);

-- profiles: user_id and store_id used by RLS helpers
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_store_id ON public.profiles (store_id);
