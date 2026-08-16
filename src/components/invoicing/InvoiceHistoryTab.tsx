import { useEffect, useState, useMemo, useDeferredValue } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeErrorMessage } from "@/lib/invokeError";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExternalLink, RotateCcw, Search, MessageCircle, Loader2, Pencil, Trash2, Star, StickyNote, Mail, X, Printer, Truck, Send, RefreshCw } from "lucide-react";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from "docx";
import { saveAs } from "file-saver";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import ReturnDialog from "./ReturnDialog";
import EditInvoiceDialog from "./EditInvoiceDialog";
import { DTDC_SERVICE_OPTIONS, DEFAULT_DTDC_SERVICE } from "@/lib/dtdcServices";
import { buildDtdcLabelHtml } from "@/lib/shippingLabel";



interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  discount_amount: number;
  tax_amount: number;
  subtotal: number;
  payment_method: string;
  source: string;
  courier_name?: string | null;
  awb_no?: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  customer_id: string | null;
  shipping_name?: string | null;
  shipping_phone?: string | null;
  customers: { name: string | null; mobile: string; email?: string | null } | null;
}

interface Props {
  storeId: string | null;
  userId: string | undefined;
}

export default function InvoiceHistoryTab({ storeId, userId }: Props) {
  const { role, can_edit_invoices } = usePermissions();
  const isOwner = role === "owner";
  const canEdit = isOwner || can_edit_invoices;
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterNotes, setFilterNotes] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [returnInvoice, setReturnInvoice] = useState<Invoice | null>(null);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null);
  const [sendingTracking, setSendingTracking] = useState<string | null>(null);
  const [trackingStatus, setTrackingStatus] = useState<Record<string, { status: string; created_at: string }>>({});

  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [printingLabels, setPrintingLabels] = useState(false);
  const [printingLabelId, setPrintingLabelId] = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "bulk" } | { type: "single"; invoice: Invoice } | null>(null);
  const [restoreStock, setRestoreStock] = useState(true);
  const [noteDialog, setNoteDialog] = useState<Invoice | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [courierDialog, setCourierDialog] = useState<Invoice | null>(null);
  const [courierName, setCourierName] = useState("");
  const [awbNo, setAwbNo] = useState("");
  const [savingCourier, setSavingCourier] = useState(false);
  const [dtdcService, setDtdcService] = useState(DEFAULT_DTDC_SERVICE);
  const [dtdcBusy, setDtdcBusy] = useState(false);



  const getInvoiceImageUrl = (invoiceId: string) => {
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invoice-og/${invoiceId}?format=image`;
  };

  const handleSendWhatsApp = async (inv: Invoice) => {
    const phone = inv.customers?.mobile;
    if (!phone) {
      toast({ title: "Error", description: "No mobile number for this customer", variant: "destructive" });
      return;
    }
    setSendingWhatsApp(inv.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-invoice", {
        body: {
          phone,
          invoiceUrl: `${window.location.origin}/invoice/${inv.id}`,
          invoiceImageUrl: getInvoiceImageUrl(inv.id),
          customerName: inv.customers?.name || "Customer",
          invoiceNumber: inv.invoice_number,
          totalAmount: Number(inv.total_amount).toLocaleString("en-IN"),
        },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Failed to send");
      toast({ title: "WhatsApp sent!", description: `Invoice sent to ${phone}` });
    } catch (err: any) {
      toast({ title: "WhatsApp Error", description: err.message, variant: "destructive" });
    } finally {
      setSendingWhatsApp(null);
    }
  };

  const normPhone = (p?: string | null) => (p || "").replace(/\D/g, "").slice(-10);

  const fetchTrackingStatus = async () => {
    if (!storeId) return;
    const { data } = await supabase
      .from("marketing_messages")
      .select("phone, status, created_at")
      .eq("store_id", storeId)
      .eq("campaign", "order_tracking_details")
      .order("created_at", { ascending: false })
      .limit(2000);
    const map: Record<string, { status: string; created_at: string }> = {};
    (data || []).forEach((m: any) => {
      const key = normPhone(m.phone);
      if (key && !map[key]) map[key] = { status: m.status, created_at: m.created_at };
    });
    setTrackingStatus(map);
  };

  // "sent" is healthy; "failed" needs a retry; anything still pending/queued for
  // more than 15 minutes is considered stuck and also retryable.
  const trackingState = (inv: Invoice): "none" | "sent" | "retry" => {
    const rec = trackingStatus[normPhone(inv.shipping_phone || inv.customers?.mobile)];
    if (!rec) return "none";
    if (rec.status === "sent") return "sent";
    if (rec.status === "failed") return "retry";
    const ageMin = (Date.now() - new Date(rec.created_at).getTime()) / 60000;
    return ageMin > 15 ? "retry" : "sent";
  };

  const handleSendTracking = async (inv: Invoice, isRetry = false) => {
    const phone = inv.shipping_phone || inv.customers?.mobile;
    if (!phone) {
      toast({ title: "Error", description: "No mobile number for this customer", variant: "destructive" });
      return;
    }
    if (!inv.awb_no) {
      toast({ title: "No AWB", description: "Add courier / AWB first", variant: "destructive" });
      return;
    }
    setSendingTracking(inv.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-invoice", {
        body: {
          templateName: "order_shipped",
          phone,
          customerName: inv.customers?.name || "Customer",
          invoiceNumber: inv.invoice_number,
          courierName: inv.courier_name || "DTDC",
          awbNo: inv.awb_no,
        },
      });
      const ok = !error && data?.success !== false;
      if (storeId) {
        await supabase.from("marketing_messages").insert({
          store_id: storeId,
          phone,
          campaign: "order_tracking_details",
          status: ok ? "sent" : "failed",
          error: ok ? null : (error?.message || data?.error || "Unknown error"),
          created_by: userId || null,
        });
      }
      setTrackingStatus(prev => ({
        ...prev,
        [normPhone(phone)]: { status: ok ? "sent" : "failed", created_at: new Date().toISOString() },
      }));
      if (!ok) throw new Error(error?.message || data?.error || "Failed to send");
      toast({ title: isRetry ? "Tracking resent" : "Tracking sent", description: `Tracking sent to ${phone}` });
    } catch (err: any) {
      toast({ title: isRetry ? "Tracking resend failed" : "Tracking WhatsApp failed", description: err.message, variant: "destructive" });
    } finally {
      setSendingTracking(null);
    }
  };


  const handleSendEmail = async (inv: Invoice) => {
    let email = inv.customers?.email?.trim();
    if (!email) {
      email = window.prompt("Customer email not on file. Enter email to send invoice:")?.trim();
      if (!email) return;
    }
    setSendingEmail(inv.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: { invoice_id: inv.id, to_email: email },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Failed to send");
      toast({ title: "Email sent!", description: `Invoice emailed to ${email}` });
    } catch (err: any) {
      toast({ title: "Email Error", description: err.message, variant: "destructive" });
    } finally {
      setSendingEmail(null);
    }
  };

  const fetchInvoices = async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      // Paginate to bypass Supabase's default 1000-row cap
      const pageSize = 1000;
      let from = 0;
      const all: Invoice[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("invoices")
          .select("*, customers(name, mobile, email)")
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const chunk = (data as any[]) ?? [];
        all.push(...(chunk as Invoice[]));
        if (chunk.length < pageSize) break;
        from += pageSize;
      }
      setInvoices(all);

      const creatorIds = [...new Set(all.map((i: Invoice) => i.created_by).filter(Boolean))] as string[];
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", creatorIds);
        if (profiles) {
          const nameMap: Record<string, string> = {};
          profiles.forEach((p) => { nameMap[p.user_id] = p.full_name || "Staff"; });
          setCreatorNames(nameMap);
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSelectedIds(new Set());
    setLoading(false);
  };

  useEffect(() => {
    fetchInvoices();
    fetchTrackingStatus();
  }, [storeId]);


  const paymentMethods = useMemo(
    () => Array.from(new Set(invoices.map(i => i.payment_method).filter(Boolean))).sort(),
    [invoices]
  );

  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return invoices.filter(inv => {
      const matchesSearch =
        !q ||
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.customers?.name?.toLowerCase().includes(q) ||
        inv.customers?.mobile?.includes(q);
      const matchesNoteFilter = !filterNotes || (inv.notes && inv.notes.trim().length > 0);
      const matchesSource = sourceFilter === "all" || inv.source === sourceFilter;
      const matchesPayment = paymentFilter === "all" || inv.payment_method === paymentFilter;
      const created = new Date(inv.created_at).getTime();
      const matchesFrom = fromTs === null || created >= fromTs;
      const matchesTo = toTs === null || created <= toTs;
      return matchesSearch && matchesNoteFilter && matchesSource && matchesPayment && matchesFrom && matchesTo;
    });
  }, [invoices, deferredSearch, filterNotes, sourceFilter, paymentFilter, dateFrom, dateTo]);

  const ROW_RENDER_CAP = 200;
  const visibleInvoices = useMemo(() => filtered.slice(0, ROW_RENDER_CAP), [filtered]);


  const hasActiveFilters = !!(dateFrom || dateTo || sourceFilter !== "all" || paymentFilter !== "all" || filterNotes || search);
  const clearFilters = () => {
    setSearch(""); setDateFrom(""); setDateTo(""); setSourceFilter("all"); setPaymentFilter("all"); setFilterNotes(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(i => i.id)));
    }
  };

  const handleOpenNoteDialog = (inv: Invoice) => {
    setNoteDialog(inv);
    setNoteText(inv.notes || "");
  };
  const handleOpenCourierDialog = (inv: Invoice) => {
    setCourierDialog(inv);
    setCourierName(inv.courier_name || "");
    setAwbNo(inv.awb_no || "");
  };

  const handleSaveCourier = async () => {
    if (!courierDialog) return;
    setSavingCourier(true);
    try {
      const courier = courierName.trim();
      const awb = awbNo.trim();
      const { error } = await supabase
        .from("invoices")
        .update({ courier_name: courier || null, awb_no: awb || null })
        .eq("id", courierDialog.id);
      if (error) throw error;
      setInvoices(prev => prev.map(inv => inv.id === courierDialog.id ? { ...inv, courier_name: courier || null, awb_no: awb || null } : inv));
      toast({ title: "Courier details updated" });
      setCourierDialog(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingCourier(false);
    }
  };
  const handleCreateDtdcShipment = async () => {
    if (!courierDialog) return;
    setDtdcBusy(true);
    try {
      const manualAwb = awbNo.trim();
      const { data, error } = await supabase.functions.invoke("dtdc", {
        body: { action: "create_consignment_invoice", invoice_id: courierDialog.id, service_type_id: dtdcService, awb_no: manualAwb || undefined },
      });
      if (error || (data as any)?.error) throw new Error(await invokeErrorMessage(error, data));
      const awb = (data as any).awb_no as string;
      setCourierName("DTDC");
      setAwbNo(awb);
      setInvoices(prev => prev.map(inv => inv.id === courierDialog.id ? { ...inv, courier_name: "DTDC", awb_no: awb } : inv));
      toast({ title: `DTDC AWB assigned: ${awb}` });
    } catch (err: any) {
      if (!courierName.trim()) setCourierName("DTDC");
      toast({
        title: "DTDC could not assign an AWB",
        description: `${err.message || "Failed to create shipment"} — enter the AWB manually below and click Save.`,
        variant: "destructive",
      });
    } finally {
      setDtdcBusy(false);
    }
  };


  const handleSaveNote = async () => {
    if (!noteDialog) return;
    setSavingNote(true);

    try {
      const trimmed = noteText.trim();
      const { error } = await supabase
        .from("invoices")
        .update({ notes: trimmed || null })
        .eq("id", noteDialog.id);
      if (error) throw error;
      setInvoices(prev => prev.map(inv => inv.id === noteDialog.id ? { ...inv, notes: trimmed || null } : inv));
      toast({ title: "Note saved" });
      setNoteDialog(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingNote(false);
    }
  };

  const handleRemoveNote = async () => {
    if (!noteDialog) return;
    setSavingNote(true);
    try {
      const { error } = await supabase
        .from("invoices")
        .update({ notes: null })
        .eq("id", noteDialog.id);
      if (error) throw error;
      setInvoices(prev => prev.map(inv => inv.id === noteDialog.id ? { ...inv, notes: null } : inv));
      toast({ title: "Note removed" });
      setNoteDialog(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingNote(false);
    }
  };

  const restoreStockForInvoices = async (ids: string[]) => {
    const { data: items, error } = await supabase
      .from("invoice_items")
      .select("product_id, quantity, returned_quantity, batch_id")
      .in("invoice_id", ids);
    if (error) throw error;
    if (!items || items.length === 0) return;

    const restorations: Record<string, { product_id: string; batch_id: string | null; qty: number }> = {};
    for (const item of items) {
      const netQty = item.quantity - (item.returned_quantity || 0);
      if (netQty <= 0) continue;
      const key = `${item.product_id}_${item.batch_id || "none"}`;
      if (!restorations[key]) restorations[key] = { product_id: item.product_id, batch_id: item.batch_id, qty: 0 };
      restorations[key].qty += netQty;
    }

    for (const r of Object.values(restorations)) {
      if (r.batch_id) {
        const { data: batch } = await supabase.from("inventory_batches").select("quantity").eq("id", r.batch_id).single();
        if (batch) {
          await supabase.from("inventory_batches").update({ quantity: batch.quantity + r.qty }).eq("id", r.batch_id);
        }
      } else {
        await supabase.from("inventory_batches").insert({
          product_id: r.product_id,
          store_id: storeId!,
          quantity: r.qty,
          buying_price: 0,
          batch_number: "restored",
          supplier: "Invoice deletion restore",
        });
      }
    }
  };

  const deleteInvoicesByIds = async (ids: string[], shouldRestoreStock: boolean) => {
    if (shouldRestoreStock) {
      await restoreStockForInvoices(ids);
    }

    const batchSize = 100;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const { error: returnsError } = await supabase
        .from("invoice_returns")
        .delete()
        .in("invoice_id", batch);
      if (returnsError) throw returnsError;

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .delete()
        .in("invoice_id", batch);
      if (itemsError) throw itemsError;

      const { data: deletedRows, error } = await supabase
        .from("invoices")
        .delete()
        .in("id", batch)
        .select("id");
      if (error) throw error;
      if (!deletedRows || deletedRows.length !== batch.length) {
        throw new Error(
          `Delete blocked: only owners can delete invoices. ${deletedRows?.length ?? 0} of ${batch.length} rows were removed.`
        );
      }
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const ids = deleteConfirm.type === "bulk"
        ? Array.from(selectedIds)
        : [deleteConfirm.invoice.id];

      await deleteInvoicesByIds(ids, restoreStock);

      toast({
        title: "Deleted",
        description: `${ids.length} invoice(s) deleted successfully`,
      });
      fetchInvoices();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const resolveAddresses = async (selected: Invoice[]) => {
      const addrByInvoiceId: Record<string, any> = {};


      // Prefer address saved directly on the invoice (new online invoices).
      selected.forEach(inv => {
        const anyInv = inv as any;
        if (anyInv.shipping_address_line1) {
          addrByInvoiceId[inv.id] = {
            name: anyInv.shipping_name,
            phone: anyInv.shipping_phone,
            alt_phone: anyInv.shipping_phone_alt,
            address_line1: anyInv.shipping_address_line1,
            address_line2: anyInv.shipping_address_line2,
            city: anyInv.shipping_city,
            state: anyInv.shipping_state,
            pincode: anyInv.shipping_pincode,
          };
        }
      });

      // Legacy fallback: online orders share an invoice_number/order_number
      // suffix (INV-XXXX ↔ ORD-XXXX) with the address on the order.
      const suffixes = selected
        .filter(i => !addrByInvoiceId[i.id])
        .map(i => (i.invoice_number || "").slice(4))
        .filter(Boolean);

      if (suffixes.length > 0) {
        const orNumbers = suffixes.map(s => `ORD-${s}`);
        const { data: ordersData } = await supabase
          .from("orders")
          .select("order_number, shipping_address_id")
          .in("order_number", orNumbers);
        const addrIds = [...new Set((ordersData || []).map((o: any) => o.shipping_address_id).filter(Boolean))] as string[];
        const addrById: Record<string, any> = {};
        if (addrIds.length > 0) {
          const { data: addrs } = await supabase
            .from("shipping_addresses")
            .select("id, name, phone, address_line1, address_line2, city, state, pincode")
            .in("id", addrIds);
          (addrs || []).forEach((a: any) => { addrById[a.id] = a; });
        }
        const suffixToAddr: Record<string, any> = {};
        (ordersData || []).forEach((o: any) => {
          const s = (o.order_number || "").slice(4);
          if (s && o.shipping_address_id && addrById[o.shipping_address_id]) {
            suffixToAddr[s] = addrById[o.shipping_address_id];
          }
        });
        selected.forEach(inv => {
          const s = (inv.invoice_number || "").slice(4);
          if (suffixToAddr[s]) addrByInvoiceId[inv.id] = suffixToAddr[s];
        });
      }

      // Fallback: match invoice's POS customer by mobile to a shop_customer
      // and pull their default shipping address.
      const remainingPhones = [...new Set(
        selected
          .filter(i => !addrByInvoiceId[i.id] && i.customers?.mobile)
          .map(i => (i.customers!.mobile || "").replace(/\D/g, "").slice(-10))
          .filter(Boolean)
      )];
      if (remainingPhones.length > 0) {
        // Match with or without country code by comparing last 10 digits
        const { data: shopCustomers } = await supabase
          .from("shop_customers")
          .select("id, phone");
        const phoneToShopIds: Record<string, string[]> = {};
        (shopCustomers || []).forEach((sc: any) => {
          const last10 = (sc.phone || "").replace(/\D/g, "").slice(-10);
          if (!last10) return;
          (phoneToShopIds[last10] ||= []).push(sc.id);
        });
        const neededShopIds = [...new Set(
          remainingPhones.flatMap(p => phoneToShopIds[p] || [])
        )];
        const shopIdToAddr: Record<string, any> = {};
        if (neededShopIds.length > 0) {
          const { data: addrs } = await supabase
            .from("shipping_addresses")
            .select("customer_id, name, phone, address_line1, address_line2, city, state, pincode, is_default")
            .in("customer_id", neededShopIds);
          (addrs || []).forEach((a: any) => {
            const existing = shopIdToAddr[a.customer_id];
            if (!existing || a.is_default) shopIdToAddr[a.customer_id] = a;
          });
        }
        selected.forEach(inv => {
          if (addrByInvoiceId[inv.id]) return;
          const last10 = (inv.customers?.mobile || "").replace(/\D/g, "").slice(-10);
          if (!last10) return;
          const shopIds = phoneToShopIds[last10] || [];
          for (const sid of shopIds) {
            if (shopIdToAddr[sid]) { addrByInvoiceId[inv.id] = shopIdToAddr[sid]; break; }
          }
        });
      }

    return addrByInvoiceId;
  };

  const buildLabelHtml = (inv: Invoice, addr: any) => {
    const name = addr?.name || inv.customers?.name || "Walk-in Customer";
    const phone = addr?.phone || inv.customers?.mobile || "—";
    const date = new Date(inv.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    return buildDtdcLabelHtml({
      awb: inv.awb_no,
      courier: inv.courier_name,
      serviceType: (inv as any).dtdc_service_type || undefined,
      referenceNo: inv.invoice_number,
      date,
      paymentMode: "PREPAID",
      pieces: 1,
      consignee: {
        name,
        phone,
        altPhone: addr?.alt_phone || (inv as any).shipping_phone_alt || "",
        line1: addr?.address_line1 || (addr ? "" : "Address not available"),
        line2: addr?.address_line2 || "",
        city: addr?.city || "",
        state: addr?.state || "",
        pincode: addr?.pincode || "",
      },
    });
  };


  const handlePrintSingleLabel = async (inv: Invoice) => {
    setPrintingLabelId(inv.id);
    try {
      // Always pull the latest courier / AWB straight from the DB so the label is never stale
      let live = inv;
      const { data: fresh } = await supabase
        .from("invoices")
        .select("courier_name, awb_no, shipping_phone_alt")
        .eq("id", inv.id)
        .maybeSingle();
      if (fresh) {
        live = { ...inv, courier_name: fresh.courier_name, awb_no: fresh.awb_no, shipping_phone_alt: (fresh as any).shipping_phone_alt } as Invoice;
        setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, courier_name: fresh.courier_name, awb_no: fresh.awb_no } : i));
      }
      if (!live.awb_no) {
        toast({ title: "No AWB assigned", description: "Printing label without AWB — add courier / AWB to include it.", });
      }
      const addrMap = await resolveAddresses([live]);
      const html = buildLabelHtml(live, addrMap[live.id] || null);

      const printWindow = window.open("", "_blank", "width=500,height=700");
      if (!printWindow) {
        toast({ title: "Popup blocked", description: "Please allow popups to print labels", variant: "destructive" });
        return;
      }
      printWindow.document.write(`<!DOCTYPE html><html><head><title>Shipping Label — ${inv.invoice_number}</title>
        <style>@page{size:4in 6in;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial, sans-serif;padding:24px}@media print{body{padding:0}}</style>
        </head><body>${html}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); }, 200);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPrintingLabelId(null);
    }
  };

  const handlePrintShippingLabels = async () => {
    const selected = invoices.filter(i => selectedIds.has(i.id));
    if (selected.length === 0) return;
    setPrintingLabels(true);
    try {
      const addrByInvoiceId = await resolveAddresses(selected);

      const labelChildren: Paragraph[] = [];

      selected.forEach((inv, idx) => {
        const addr = addrByInvoiceId[inv.id] || null;
        const name = addr?.name || inv.customers?.name || "Walk-in Customer";
        const altMobile = addr?.alt_phone || (inv as any).shipping_phone_alt || "";
        const mobile = [addr?.phone || inv.customers?.mobile || "—", altMobile].filter(Boolean).join(" / ");
        const addressParts = addr
          ? [addr.address_line1, addr.address_line2, [addr.city, addr.state, addr.pincode].filter(Boolean).join(", ")].filter(Boolean)
          : [];
        const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : "Address not available";

        const border = { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 6 };
        const awb = inv.awb_no || "—";
        const courier = inv.courier_name || "—";
        labelChildren.push(
          new Paragraph({
            spacing: { before: 120, after: 60 },
            border: { top: border, bottom: border, left: border, right: border },
            children: [
              new TextRun({ text: `Invoice: ${inv.invoice_number}`, bold: true, size: 20 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: "Courier: ", bold: true, size: 22 }),
              new TextRun({ text: courier, size: 22 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: "AWB No: ", bold: true, size: 22 }),
              new TextRun({ text: awb, size: 22 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: "Name: ", bold: true, size: 24 }),
              new TextRun({ text: name, size: 24 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: "Mobile: ", bold: true, size: 24 }),
              new TextRun({ text: mobile, size: 24 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({ text: "Complete Address: ", bold: true, size: 24 }),
              new TextRun({ text: fullAddress, size: 24 }),
            ],
          }),
          new Paragraph({
            spacing: { before: 60, after: 200 },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 4 } },
            children: [
              new TextRun({ text: "Originee Address: ", bold: true, size: 20 }),
              new TextRun({ text: "I132, Sector 50, South City 2, Gurugram 122018", size: 20 }),
            ],
          }),
        );
        if (idx < selected.length - 1) {
          labelChildren.push(new Paragraph({
            spacing: { after: 200 },
            border: { bottom: { style: BorderStyle.DASHED, size: 6, color: "CCCCCC", space: 6 } },
            children: [new TextRun({ text: "" })],
          }));
        }
      });

      const doc = new Document({
        styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
        sections: [{
          properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
          children: [
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
              spacing: { after: 240 },
              children: [new TextRun({ text: "Shipping Labels", bold: true, size: 32 })],
            }),
            ...labelChildren,
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      const ts = new Date().toISOString().slice(0, 10);
      saveAs(blob, `shipping-labels-${ts}.docx`);
      toast({ title: "Document created", description: `${selected.length} shipping label(s) generated` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPrintingLabels(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case "partially_returned":
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-300">Partial Return</Badge>;
      case "fully_returned":
        return <Badge variant="destructive">Returned</Badge>;
      case "pending_address":
        return <Badge variant="outline" className="text-blue-600 border-blue-300">Pending Address</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const invoiceRows = useMemo(() => (
    <>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No invoices found</TableCell>
                </TableRow>
              ) : visibleInvoices.map(inv => (
                <TableRow key={inv.id} className={selectedIds.has(inv.id) ? "bg-muted/50" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(inv.id)}
                      onCheckedChange={() => toggleSelect(inv.id)}
                    />
                  </TableCell>
                  <TableCell className="px-1">
                    {inv.notes && inv.notes.trim() ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Star className="h-4 w-4 text-red-500 fill-red-500 cursor-pointer" onClick={() => handleOpenNoteDialog(inv)} />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">{inv.notes}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>
                    <div>{inv.customers?.name || "Walk-in"}</div>
                    {inv.customers?.mobile && (
                      <div className="text-xs text-muted-foreground">{inv.customers.mobile}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(inv.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </TableCell>
                  <TableCell className="text-right font-medium">₹{Number(inv.total_amount).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="capitalize">{inv.payment_method}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{inv.source === "whatsapp" ? "WhatsApp" : inv.source}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1">
                      {inv.courier_name || inv.awb_no ? (
                        <div>
                          <div className="font-medium">{inv.courier_name || "—"}</div>
                          {inv.awb_no && <div className="text-xs text-muted-foreground">AWB: {inv.awb_no}</div>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {inv.source === "whatsapp" && canEdit && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleOpenCourierDialog(inv)}>
                                <Truck className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{inv.courier_name || inv.awb_no ? "Update courier / AWB" : "Add courier / AWB"}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {inv.created_by ? (creatorNames[inv.created_by] || "—") : "—"}
                  </TableCell>
                  <TableCell>{statusBadge(inv.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {inv.source === "whatsapp" && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={printingLabelId === inv.id}
                                onClick={() => handlePrintSingleLabel(inv)}
                              >
                                {printingLabelId === inv.id
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <Printer className="h-4 w-4" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Print shipping label</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => handleOpenNoteDialog(inv)}>
                              <StickyNote className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{inv.notes ? "Edit note" : "Add note"}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => window.open(`${window.location.origin}/invoice/${inv.id}`, "_blank")}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View invoice</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {canEdit && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setEditInvoice(inv)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit invoice</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {inv.customers?.mobile && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => handleSendWhatsApp(inv)} disabled={sendingWhatsApp === inv.id}>
                                {sendingWhatsApp === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4 text-green-600" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Send on WhatsApp</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {inv.source === "whatsapp" && inv.awb_no && inv.customers?.mobile && (() => {
                        const state = trackingState(inv);
                        const retry = state === "retry";
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleSendTracking(inv, retry)} disabled={sendingTracking === inv.id}>
                                  {sendingTracking === inv.id
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : retry
                                      ? <RefreshCw className="h-4 w-4 text-amber-600" />
                                      : <Send className={`h-4 w-4 ${state === "sent" ? "text-muted-foreground" : "text-emerald-600"}`} />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {retry
                                  ? `Resend tracking — last attempt failed or stuck (AWB ${inv.awb_no})`
                                  : state === "sent"
                                    ? `Tracking already sent — send again (AWB ${inv.awb_no})`
                                    : `Send tracking on WhatsApp (AWB ${inv.awb_no})`}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => handleSendEmail(inv)} disabled={sendingEmail === inv.id}>
                              {sendingEmail === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 text-blue-600" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{inv.customers?.email ? `Email invoice to ${inv.customers.email}` : "Send invoice via email"}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {inv.status !== "fully_returned" && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setReturnInvoice(inv)}>
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Process return</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {isOwner && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm({ type: "single", invoice: inv })}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete invoice</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
    </>
  ), [loading, filtered, visibleInvoices, selectedIds, sendingWhatsApp, sendingTracking, sendingEmail, printingLabelId, creatorNames, isOwner, trackingStatus]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="section-title">Invoice History</CardTitle>
            {selectedIds.size > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrintShippingLabels}
                  disabled={printingLabels}
                >
                  {printingLabels ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
                  Print Shipping Labels ({selectedIds.size})
                </Button>
                {isOwner && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteConfirm({ type: "bulk" })}
                    disabled={deleting}
                  >
                    {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    Delete {selectedIds.size} selected
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice #, customer name or mobile..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={filterNotes ? "default" : "outline"}
                      size="icon"
                      onClick={() => setFilterNotes(!filterNotes)}
                    >
                      <Star className={`h-4 w-4 ${filterNotes ? "fill-current" : ""}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{filterNotes ? "Show all invoices" : "Show only invoices with notes"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">From</span>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-[150px]" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">To</span>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-[150px]" />
              </div>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                </SelectContent>
              </Select>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Payment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  {paymentMethods.map(pm => (
                    <SelectItem key={pm} value={pm} className="capitalize">{pm}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {filtered.length} of {invoices.length} invoices
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-8"></TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Courier / AWB</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoiceRows}
            </TableBody>
          </Table>
          {filtered.length > visibleInvoices.length && (
            <p className="text-xs text-muted-foreground mt-2">
              Showing first {visibleInvoices.length} of {filtered.length} invoices — refine the filters to narrow results.
            </p>
          )}

        </CardContent>
      </Card>

      {returnInvoice && (
        <ReturnDialog
          invoice={returnInvoice}
          storeId={storeId!}
          userId={userId!}
          open={!!returnInvoice}
          onClose={() => setReturnInvoice(null)}
          onSuccess={() => { setReturnInvoice(null); fetchInvoices(); }}
        />
      )}

      {editInvoice && (
        <EditInvoiceDialog
          key={editInvoice.id}
          invoice={editInvoice}
          open={!!editInvoice}
          onClose={() => setEditInvoice(null)}
          onSuccess={() => { setEditInvoice(null); fetchInvoices(); }}
        />
      )}

      {/* Courier / AWB Dialog */}
      <Dialog open={!!courierDialog} onOpenChange={open => { if (!open) setCourierDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Courier Details — {courierDialog?.invoice_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Courier Name</label>
              <Input value={courierName} onChange={e => setCourierName(e.target.value)} placeholder="Courier partner" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">AWB Number</label>
              <Input value={awbNo} onChange={e => setAwbNo(e.target.value)} placeholder="Tracking / AWB number" />
              <p className="text-xs text-muted-foreground">
                If DTDC can't allot an AWB automatically, type the AWB from the DTDC portal here and click Save.
              </p>
            </div>
            <div className="space-y-1 border-t pt-3">
              <label className="text-sm font-medium">DTDC Service Option</label>
              <Select value={dtdcService} onValueChange={setDtdcService}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DTDC_SERVICE_OPTIONS.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.label} — {s.eta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="secondary"
                className="w-full mt-2 gap-1.5"
                disabled={dtdcBusy}
                onClick={handleCreateDtdcShipment}
              >
                {dtdcBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                Create DTDC Shipment & Assign AWB
              </Button>
              <p className="text-xs text-muted-foreground">
                Uses the shipping address saved on this invoice.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleSaveCourier} disabled={savingCourier}>
              {savingCourier ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}

      <Dialog open={!!noteDialog} onOpenChange={open => { if (!open) setNoteDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invoice Note — {noteDialog?.invoice_number}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Add a note for this invoice..."
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={4}
          />
          <DialogFooter className="flex gap-2 sm:justify-between">
            {noteDialog?.notes && (
              <Button variant="destructive" size="sm" onClick={handleRemoveNote} disabled={savingNote}>
                <Trash2 className="h-4 w-4 mr-1" /> Remove Note
              </Button>
            )}
            <Button onClick={handleSaveNote} disabled={savingNote}>
              {savingNote ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={open => { if (!open) { setDeleteConfirm(null); setRestoreStock(true); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === "bulk"
                ? `This will permanently delete ${selectedIds.size} invoice(s) along with their line items and returns. This action cannot be undone.`
                : `This will permanently delete invoice ${deleteConfirm?.type === "single" ? deleteConfirm.invoice.invoice_number : ""} along with its line items and returns. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="restore-stock"
              checked={restoreStock}
              onCheckedChange={(checked) => setRestoreStock(checked === true)}
            />
            <label htmlFor="restore-stock" className="text-sm font-medium leading-none cursor-pointer">
              Return items back to inventory
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
