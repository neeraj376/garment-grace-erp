import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ExternalLink, RotateCcw, Search, MessageCircle, Loader2, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ReturnDialog from "./ReturnDialog";
import EditInvoiceDialog from "./EditInvoiceDialog";

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  discount_amount: number;
  tax_amount: number;
  subtotal: number;
  payment_method: string;
  source: string;
  status: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  customer_id: string | null;
  customers: { name: string | null; mobile: string } | null;
}

interface Props {
  storeId: string | null;
  userId: string | undefined;
}

export default function InvoiceHistoryTab({ storeId, userId }: Props) {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [returnInvoice, setReturnInvoice] = useState<Invoice | null>(null);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "bulk" } | { type: "single"; invoice: Invoice } | null>(null);
  const [restoreStock, setRestoreStock] = useState(true);

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

  const fetchInvoices = async () => {
    if (!storeId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*, customers(name, mobile)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const invoiceData = (data as any) ?? [];
      setInvoices(invoiceData);

      // Fetch creator names for all unique created_by ids
      const creatorIds = [...new Set(invoiceData.map((i: Invoice) => i.created_by).filter(Boolean))] as string[];
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
    }
    setSelectedIds(new Set());
    setLoading(false);
  };

  useEffect(() => {
    fetchInvoices();
  }, [storeId]);

  const filtered = invoices.filter(inv =>
    inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    inv.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
    inv.customers?.mobile?.includes(search)
  );

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

  const restoreStockForInvoices = async (ids: string[]) => {
    // Fetch invoice items for these invoices (net quantity = quantity - returned_quantity)
    const { data: items, error } = await supabase
      .from("invoice_items")
      .select("product_id, quantity, returned_quantity, batch_id")
      .in("invoice_id", ids);
    if (error) throw error;
    if (!items || items.length === 0) return;

    // Group by product_id + batch_id and sum net qty
    const restorations: Record<string, { product_id: string; batch_id: string | null; qty: number }> = {};
    for (const item of items) {
      const netQty = item.quantity - (item.returned_quantity || 0);
      if (netQty <= 0) continue;
      const key = `${item.product_id}_${item.batch_id || "none"}`;
      if (!restorations[key]) restorations[key] = { product_id: item.product_id, batch_id: item.batch_id, qty: 0 };
      restorations[key].qty += netQty;
    }

    // Restore stock to batches
    for (const r of Object.values(restorations)) {
      if (r.batch_id) {
        await supabase.from("inventory_batches").update({ quantity: supabase.rpc ? undefined : undefined }).eq("id", r.batch_id);
        // Use raw increment via RPC-less approach: fetch then update
        const { data: batch } = await supabase.from("inventory_batches").select("quantity").eq("id", r.batch_id).single();
        if (batch) {
          await supabase.from("inventory_batches").update({ quantity: batch.quantity + r.qty }).eq("id", r.batch_id);
        }
      } else {
        // No batch_id recorded — create a new restoration batch
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

      const { error } = await supabase
        .from("invoices")
        .delete()
        .in("id", batch);
      if (error) throw error;
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

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case "partially_returned":
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-300">Partial Return</Badge>;
      case "fully_returned":
        return <Badge variant="destructive">Returned</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="section-title">Invoice History</CardTitle>
            {selectedIds.size > 0 && (
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by invoice #, customer name or mobile..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
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
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No invoices found</TableCell>
                </TableRow>
              ) : filtered.map(inv => (
                <TableRow key={inv.id} className={selectedIds.has(inv.id) ? "bg-muted/50" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(inv.id)}
                      onCheckedChange={() => toggleSelect(inv.id)}
                    />
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
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.created_by ? (creatorNames[inv.created_by] || "—") : "—"}
                  </TableCell>
                  <TableCell>{statusBadge(inv.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
          invoice={editInvoice}
          open={!!editInvoice}
          onClose={() => setEditInvoice(null)}
          onSuccess={() => { setEditInvoice(null); fetchInvoices(); }}
        />
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={open => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === "bulk"
                ? `This will permanently delete ${selectedIds.size} invoice(s) along with their line items and returns. This action cannot be undone.`
                : `This will permanently delete invoice ${deleteConfirm?.type === "single" ? deleteConfirm.invoice.invoice_number : ""} along with its line items and returns. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
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
