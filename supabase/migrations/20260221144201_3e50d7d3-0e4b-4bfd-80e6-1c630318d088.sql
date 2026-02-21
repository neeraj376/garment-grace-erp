
-- Store details
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  gst_number TEXT,
  gst_state_code TEXT,
  logo_url TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'staff',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Products (SKUs)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  subcategory TEXT,
  brand TEXT,
  size TEXT,
  color TEXT,
  material TEXT,
  hsn_code TEXT,
  selling_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  mrp NUMERIC(10,2),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 18,
  photo_url TEXT,
  video_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Inventory batches (same product, different buying prices)
CREATE TABLE public.inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  buying_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  batch_number TEXT,
  supplier TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;

-- Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  name TEXT,
  mobile TEXT NOT NULL,
  email TEXT,
  gender TEXT,
  location TEXT,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  source TEXT NOT NULL DEFAULT 'offline',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  loyalty_points_earned INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Invoice items
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  batch_id UUID REFERENCES public.inventory_batches(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL
);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Employees
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'sales',
  salary NUMERIC(10,2),
  joining_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Loyalty transactions
CREATE TABLE public.loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  invoice_id UUID REFERENCES public.invoices(id),
  points INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'earned',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- Store settings
CREATE TABLE public.store_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL UNIQUE,
  loyalty_points_per_amount NUMERIC(5,2) NOT NULL DEFAULT 1,
  loyalty_amount_unit NUMERIC(10,2) NOT NULL DEFAULT 100,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  default_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: store-scoped access through profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their store" ON public.stores FOR SELECT USING (
  id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update their store" ON public.stores FOR UPDATE USING (
  id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create store" ON public.stores FOR INSERT WITH CHECK (true);

CREATE POLICY "Store members can view products" ON public.products FOR SELECT USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can manage products" ON public.products FOR INSERT WITH CHECK (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can update products" ON public.products FOR UPDATE USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can delete products" ON public.products FOR DELETE USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Store members can view batches" ON public.inventory_batches FOR SELECT USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can manage batches" ON public.inventory_batches FOR INSERT WITH CHECK (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can update batches" ON public.inventory_batches FOR UPDATE USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can delete batches" ON public.inventory_batches FOR DELETE USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Store members can view customers" ON public.customers FOR SELECT USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can manage customers" ON public.customers FOR INSERT WITH CHECK (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can update customers" ON public.customers FOR UPDATE USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Store members can view invoices" ON public.invoices FOR SELECT USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can create invoices" ON public.invoices FOR INSERT WITH CHECK (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Store members can view invoice items" ON public.invoice_items FOR SELECT USING (
  invoice_id IN (SELECT id FROM public.invoices WHERE store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()))
);
CREATE POLICY "Store members can create invoice items" ON public.invoice_items FOR INSERT WITH CHECK (
  invoice_id IN (SELECT id FROM public.invoices WHERE store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()))
);

CREATE POLICY "Store members can view employees" ON public.employees FOR SELECT USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can manage employees" ON public.employees FOR INSERT WITH CHECK (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can update employees" ON public.employees FOR UPDATE USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can delete employees" ON public.employees FOR DELETE USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Store members can view loyalty" ON public.loyalty_transactions FOR SELECT USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can create loyalty" ON public.loyalty_transactions FOR INSERT WITH CHECK (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Store members can view settings" ON public.store_settings FOR SELECT USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can manage settings" ON public.store_settings FOR INSERT WITH CHECK (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Store members can update settings" ON public.store_settings FOR UPDATE USING (
  store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())
);

-- Trigger for auto-creating profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_store_settings_updated_at BEFORE UPDATE ON public.store_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
