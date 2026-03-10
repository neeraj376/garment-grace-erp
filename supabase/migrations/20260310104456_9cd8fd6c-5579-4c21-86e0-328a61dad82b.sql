
-- Customer accounts for the storefront (separate from admin users)
CREATE TABLE public.shop_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.shop_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own profile" ON public.shop_customers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Customers can update own profile" ON public.shop_customers
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Customers can insert own profile" ON public.shop_customers
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Shipping addresses
CREATE TABLE public.shipping_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.shop_customers(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text NOT NULL,
  pincode text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipping_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can manage own addresses" ON public.shipping_addresses
  FOR ALL TO authenticated
  USING (customer_id IN (SELECT id FROM public.shop_customers WHERE user_id = auth.uid()))
  WITH CHECK (customer_id IN (SELECT id FROM public.shop_customers WHERE user_id = auth.uid()));

-- Orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.shop_customers(id) NOT NULL,
  store_id uuid REFERENCES public.stores(id) NOT NULL,
  shipping_address_id uuid REFERENCES public.shipping_addresses(id),
  status text NOT NULL DEFAULT 'pending',
  payment_status text NOT NULL DEFAULT 'pending',
  payment_method text DEFAULT 'payu',
  payment_id text,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  shipping_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  shiprocket_order_id text,
  shiprocket_shipment_id text,
  tracking_number text,
  courier_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.shop_customers WHERE user_id = auth.uid()));

CREATE POLICY "Customers can create orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (customer_id IN (SELECT id FROM public.shop_customers WHERE user_id = auth.uid()));

CREATE POLICY "Store members can view orders" ON public.orders
  FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Store members can update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (store_id IN (SELECT store_id FROM profiles WHERE user_id = auth.uid()));

-- Order items
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.products(id) NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.orders WHERE customer_id IN (SELECT id FROM public.shop_customers WHERE user_id = auth.uid())));

CREATE POLICY "Customers can create order items" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (order_id IN (SELECT id FROM public.orders WHERE customer_id IN (SELECT id FROM public.shop_customers WHERE user_id = auth.uid())));

CREATE POLICY "Store members can view order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.orders WHERE store_id IN (SELECT store_id FROM profiles WHERE user_id = auth.uid())));

-- Cart items (ephemeral, per customer)
CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.shop_customers(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id, product_id)
);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can manage own cart" ON public.cart_items
  FOR ALL TO authenticated
  USING (customer_id IN (SELECT id FROM public.shop_customers WHERE user_id = auth.uid()))
  WITH CHECK (customer_id IN (SELECT id FROM public.shop_customers WHERE user_id = auth.uid()));

-- Trigger for updated_at on orders
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shop_customers_updated_at
  BEFORE UPDATE ON public.shop_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
