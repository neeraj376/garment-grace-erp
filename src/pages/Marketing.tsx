import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Send, Users, CheckCircle2, AlertCircle, Loader2, MessageCircle, Search } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

interface Stats {
  total: number;
  invited: number;
  pending: number;
}

interface MsgLog {
  id: string;
  phone: string;
  status: string;
  error: string | null;
  created_at: string;
  customer_id: string | null;
}

interface CustomerRow {
  id: string;
  name: string | null;
  mobile: string;
  group_invite_sent_at: string | null;
}

export default function Marketing() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats>({ total: 0, invited: 0, pending: 0 });
  const [logs, setLogs] = useState<MsgLog[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "invited">("all");
  const [resend, setResend] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!storeId) return;
    setLoading(true);
    const [{ count: total }, { count: invited }, { data: logRows }, { data: custRows }] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true })
        .eq("store_id", storeId).not("mobile", "is", null),
      supabase.from("customers").select("id", { count: "exact", head: true })
        .eq("store_id", storeId).not("group_invite_sent_at", "is", null),
      supabase.from("marketing_messages").select("*")
        .eq("store_id", storeId).order("created_at", { ascending: false }).limit(50),
      supabase.from("customers").select("id, name, mobile, group_invite_sent_at")
        .eq("store_id", storeId).not("mobile", "is", null).order("created_at", { ascending: false }),
    ]);
    const totalN = total ?? 0;
    const invitedN = invited ?? 0;
    setStats({ total: totalN, invited: invitedN, pending: Math.max(0, totalN - invitedN) });
    setLogs((logRows as MsgLog[]) || []);
    setCustomers((custRows as CustomerRow[]) || []);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [storeId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (filter === "pending" && c.group_invite_sent_at) return false;
      if (filter === "invited" && !c.group_invite_sent_at) return false;
      if (!q) return true;
      return (
        (c.name || "").toLowerCase().includes(q) ||
        (c.mobile || "").toLowerCase().includes(q)
      );
    });
  }, [customers, search, filter]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const toggleAllFiltered = () => {
    const next = new Set(selected);
    if (allFilteredSelected) {
      filtered.forEach((c) => next.delete(c.id));
    } else {
      filtered.forEach((c) => next.add(c.id));
    }
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const BATCH_SIZE = 50;

  const sendInBatches = async (customerIds: string[], skipInvited: boolean) => {
    if (customerIds.length === 0) {
      toast({ title: "Nothing to send", description: "No customers selected." });
      return;
    }
    setSending(true);
    let totalSent = 0, totalFailed = 0, totalProcessed = 0;
    const batches: string[][] = [];
    for (let i = 0; i < customerIds.length; i += BATCH_SIZE) {
      batches.push(customerIds.slice(i, i + BATCH_SIZE));
    }
    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        toast({
          title: `Sending batch ${i + 1} of ${batches.length}`,
          description: `${batch.length} customers in this batch...`,
        });
        const { data, error } = await supabase.functions.invoke("send-whatsapp-group-invite", {
          body: { mode: "selected", customerIds: batch, skipInvited },
        });
        if (error) throw error;
        if (data?.success === false) throw new Error(data.error || "Failed");
        totalSent += data.sent || 0;
        totalFailed += data.failed || 0;
        totalProcessed += data.total || 0;
      }
      toast({
        title: "Broadcast complete",
        description: `Sent: ${totalSent} • Failed: ${totalFailed} • Processed: ${totalProcessed} • Batches: ${batches.length}`,
      });
      await refresh();
    } catch (e: any) {
      toast({
        title: "Error during batched send",
        description: `${e.message}. Sent so far: ${totalSent}, Failed: ${totalFailed}`,
        variant: "destructive",
      });
      await refresh();
    } finally {
      setSending(false);
    }
  };

  const handleBulkSend = async () => {
    // Bulk = all pending customers (have mobile, not invited)
    const pendingIds = customers.filter((c) => !c.group_invite_sent_at).map((c) => c.id);
    await sendInBatches(pendingIds, true);
  };
  const handleSelectedSend = () =>
    sendInBatches(Array.from(selected), !resend);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-header">Marketing</h1>
          <p className="text-sm text-muted-foreground">Send WhatsApp group invites to customers</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={sending || stats.pending === 0} size="lg">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send to all {stats.pending} pending
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send WhatsApp group invite?</AlertDialogTitle>
              <AlertDialogDescription>
                A WhatsApp message inviting them to join your group will be sent to <b>{stats.pending}</b> customers
                who haven't received it yet. Customers already invited will be skipped automatically.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkSend}>Send now</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Customers with mobile</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-green-700"><CheckCircle2 className="h-4 w-4" /> Already invited</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.invited}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-amber-700"><MessageCircle className="h-4 w-4" /> Pending invite</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.pending}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Customers</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name or mobile"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-56"
              />
            </div>
            <div className="flex rounded-md border">
              {(["all", "pending", "invited"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "ghost"}
                  className="rounded-none capitalize first:rounded-l-md last:rounded-r-md"
                  onClick={() => setFilter(f)}
                >
                  {f}
                </Button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={resend} onCheckedChange={(v) => setResend(!!v)} />
              Resend to already invited
            </label>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={sending || selected.size === 0} size="sm">
                  {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Send to {selected.size} selected
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Send invite to selected customers?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Sending WhatsApp group invite to <b>{selected.size}</b> selected customer{selected.size === 1 ? "" : "s"}.
                    {resend
                      ? " Already-invited customers WILL be re-sent."
                      : " Already-invited customers will be skipped."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSelectedSend}>Send now</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">No customers match.</div>
          ) : (
            <div className="max-h-[480px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAllFiltered} />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invited on</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => toggleOne(c.id)}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
                      </TableCell>
                      <TableCell className="font-medium">{c.name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{c.mobile}</TableCell>
                      <TableCell>
                        {c.group_invite_sent_at ? (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-600">Invited</Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.group_invite_sent_at ? format(new Date(c.group_invite_sent_at), "dd MMM yyyy") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent messages</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No messages sent yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{format(new Date(l.created_at), "dd MMM, HH:mm")}</TableCell>
                    <TableCell className="font-mono text-xs">{l.phone}</TableCell>
                    <TableCell>
                      <Badge variant={l.status === "sent" ? "default" : "destructive"} className="capitalize">
                        {l.status === "sent" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertCircle className="h-3 w-3 mr-1" />}
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md truncate">{l.error || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
