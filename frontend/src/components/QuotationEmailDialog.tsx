import { useEffect, useState } from "react";
import { Mail, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  quotationId: string;
  quotationNumber?: string;
  customerEmail?: string;
  customerName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DraftResponse {
  to: string;
  subject: string;
  body: string;
  quotation_number: string;
}

export function QuotationEmailDialog({ quotationId, quotationNumber, customerEmail, open, onOpenChange }: Props) {
  const [to, setTo] = useState(customerEmail || "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [emlLoading, setEmlLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTo(customerEmail || "");
    setCc("");
    setSubject(`Quotation ${quotationNumber || ""}`.trim());
    setBody("");
    setLoading(true);
    fetch(`/api/quotations/${encodeURIComponent(quotationId)}/email-draft`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail || "Gagal menyiapkan email");
        return res.json() as Promise<DraftResponse>;
      })
      .then((draft) => {
        setTo(draft.to || customerEmail || "");
        setSubject(draft.subject || `Quotation ${quotationNumber || ""}`.trim());
        setBody(draft.body || "");
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Gagal menyiapkan email"))
      .finally(() => setLoading(false));
  }, [open, quotationId, quotationNumber, customerEmail]);

  const openThunderbird = () => {
    if (!to.trim()) { toast.error("Email customer belum tersedia"); return; }
    const params = new URLSearchParams({ subject, body });
    if (cc.trim()) params.set("cc", cc.trim());
    window.location.href = `mailto:${to.trim()}?${params.toString()}`;
    toast.success("Membuka aplikasi email default / Thunderbird");
  };

  const downloadEml = async () => {
    if (!to.trim()) { toast.error("Email customer belum tersedia"); return; }
    try {
      setEmlLoading(true);
      const response = await fetch(`/api/quotations/${encodeURIComponent(quotationId)}/email-eml`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), cc: cc.trim() || undefined, subject, body }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || `Gagal membuat email (${response.status})`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Quotation_${(quotationNumber || quotationId).replace(/[^a-zA-Z0-9-_]/g, "_")}.eml`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1500);
      toast.success("Email .EML dengan PDF quotation sudah disiapkan. Buka file tersebut dengan Thunderbird.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyiapkan email quotation");
    } finally {
      setEmlLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Kirim Quotation via Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium"><Paperclip className="h-4 w-4" /> Attachment</div>
            <p className="mt-1 text-xs text-muted-foreground">File .EML akan berisi quotation PDF sebagai attachment dan dapat dibuka langsung dengan Thunderbird. Browser tidak dapat menjalankan aplikasi Thunderbird secara langsung.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="quotation-email-to">To</Label><Input id="quotation-email-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@email.com" className="mt-1.5" /></div>
            <div><Label htmlFor="quotation-email-cc">CC</Label><Input id="quotation-email-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="opsional" className="mt-1.5" /></div>
          </div>
          <div><Label htmlFor="quotation-email-subject">Subject</Label><Input id="quotation-email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1.5" /></div>
          <div><Label htmlFor="quotation-email-body">Message</Label><Textarea id="quotation-email-body" value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="mt-1.5 font-sans" placeholder="Isi email..." /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button variant="outline" disabled={loading || emlLoading || !to.trim()} onClick={openThunderbird}>
            <Mail className="mr-2 h-4 w-4" /> Buka Email
          </Button>
          <Button disabled={loading || emlLoading || !to.trim()} onClick={downloadEml}>
            <Paperclip className="mr-2 h-4 w-4" /> {emlLoading ? "Menyiapkan..." : "Siapkan Thunderbird + PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
