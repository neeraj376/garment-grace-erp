import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Send, Users, CheckCircle2, AlertCircle, Loader2, MessageCircle } from "lucide-react";
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

export default function Marketing() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats>({ total: 0, invited: 0, pending: 0 });
  const [logs, setLogs] = useState<MsgLog[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!storeId) return;
    setLoading(true);
    const [{ count: total }, { count: invited }, { data: logRows }] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true })
        .eq("store_id", storeId).not("mobile", "is", null),
      supabase.from("customers").select("id", { count: "exact", head: true })
        .eq("store_id", storeId).not("group_invite_sent_at", "is", null),
      supabase.from("marketing_messages").select("*")
        .eq("store_id", storeId).order("created_at", { ascending: false }).limit(50),
    ]);
    const totalN = total ?? 0;
    const invitedN = invited ?? 0;
    setStats({ total: totalN, invited: invitedN, pending: Math.max(0, totalN - invitedN) });
    setLogs((logRows as MsgLog[]) || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [storeId]);

  const handleBulkSend = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-group-invite", {
        body: { mode: "bulk" },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Failed");
      toast({
        title: "Broadcast complete",
        description: `Sent: ${data.sent} • Failed: ${data.failed} • Total: ${data.total}`,
      });
      await refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

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
              Send invite to {stats.pending} customer{stats.pending === 1 ? "" : "s"}
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
