import { useStore } from "@/hooks/useStore";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, History } from "lucide-react";
import NewInvoiceTab from "@/components/invoicing/NewInvoiceTab";
import InvoiceHistoryTab from "@/components/invoicing/InvoiceHistoryTab";

export default function Invoicing() {
  const { storeId } = useStore();
  const { user } = useAuth();

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="page-header">Invoicing</h1>

      <Tabs defaultValue="new" className="w-full">
        <TabsList>
          <TabsTrigger value="new" className="gap-1.5">
            <Plus className="h-4 w-4" /> New Invoice
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" /> Invoice History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-4" forceMount className2="data-[state=inactive]:hidden">
          <NewInvoiceTab storeId={storeId} userId={user?.id} />
        </TabsContent>

        <TabsContent value="history" className="mt-4" forceMount className2="data-[state=inactive]:hidden">
          <InvoiceHistoryTab storeId={storeId} userId={user?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
