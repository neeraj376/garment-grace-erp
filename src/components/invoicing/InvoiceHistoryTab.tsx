import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [returnInvoice, setReturnInvoice] = useState<Invoice | null>(null);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

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
      setInvoices((data as any) ?? []);
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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`Are you sure you want to delete ${selectedIds.size} invoice(s)? This will also remove their line items. This action cannot be undone.`);
    if (!confirmed) return;

    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const batchSize = 100;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        // Delete invoice items first
        const { error: itemsError } = await supabase
          .from("invoice_items")
          .delete()
          .in("invoice_id", batch);
        if (itemsError) throw itemsError;

        // Delete invoices
        const { error } = await supabase
          .from("invoices")
          .delete()
          .in("id", batch);
        if (error) throw error;
      }
      toast({ title: "Deleted", description: `${selectedIds.size} invoice(s) deleted successfully` });
      fetchInvoices();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleSingleDelete = async (inv: Invoice) => {
    const confirmed = window.confirm(`Delete invoice ${inv.invoice_number}? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await supabase.from("invoice_items").delete().eq("invoice_id", inv.id);
      const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
      if (error) throw error;
      toast({ title: "Invoice deleted" });
      fetchInvoices();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
                onClick={handleBulkDelete}
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
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No invoices found</TableCell>
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
                            <Button variant="ghost" size="icon" onClick={() => handleSingleDelete(inv)}>
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
    </>
  );
}
