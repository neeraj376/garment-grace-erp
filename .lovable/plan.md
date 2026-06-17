## DTDC Shipping Integration

End-to-end DTDC API integration covering rates, serviceability, consignment (AWB) creation and tracking. Built around one secure edge function with multiple actions, called from the storefront checkout and the admin Online Orders tab.

### Secrets you'll need to add (I'll request them when you have them)

DTDC issues these to merchants via your account manager / KAM:

- `DTDC_API_KEY` — the `api-key` header value for softdata APIs (consignment + tracking + pincode)
- `DTDC_CUSTOMER_CODE` — your DTDC customer code (e.g. `GL000123`)
- `DTDC_USERNAME` + `DTDC_PASSWORD` — login credentials for the Rate Calculator API (separate from softdata)
- `DTDC_ORIGIN_PINCODE` — pickup pincode used for rate + serviceability
- `DTDC_ORIGIN_NAME`, `DTDC_ORIGIN_PHONE`, `DTDC_ORIGIN_ADDRESS`, `DTDC_ORIGIN_CITY`, `DTDC_ORIGIN_STATE` — pickup address used on consignments

Until these are added the integration code is wired up but will return a clear "credentials not configured" error.

### Edge function: `supabase/functions/dtdc/index.ts`

Single function with an `action` field in the body:

- `action: "serviceability"` → `{ pincode }` → returns `{ serviceable: boolean }`. Calls DTDC `pinCodeServiceable`.
- `action: "rate"` → `{ destination_pincode, weight_kg, invoice_value, payment_type }` → returns `{ serviceable, cost, service_type_id }`. Logs in to Rate Calculator API with username/password, caches the bearer token in memory for 6 h, calls the rate endpoint, picks the cheapest service.
- `action: "create_consignment"` → `{ order_id }` → loads the order + shipping address + items from the DB, posts a softdata consignment to DTDC, stores the returned `reference_number` / `awb_no` on the order, returns `{ awb_no, courier_name: "DTDC" }`.
- `action: "track"` → `{ awb_no }` → calls DTDC tracking, returns `{ status, scans: [...] }`.

CORS enabled, JWT not required (`verify_jwt = false` in `config.toml`). All DTDC base URLs and request bodies follow DTDC's official Plug-N-Play docs.

### Storefront checkout (`src/pages/shop/ShopCheckout.tsx`)

Replace the local `calculateDtdcShipping` call with a `supabase.functions.invoke("dtdc", { body: { action: "rate", ... } })` call (debounced on pincode change). Falls back to "Delivery not available" when the API returns non-serviceable. Removes dependence on selected state — pincode alone drives the rate.

### Admin (`src/components/invoicing/OnlineOrdersTab.tsx` + `EditOnlineOrderDialog.tsx`)

For each order without an AWB:

- Add a **"Create DTDC Shipment"** button → invokes `dtdc` with `create_consignment`, on success saves `awb_no` + `courier_name = "DTDC"` to the order, toasts the AWB.

For orders that have an AWB:

- Add a **"Track"** button → invokes `dtdc` with `track`, shows the latest status + scan history in a small dialog.
- Keep the existing 400 px shipping label flow unchanged.

### Build order

1. Write the `dtdc` edge function + add it to `config.toml`.
2. Update `ShopCheckout.tsx` to call the function for rates.
3. Add Create-Shipment + Track buttons in the Online Orders admin.
4. Ask you to add the DTDC secrets above; once provided I test end-to-end with a sample pincode.

After approval I'll implement steps 1–3 immediately, then prompt you for the secrets in step 4.