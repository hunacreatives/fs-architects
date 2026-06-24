import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useDemo } from '@/contexts/DemoContext';
import { DEMO_INVOICES } from '@/lib/demoData';

const fmt = (n: number | null, currency: 'PHP' | 'USD' = 'PHP') =>
  n == null ? '—' : new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-PH', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);

interface InvoiceLog {
  id: number;
  invoice_number: string;
  project_id: number | null;
  client_name: string;
  project_name: string;
  sent_to: string;
  sent_cc: string | null;
  subject: string | null;
  contract_price: number | null;
  total_paid: number | null;
  balance: number | null;
  line_items: { description: string; amount: string }[] | null;
  show_payments: boolean;
  currency?: 'PHP' | 'USD';
  sent_at: string;
  settled: boolean;
  settled_at: string | null;
}

interface InvoiceEditSource {
  id: number;
  contact_email: string | null;
  client_name: string;
  project_name: string;
  service: string | null;
  contract_price: number;
  start_date: string | null;
  deadline: string | null;
  notes: string | null;
  hub_project_payments: { amount: number; paid_at: string; notes: string | null }[];
}

interface InvoicePaymentLink {
  id: string;
  to_email: string;
  due_date: string | null;
  line_items: { description: string; amount: string }[] | null;
  payment_terms: string | null;
  reference: string | null;
}

interface ReceiptLog {
  id: number;
  project_id: number | null;
  client_name: string;
  project_name: string;
  payment_amount: number;
  paid_at: string | null;
  sent_to: string;
  total_paid: number | null;
  balance: number | null;
  receipt_url: string | null;
  sent_at: string;
}

interface ScheduledInvoice {
  id: number;
  invoice_number: string;
  client_name: string;
  project_name: string;
  project_id: number | null;
  to_email: string;
  cc_email: string | null;
  subject: string | null;
  scheduled_for: string;
  due_date: string | null;
  status: string;
  sent_at: string | null;
  cancelled_at: string | null;
  last_error: string | null;
  line_items: { description: string; amount: string }[] | null;
  payments: { amount: number; paid_at: string; notes: string | null }[] | null;
  show_payments: boolean;
  amount_requested: number | null;
}

interface PaymentProof {
  id: number;
  project_id: number | null;
  invoice_number: string;
  client_name: string;
  project_name: string;
  payer_name: string;
  payer_email: string | null;
  payment_channel: string;
  amount: number | null;
  reference_number: string | null;
  notes: string | null;
  proof_url: string | null;
  submitted_at: string;
  verified: boolean;
  verified_at: string | null;
}

type Tab = 'invoices' | 'scheduled' | 'proofs' | 'receipts';

export default function InvoiceLogPage() {
  const { isDemo } = useDemo();
  const [tab, setTab] = useState<Tab>('invoices');
  const [invoices, setInvoices] = useState<InvoiceLog[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledInvoice[]>([]);
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [receipts, setReceipts] = useState<ReceiptLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [verifying, setVerifying] = useState<Set<number>>(new Set());
  const [resending, setResending] = useState<Set<number>>(new Set());
  const [editingInvoice, setEditingInvoice] = useState<InvoiceLog | null>(null);
  const [editingProject, setEditingProject] = useState<InvoiceEditSource | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editShowPayments, setEditShowPayments] = useState(true);
  const [editLineItems, setEditLineItems] = useState<{ description: string; amount: string }[]>([]);
  const [editForm, setEditForm] = useState({
    email: '',
    cc: '',
    subject: '',
    issue_date: '',
    due_date: '',
    currency: 'PHP' as 'PHP' | 'USD',
    bill_to_name: '',
    bill_to_address: '',
    reference: '',
    payment_terms: '',
    customer_notes: '',
    payment_instructions: '',
    amount_requested: '',
  });

  useEffect(() => {
    if (isDemo) {
      setInvoices(DEMO_INVOICES as unknown as InvoiceLog[]);
      setScheduled([]);
      setProofs([]);
      setReceipts([]);
      setLoading(false);
      return;
    }
    const fetch = async () => {
      setLoading(true);
      const [iRes, sRes, pRes, rRes] = await Promise.all([
        supabase.from('hub_invoice_log').select('*').order('id', { ascending: false }),
        supabase.from('hub_scheduled_invoices').select('*').order('id', { ascending: false }),
        supabase.from('hub_payment_proof_submissions').select('*').order('id', { ascending: false }),
        supabase.from('hub_payment_receipt_log').select('*').order('id', { ascending: false }),
      ]);
      setInvoices((iRes.data as InvoiceLog[]) ?? []);
      setScheduled((sRes.data as ScheduledInvoice[]) ?? []);
      setProofs((pRes.data as PaymentProof[]) ?? []);
      setReceipts((rRes.data as ReceiptLog[]) ?? []);
      setLoading(false);
    };
    fetch();
  }, [isDemo]);

  const q = search.toLowerCase();
  const filteredInvoices = invoices.filter(i =>
    i.client_name.toLowerCase().includes(q) ||
    i.project_name.toLowerCase().includes(q) ||
    i.invoice_number.includes(q) ||
    i.sent_to.toLowerCase().includes(q)
  );
  const activeInvoices = filteredInvoices.filter(i => !i.settled);
  const paidInvoices = filteredInvoices.filter(i => i.settled);
  const filteredReceipts = receipts.filter(r =>
    r.client_name.toLowerCase().includes(q) ||
    r.project_name.toLowerCase().includes(q) ||
    r.sent_to.toLowerCase().includes(q)
  );
  const filteredProofs = proofs.filter(p =>
    p.client_name.toLowerCase().includes(q) ||
    p.project_name.toLowerCase().includes(q) ||
    p.invoice_number.includes(q) ||
    p.payer_name.toLowerCase().includes(q) ||
    (p.payer_email || '').toLowerCase().includes(q)
  );
  const filteredScheduled = scheduled.filter(s =>
    s.client_name.toLowerCase().includes(q) ||
    s.project_name.toLowerCase().includes(q) ||
    s.invoice_number.includes(q) ||
    s.to_email.toLowerCase().includes(q)
  );

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const fmtDateTime = (s: string) =>
    new Date(s).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const closeEditModal = () => {
    if (editSaving) return;
    setEditingInvoice(null);
    setEditingProject(null);
    setEditLoading(false);
    setEditSaving(false);
    setEditError(null);
    setEditShowPayments(true);
    setEditLineItems([]);
    setEditForm({
      email: '',
      cc: '',
      subject: '',
      issue_date: '',
      due_date: '',
      currency: 'PHP',
      bill_to_name: '',
      bill_to_address: '',
      reference: '',
      payment_terms: '',
      customer_notes: '',
      payment_instructions: '',
      amount_requested: '',
    });
  };

  const openEditInvoice = async (inv: InvoiceLog) => {
    if (inv.settled) return;
    setEditingInvoice(inv);
    setEditLoading(true);
    setEditError(null);
    try {
      const projectPromise = inv.project_id
        ? supabase
            .from('hub_projects')
            .select('id, contact_email, client_name, project_name, service, contract_price, start_date, deadline, notes, hub_project_payments(amount, paid_at, notes)')
            .eq('id', inv.project_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as any);

      const linkQuery = supabase
        .from('hub_invoice_payment_links')
        .select('id, to_email, due_date, line_items, payment_terms, reference')
        .eq('invoice_number', inv.invoice_number)
        .order('created_at', { ascending: false })
        .limit(1);
      const linkPromise = inv.project_id ? linkQuery.eq('project_id', inv.project_id).maybeSingle() : linkQuery.maybeSingle();

      const [{ data: project }, { data: paymentLink }] = await Promise.all([projectPromise, linkPromise]);
      const projectData = (project as InvoiceEditSource | null) ?? null;
      const linkData = (paymentLink as InvoicePaymentLink | null) ?? null;
      setEditingProject(projectData);
      setEditShowPayments(inv.show_payments);
      setEditLineItems(
        (inv.line_items && inv.line_items.length > 0
          ? inv.line_items
          : linkData?.line_items && linkData.line_items.length > 0
            ? linkData.line_items
            : [{ description: projectData?.service ?? projectData?.project_name ?? inv.project_name, amount: String(inv.contract_price ?? inv.balance ?? 0) }])
          .map((item) => ({ description: item.description ?? '', amount: String(item.amount ?? '') }))
      );
      setEditForm({
        email: inv.sent_to || projectData?.contact_email || linkData?.to_email || '',
        cc: inv.sent_cc || '',
        subject: inv.subject || `Invoice #${inv.invoice_number.padStart(4, '0')} — ${inv.project_name}`,
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: linkData?.due_date || projectData?.deadline || '',
        currency: 'PHP',
        bill_to_name: projectData?.client_name || inv.client_name,
        bill_to_address: '',
        reference: linkData?.reference || '',
        payment_terms: linkData?.payment_terms || '',
        customer_notes: '',
        payment_instructions: projectData?.notes || '',
        amount_requested: inv.balance != null ? String(Math.max(inv.balance, 0)) : '',
      });
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to load invoice details');
    } finally {
      setEditLoading(false);
    }
  };

  const resendEditedInvoice = async () => {
    if (!editingInvoice) return;
    if (!editingProject) { setEditError('Project data could not be loaded. Close and try again.'); return; }
    if (!editForm.email.trim()) {
      setEditError('Recipient email is required.');
      return;
    }
    const cleanedLineItems = editLineItems.filter((item) => item.description.trim() && item.amount.trim());
    if (cleanedLineItems.length === 0) {
      setEditError('Add at least one line item.');
      return;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      const payload = {
        to: editForm.email.trim(),
        cc: editForm.cc.trim() || undefined,
        subject: editForm.subject.trim() || undefined,
        client_name: editForm.bill_to_name.trim() || editingProject.client_name,
        project_name: editingProject.project_name,
        service: editingProject.service,
        contract_price: editingProject.contract_price,
        start_date: editingProject.start_date,
        issue_date: editForm.issue_date || undefined,
        deadline: editForm.due_date || editingProject.deadline,
        currency: editForm.currency,
        payments: editingProject.hub_project_payments ?? [],
        show_payments: editShowPayments,
        line_items: cleanedLineItems,
        notes: editForm.payment_instructions.trim() || undefined,
        bill_to_name: editForm.bill_to_name.trim() || undefined,
        bill_to_address: editForm.bill_to_address.trim() || undefined,
        reference: editForm.reference.trim() || undefined,
        payment_terms: editForm.payment_terms.trim() || undefined,
        message: editForm.customer_notes.trim() || undefined,
        invoice_number: editingInvoice.invoice_number,
        project_id: editingInvoice.project_id,
        app_base_url: 'https://hunacreatives.com',
        amount_requested: editForm.amount_requested ? parseFloat(editForm.amount_requested) : undefined,
        existing_invoice_log_id: editingInvoice.id,
      };

      const { data, error } = await supabase.functions.invoke('send-invoice', { body: payload });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed to resend invoice');

      const lineItemsTotal = cleanedLineItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
      const totalPaid = (editingProject.hub_project_payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
      const newBalance = payload.amount_requested != null ? payload.amount_requested : Math.max(lineItemsTotal - totalPaid, 0);

      setInvoices((prev) =>
        prev.map((invoice) =>
          invoice.id === editingInvoice.id
            ? {
                ...invoice,
                sent_to: payload.to,
                sent_cc: payload.cc ?? null,
                subject: payload.subject ?? null,
                contract_price: lineItemsTotal,
                total_paid: totalPaid,
                balance: newBalance,
                line_items: cleanedLineItems,
                show_payments: payload.show_payments,
                sent_at: new Date().toISOString(),
              }
            : invoice
        )
      );
      closeEditModal();
      alert(`Updated invoice #${editingInvoice.invoice_number.padStart(4, '0')} and resent it to ${payload.to}.`);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to resend invoice');
    } finally {
      setEditSaving(false);
    }
  };

  const deleteProof = async (id: number) => {
    if (!window.confirm('Delete this payment proof? This cannot be undone.')) return;
    await supabase.from('hub_payment_proof_submissions').delete().eq('id', id);
    setProofs(prev => prev.filter(p => p.id !== id));
  };

  const verifyProof = async (proof: PaymentProof) => {
    if (!window.confirm(`Mark this payment as verified?\n\nThis will:\n• Log ₱${(proof.amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} to the project\n• Send a payment receipt to the client\n• Notify you on Slack`)) return;

    setVerifying(prev => new Set(prev).add(proof.id));
    const verified_at = new Date().toISOString();

    try {
      // 1. Log payment to project — if this fails, abort before marking verified,
      // sending a receipt, or settling the invoice, so we never get a verified
      // proof with no recorded payment.
      if (proof.project_id && proof.amount) {
        const { error: payErr } = await supabase.from('hub_project_payments').insert({
          project_id: proof.project_id,
          amount: proof.amount,
          paid_at: proof.submitted_at,
          notes: `${proof.payment_channel} — verified from client proof`,
        });
        if (payErr) throw new Error(`Could not record the payment: ${payErr.message}`);
      }

      // 2. Fetch project for receipt email (contract price + contact email + updated total)
      let receiptSent = false;
      if (proof.project_id) {
        const { data: project } = await supabase
          .from('hub_projects')
          .select('contract_price, contact_email, hub_project_payments(amount)')
          .eq('id', proof.project_id)
          .single();

        if (project) {
          const totalPaid = (project.hub_project_payments ?? []).reduce((s: number, p: any) => s + p.amount, 0);
          const to = proof.payer_email || project.contact_email;
          if (to) {
            await supabase.functions.invoke('send-payment-receipt', {
              body: {
                to,
                client_name: proof.client_name,
                project_name: proof.project_name,
                amount: proof.amount,
                paid_at: proof.submitted_at,
                notes: `Payment via ${proof.payment_channel}`,
                receipt_url: proof.proof_url,
                total_paid: totalPaid,
                contract_price: project.contract_price,
                invoice_number: proof.invoice_number,
                project_id: proof.project_id,
              },
            });
            receiptSent = true;
          }
        }
      }

      // 3. Mark as verified
      await supabase.from('hub_payment_proof_submissions').update({ verified: true, verified_at }).eq('id', proof.id);

      // 4. Settle matching invoice log entry — try invoice_number first, fall back to project_id
      let matchedInvoiceId: number | null = null;
      if (proof.invoice_number) {
        const { data: m } = await supabase
          .from('hub_invoice_log').select('id')
          .eq('invoice_number', proof.invoice_number)
          .maybeSingle();
        if (m) matchedInvoiceId = m.id;
      }
      if (!matchedInvoiceId && proof.project_id) {
        const { data: m } = await supabase
          .from('hub_invoice_log').select('id')
          .eq('project_id', proof.project_id)
          .eq('settled', false)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (m) matchedInvoiceId = m.id;
      }
      if (matchedInvoiceId) {
        await supabase.from('hub_invoice_log').update({ settled: true, settled_at: verified_at }).eq('id', matchedInvoiceId);
        setInvoices(prev => prev.map(i => i.id === matchedInvoiceId ? { ...i, settled: true, settled_at: verified_at } : i));
      }

      // 5. Slack notification
      supabase.functions.invoke('notify-internal-request', {
        body: {
          type: 'payment_verified',
          contractor_name: proof.client_name,
          detail: `${proof.project_name} · ₱${(proof.amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} via ${proof.payment_channel}`,
          notes: receiptSent ? 'Receipt email sent to client.' : 'No client email — receipt not sent.',
        },
      }).catch(console.error);

      setProofs(prev => prev.map(p => p.id === proof.id ? { ...p, verified: true, verified_at } : p));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Verification failed. Please try again.');
    } finally {
      setVerifying(prev => { const s = new Set(prev); s.delete(proof.id); return s; });
    }
  };

  const resendInvoice = async (inv: InvoiceLog) => {
    if (!window.confirm(`Resend invoice #${inv.invoice_number.padStart(4, '0')} to ${inv.sent_to}?`)) return;
    setResending(prev => new Set(prev).add(inv.id));
    try {
      let payments: { amount: number; paid_at: string; notes: string | null }[] = [];
      if (inv.project_id) {
        const { data: pmts } = await supabase.from('hub_project_payments').select('amount, paid_at, notes').eq('project_id', inv.project_id).order('paid_at', { ascending: true });
        payments = pmts ?? [];
      }
      const { data, error } = await supabase.functions.invoke('send-invoice', {
        body: {
          to: inv.sent_to,
          cc: inv.sent_cc || undefined,
          subject: inv.subject || undefined,
          client_name: inv.client_name,
          project_name: inv.project_name,
          contract_price: inv.contract_price,
          payments,
          show_payments: inv.show_payments,
          line_items: inv.line_items,
          invoice_number: inv.invoice_number,
          project_id: inv.project_id,
          amount_requested: inv.balance,
          app_base_url: 'https://hunacreatives.com',
        },
      });
      if (error || data?.error) {
        alert('Failed to resend: ' + (data?.error || error?.message));
      } else {
        alert(`Invoice resent to ${inv.sent_to}`);
      }
    } finally {
      setResending(prev => { const s = new Set(prev); s.delete(inv.id); return s; });
    }
  };

  const settleInvoice = async (inv: InvoiceLog) => {
    if (!window.confirm(`Mark invoice #${inv.invoice_number.padStart(4, '0')} for ${inv.client_name} as settled?`)) return;
    const settled_at = new Date().toISOString();
    await supabase.from('hub_invoice_log').update({ settled: true, settled_at }).eq('id', inv.id);
    setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, settled: true, settled_at } : i));
  };

  const deleteInvoice = async (id: number) => {
    if (!window.confirm('Delete this invoice log entry? This cannot be undone.')) return;
    await supabase.from('hub_invoice_log').delete().eq('id', id);
    setInvoices(prev => prev.filter(i => i.id !== id));
  };

  const cancelScheduledInvoice = async (id: number) => {
    await supabase.from('hub_scheduled_invoices').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending');
    setScheduled(prev => prev.map(item => item.id === id ? { ...item, status: 'cancelled', cancelled_at: new Date().toISOString() } : item));
  };

  const resendScheduledInvoice = async (inv: ScheduledInvoice) => {
    if (!window.confirm(`Send invoice #${inv.invoice_number.padStart(4, '0')} to ${inv.to_email} now?`)) return;
    setResending(prev => new Set(prev).add(inv.id));
    try {
      const { data, error } = await supabase.functions.invoke('send-invoice', {
        body: {
          to: inv.to_email,
          cc: inv.cc_email || undefined,
          subject: inv.subject || undefined,
          client_name: inv.client_name,
          project_name: inv.project_name,
          payments: inv.payments ?? [],
          show_payments: inv.show_payments,
          line_items: inv.line_items ?? [],
          invoice_number: inv.invoice_number,
          project_id: inv.project_id,
          amount_requested: inv.amount_requested ?? undefined,
          app_base_url: 'https://hunacreatives.com',
        },
      });
      if (error || data?.error) {
        const msg = data?.error || error?.message || 'Unknown error';
        await supabase.from('hub_scheduled_invoices').update({ status: 'failed', last_error: msg }).eq('id', inv.id);
        setScheduled(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'failed', last_error: msg } : i));
        alert('Failed to send: ' + msg);
      } else {
        const sent_at = new Date().toISOString();
        await supabase.from('hub_scheduled_invoices').update({ status: 'sent', sent_at, last_error: null }).eq('id', inv.id);
        setScheduled(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'sent', sent_at } : i));
        alert(`Invoice sent to ${inv.to_email}`);
      }
    } finally {
      setResending(prev => { const s = new Set(prev); s.delete(inv.id); return s; });
    }
  };

  return (
    <AdminLayout title="Invoice Log">
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex bg-gray-100 rounded-lg p-1 gap-1 w-max sm:w-auto">
              <button
                onClick={() => setTab('invoices')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${tab === 'invoices' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Invoices
                <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{invoices.length}</span>
              </button>
              <button
                onClick={() => setTab('scheduled')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${tab === 'scheduled' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Scheduled
                <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{scheduled.filter(s => s.status === 'pending').length}</span>
              </button>
              <button
                onClick={() => setTab('receipts')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${tab === 'receipts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Receipts
                <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{receipts.length}</span>
              </button>
              <button
                onClick={() => setTab('proofs')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${tab === 'proofs' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Proofs
                <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{proofs.length}</span>
              </button>
            </div>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by client, project, email…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30"
          />
        </div>

        {loading ? (
          <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>
        ) : tab === 'invoices' ? (
          filteredInvoices.length === 0 ? (
            <div className="text-sm text-gray-400 py-12 text-center">No invoices found</div>
          ) : (
            <div className="space-y-2">
              {activeInvoices.length === 0 && (
                <div className="text-sm text-gray-400 py-6 text-center">No active invoices</div>
              )}
              {activeInvoices.map(inv => (
                <div key={inv.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                    <button
                      className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                      onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                    >
                      <span className="text-xs font-mono font-bold text-[#1c2b3a] bg-slate-50 px-2 py-1 rounded flex-shrink-0">
                        #{inv.invoice_number.padStart(4, '0')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{inv.project_name}</p>
                        <p className="text-xs text-gray-500 truncate">{inv.client_name}</p>
                        <p className="text-xs text-gray-400 hidden sm:block">{inv.sent_to}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-900">{fmt(inv.contract_price, inv.currency)}</p>
                        {inv.balance != null && (
                          <p className={`text-xs font-medium ${inv.balance <= 0 ? 'text-emerald-600' : 'text-[#1c2b3a]/70'}`}>
                            {inv.balance <= 0 ? 'Paid' : `${fmt(inv.balance, inv.currency)} due`}
                          </p>
                        )}
                      </div>
                      {inv.settled ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full flex-shrink-0">
                          <i className="ri-check-double-line"></i> <span className="hidden sm:inline">Settled</span>
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full flex-shrink-0">
                          <span className="hidden sm:inline">Outstanding</span><span className="sm:hidden">Due</span>
                        </span>
                      )}
                      <div className="text-xs text-gray-400 flex-shrink-0 text-right hidden md:block">{fmtDateTime(inv.sent_at)}</div>
                      <i className={`ri-arrow-${expanded === inv.id ? 'up' : 'down'}-s-line text-gray-400 flex-shrink-0`}></i>
                    </button>
                    {!inv.settled && (
                      <div className="flex items-center gap-1.5 ml-1">
                        <button
                          type="button"
                          onClick={() => void settleInvoice(inv)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer flex-shrink-0"
                        >
                          <i className="ri-check-double-line"></i>
                          <span className="hidden sm:inline">Settle</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void openEditInvoice(inv)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-sky-600 border border-sky-200 rounded-lg hover:bg-sky-50 transition-colors cursor-pointer flex-shrink-0"
                        >
                          <i className="ri-edit-line"></i>
                          <span className="hidden sm:inline">Re-edit</span>
                        </button>
                      </div>
                    )}
                  </div>
                  {expanded === inv.id && (
                    <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 space-y-3">
                      {inv.subject && (
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Subject</p>
                          <p className="text-sm text-gray-700">{inv.subject}</p>
                        </div>
                      )}
                      {inv.sent_cc && (
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">CC</p>
                          <p className="text-sm text-gray-700">{inv.sent_cc}</p>
                        </div>
                      )}
                      {inv.line_items && inv.line_items.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Line Items</p>
                          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                            {inv.line_items.map((item, i) => (
                              <div key={i} className="flex justify-between px-4 py-2.5 text-sm border-b border-gray-100 last:border-0">
                                <span className="text-gray-700">{item.description}</span>
                                <span className="font-semibold text-gray-900">{fmt(parseFloat(item.amount) || 0)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Total</p>
                          <p className="font-semibold text-gray-900">{fmt(inv.contract_price, inv.currency)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Paid</p>
                          <p className="font-semibold text-emerald-600">{fmt(inv.total_paid, inv.currency)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Balance</p>
                          <p className={`font-semibold ${(inv.balance ?? 1) <= 0 ? 'text-emerald-600' : 'text-[#1c2b3a]/70'}`}>{inv.balance != null && inv.balance <= 0 ? 'Paid ✓' : fmt(inv.balance, inv.currency)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-gray-400">
                          Payments history {inv.show_payments ? 'shown' : 'hidden'} · Sent {fmtDateTime(inv.sent_at)}
                          {inv.settled && inv.settled_at && <> · <span className="text-emerald-600">Settled {fmtDateTime(inv.settled_at)}</span></>}
                        </p>
                        <div className="flex items-center gap-2">
                          {!inv.settled && (
                            <button
                              onClick={() => void openEditInvoice(inv)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs text-sky-600 border border-sky-200 rounded-lg hover:bg-sky-50 transition-colors cursor-pointer"
                            >
                              <i className="ri-edit-line"></i> Re-edit
                            </button>
                          )}
                          <button
                            onClick={() => resendInvoice(inv)}
                            disabled={resending.has(inv.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-[#1c2b3a] border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {resending.has(inv.id)
                              ? <><i className="ri-loader-4-line animate-spin"></i> Sending…</>
                              : <><i className="ri-send-plane-line"></i> Resend</>
                            }
                          </button>
                          <button onClick={() => deleteInvoice(inv.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-rose-500 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer">
                            <i className="ri-delete-bin-line"></i> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {paidInvoices.length > 0 && (
                <div className="mt-4">
                  <button type="button" onClick={() => setShowPaid(p => !p)}
                    className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer mb-2">
                    <i className={`ri-arrow-${showPaid ? 'up' : 'down'}-s-line`}></i>
                    {showPaid ? 'Hide' : 'Show'} paid invoices ({paidInvoices.length})
                  </button>
                  {showPaid && (
                    <div className="space-y-2 opacity-70">
                      {paidInvoices.map(inv => (
                        <div key={inv.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                          <div className="px-4 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                            <button className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                              onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}>
                              <span className="text-xs font-mono font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded flex-shrink-0">
                                #{inv.invoice_number.padStart(4, '0')}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-700 truncate">{inv.project_name}</p>
                                <p className="text-xs text-gray-400 truncate">{inv.client_name}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-bold text-gray-700">{fmt(inv.contract_price, inv.currency)}</p>
                                <p className="text-xs font-medium text-emerald-600">Paid</p>
                              </div>
                              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full flex-shrink-0">
                                <i className="ri-check-double-line"></i> <span className="hidden sm:inline">Settled</span>
                              </span>
                              <div className="text-xs text-gray-400 flex-shrink-0 text-right hidden md:block">{fmtDateTime(inv.sent_at)}</div>
                              <i className={`ri-arrow-${expanded === inv.id ? 'up' : 'down'}-s-line text-gray-400 flex-shrink-0`}></i>
                            </button>
                          </div>
                          {expanded === inv.id && (
                            <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 space-y-2 text-sm text-gray-600">
                              {inv.settled_at && <p className="text-xs text-gray-400">Settled on {fmtDateTime(inv.settled_at)}</p>}
                              {inv.payments && inv.payments.length > 0 && (
                                <div>
                                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Payments</p>
                                  {inv.payments.map((p, i) => (
                                    <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-100 last:border-0">
                                      <span>{fmtDate(p.paid_at)}{p.notes ? ` · ${p.notes}` : ''}</span>
                                      <span className="font-semibold">{fmt(p.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        ) : tab === 'scheduled' ? (
          filteredScheduled.length === 0 ? (
            <div className="text-sm text-gray-400 py-12 text-center">No scheduled invoices found</div>
          ) : (
            <div className="space-y-2">
              {filteredScheduled.map(inv => {
                const statusCls = inv.status === 'sent'
                  ? 'bg-emerald-50 text-emerald-600'
                  : inv.status === 'cancelled'
                    ? 'bg-gray-100 text-gray-500'
                    : inv.status === 'failed'
                      ? 'bg-rose-50 text-rose-500'
                      : 'bg-amber-50 text-amber-600';
                return (
                  <div key={inv.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      className="w-full text-left px-4 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setExpanded(expanded === 100000 + inv.id ? null : 100000 + inv.id)}
                    >
                      <span className="text-xs font-mono font-bold text-[#1c2b3a] bg-slate-50 px-2 py-1 rounded flex-shrink-0">
                        #{inv.invoice_number.padStart(4, '0')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{inv.project_name}</p>
                        <p className="text-xs text-gray-500 truncate">{inv.client_name}</p>
                        <p className="text-xs text-gray-400 hidden sm:block">{inv.to_email}</p>
                      </div>
                      <div className="text-right flex-shrink-0 hidden sm:block">
                        <p className="text-xs text-gray-400">Scheduled</p>
                        <p className="text-sm font-semibold text-gray-900">{fmtDateTime(inv.scheduled_for)}</p>
                      </div>
                      <span className={`text-[11px] px-2 py-1 rounded-full font-medium flex-shrink-0 ${statusCls}`}>{inv.status}</span>
                      <i className={`ri-arrow-${expanded === 100000 + inv.id ? 'up' : 'down'}-s-line text-gray-400 flex-shrink-0`}></i>
                    </button>
                    {expanded === 100000 + inv.id && (
                      <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 space-y-3">
                        {inv.subject && (
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Subject</p>
                            <p className="text-sm text-gray-700">{inv.subject}</p>
                          </div>
                        )}
                        {inv.cc_email && (
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">CC</p>
                            <p className="text-sm text-gray-700">{inv.cc_email}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Scheduled For</p>
                            <p className="font-semibold text-gray-900">{fmtDateTime(inv.scheduled_for)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Due Date</p>
                            <p className="font-semibold text-gray-900">{inv.due_date ? fmtDate(inv.due_date) : '—'}</p>
                          </div>
                        </div>
                        {inv.last_error && (
                          <div className="bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                            <p className="text-xs text-rose-500">{inv.last_error}</p>
                          </div>
                        )}
                        {inv.line_items && inv.line_items.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Line Items</p>
                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                              {inv.line_items.map((item, i) => (
                                <div key={i} className="flex justify-between px-4 py-2.5 text-sm border-b border-gray-100 last:border-0">
                                  <span className="text-gray-700">{item.description}</span>
                                  <span className="font-semibold text-gray-900">{fmt(parseFloat(item.amount) || 0)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-gray-400">
                            {inv.status === 'sent' && inv.sent_at ? `Sent ${fmtDateTime(inv.sent_at)}` : inv.status === 'cancelled' && inv.cancelled_at ? `Cancelled ${fmtDateTime(inv.cancelled_at)}` : 'Waiting to be sent automatically'}
                          </p>
                          <div className="flex items-center gap-2">
                            {(inv.status === 'cancelled' || inv.status === 'failed') && (
                              <button
                                onClick={() => resendScheduledInvoice(inv)}
                                disabled={resending.has(inv.id)}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs text-[#1c2b3a] border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {resending.has(inv.id)
                                  ? <><i className="ri-loader-4-line animate-spin"></i> Sending…</>
                                  : <><i className="ri-send-plane-line"></i> Send Now</>
                                }
                              </button>
                            )}
                            {inv.status === 'pending' && (
                              <button
                                onClick={() => cancelScheduledInvoice(inv.id)}
                                className="px-3 py-1.5 text-xs text-rose-500 border border-rose-200 rounded-lg hover:bg-rose-50 cursor-pointer"
                              >
                                Cancel Schedule
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : tab === 'proofs' ? (
          filteredProofs.length === 0 ? (
            <div className="text-sm text-gray-400 py-12 text-center">No payment proofs found</div>
          ) : (
            <div className="space-y-2">
              {filteredProofs.map(p => (
                <div key={p.id} className={`bg-white border rounded-xl overflow-hidden ${p.verified ? 'border-emerald-200' : 'border-gray-200'}`}>
                  <button
                    className="w-full text-left px-4 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setExpanded(expanded === 200000 + p.id ? null : 200000 + p.id)}
                  >
                    <span className="text-xs font-mono font-bold text-[#1c2b3a] bg-slate-50 px-2 py-1 rounded flex-shrink-0">
                      #{p.invoice_number.padStart(4, '0')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.project_name}</p>
                      <p className="text-xs text-gray-500 truncate">{p.client_name} · {p.payer_name}</p>
                      <p className="text-xs text-gray-400 sm:hidden">{p.payment_channel}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900">{fmt(p.amount)}</p>
                      <p className="text-xs text-gray-400 hidden sm:block">{p.payment_channel}</p>
                    </div>
                    {p.verified ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full flex-shrink-0">
                        <i className="ri-check-line"></i> <span className="hidden sm:inline">Verified</span>
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full flex-shrink-0">
                        Pending
                      </span>
                    )}
                    <div className="text-xs text-gray-400 flex-shrink-0 text-right hidden md:block">{fmtDateTime(p.submitted_at)}</div>
                    <i className={`ri-arrow-${expanded === 200000 + p.id ? 'up' : 'down'}-s-line text-gray-400 flex-shrink-0`}></i>
                  </button>
                  {expanded === 200000 + p.id && (
                    <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Payer</p>
                          <p className="font-semibold text-gray-900">{p.payer_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Email</p>
                          <p className="font-semibold text-gray-900">{p.payer_email || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Channel</p>
                          <p className="font-semibold text-gray-900">{p.payment_channel}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Reference</p>
                          <p className="font-semibold text-gray-900">{p.reference_number || '—'}</p>
                        </div>
                      </div>
                      {p.notes && (
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Notes</p>
                          <p className="text-sm text-gray-700">{p.notes}</p>
                        </div>
                      )}
                      {p.proof_url && (
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Uploaded Proof</p>
                          {p.proof_url.toLowerCase().endsWith('.pdf') ? (
                            <a href={p.proof_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50">
                              <i className="ri-file-pdf-line text-rose-500"></i>
                              Open uploaded PDF
                            </a>
                          ) : (
                            <a href={p.proof_url} target="_blank" rel="noreferrer" className="inline-block">
                              <img src={p.proof_url} alt="Payment proof" className="max-h-40 rounded-lg border border-gray-200 object-contain bg-white" />
                            </a>
                          )}
                        </div>
                      )}
                      <div className="pt-1 border-t border-gray-200 space-y-2">
                        {p.verified ? (
                          <p className="text-xs text-emerald-600 flex items-center gap-1">
                            <i className="ri-check-double-line"></i>
                            Verified {p.verified_at ? fmtDateTime(p.verified_at) : ''}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-400">Not yet verified</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => deleteProof(p.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-rose-500 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <i className="ri-delete-bin-line"></i> Delete
                          </button>
                          {!p.verified && (
                            <button
                              onClick={() => verifyProof(p)}
                              disabled={verifying.has(p.id)}
                              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {verifying.has(p.id)
                                ? <><i className="ri-loader-4-line animate-spin"></i> Processing…</>
                                : <><i className="ri-check-line"></i> Mark as Verified</>
                              }
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          filteredReceipts.length === 0 ? (
            <div className="text-sm text-gray-400 py-12 text-center">No receipts found</div>
          ) : (
            <div className="space-y-2">
              {filteredReceipts.map(r => (
                <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    className="w-full text-left px-4 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setExpanded(expanded === -r.id ? null : -r.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.project_name}</p>
                      <p className="text-xs text-gray-500 truncate">{r.client_name}</p>
                      <p className="text-xs text-gray-400 hidden sm:block">{r.sent_to}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-emerald-600">{fmt(r.payment_amount)}</p>
                      {r.paid_at && <p className="text-xs text-gray-400">{fmtDate(r.paid_at)}</p>}
                    </div>
                    <div className="text-xs text-gray-400 flex-shrink-0 text-right hidden md:block">{fmtDateTime(r.sent_at)}</div>
                    <i className={`ri-arrow-${expanded === -r.id ? 'up' : 'down'}-s-line text-gray-400 flex-shrink-0`}></i>
                  </button>
                  {expanded === -r.id && (
                    <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Amount</p>
                          <p className="font-semibold text-emerald-600">{fmt(r.payment_amount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Total Paid</p>
                          <p className="font-semibold text-gray-900">{fmt(r.total_paid)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Balance After</p>
                          <p className={`font-semibold ${(r.balance ?? 1) <= 0 ? 'text-emerald-600' : 'text-[#1c2b3a]/70'}`}>{r.balance != null && r.balance <= 0 ? 'Paid ✓' : fmt(r.balance)}</p>
                        </div>
                      </div>
                      {r.receipt_url && (
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Proof of Receipt</p>
                          <a href={r.receipt_url} target="_blank" rel="noreferrer" className="inline-block">
                            <img src={r.receipt_url} alt="Receipt" className="max-h-40 rounded-lg border border-gray-200 object-contain bg-white" />
                          </a>
                        </div>
                      )}
                      <p className="text-xs text-gray-400">Receipt email sent {fmtDateTime(r.sent_at)}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[92vh] overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-[#111827]">Re-edit Invoice #{editingInvoice.invoice_number.padStart(4, '0')}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{editingInvoice.client_name} · {editingInvoice.project_name}</p>
              </div>
              <button onClick={closeEditModal} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(92vh-132px)]">
              {editLoading ? (
                <div className="py-16 text-center text-sm text-gray-400">Loading invoice details…</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {editError && (
                    <div className="px-5 pt-4">
                      <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm text-rose-600">{editError}</div>
                    </div>
                  )}

                  {/* Client Details */}
                  <div className="px-5 py-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client Details</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-500">Send To</span>
                        <input type="email" value={editForm.email}
                          onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                          placeholder="client@email.com"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-500">CC</span>
                        <input type="text" value={editForm.cc}
                          onChange={(e) => setEditForm((p) => ({ ...p, cc: e.target.value }))}
                          placeholder="finance@client.com"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-500">Client Name</span>
                        <input type="text" value={editForm.bill_to_name}
                          onChange={(e) => setEditForm((p) => ({ ...p, bill_to_name: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-500">Reference / PO</span>
                        <input type="text" value={editForm.reference}
                          onChange={(e) => setEditForm((p) => ({ ...p, reference: e.target.value }))}
                          placeholder="PO-1042"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                      </label>
                      <label className="sm:col-span-2 space-y-1">
                        <span className="text-xs font-medium text-gray-500">Billing Address</span>
                        <textarea value={editForm.bill_to_address}
                          onChange={(e) => setEditForm((p) => ({ ...p, bill_to_address: e.target.value }))}
                          rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                      </label>
                    </div>
                  </div>

                  {/* Invoice Settings */}
                  <div className="px-5 py-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice Settings</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-500">Issue Date</span>
                        <input type="date" value={editForm.issue_date}
                          onChange={(e) => setEditForm((p) => ({ ...p, issue_date: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-500">Due Date</span>
                        <input type="date" value={editForm.due_date}
                          onChange={(e) => setEditForm((p) => ({ ...p, due_date: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-500">Currency</span>
                        <select value={editForm.currency}
                          onChange={(e) => setEditForm((p) => ({ ...p, currency: e.target.value as 'PHP' | 'USD' }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]">
                          <option value="PHP">PHP</option>
                          <option value="USD">USD</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-500">Payment Terms</span>
                        <input type="text" value={editForm.payment_terms}
                          onChange={(e) => setEditForm((p) => ({ ...p, payment_terms: e.target.value }))}
                          placeholder="Due on receipt"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                      </label>
                    </div>
                  </div>

                  {/* Line Items */}
                  <div className="px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items</p>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={editShowPayments}
                          onChange={(e) => setEditShowPayments(e.target.checked)}
                          className="h-3.5 w-3.5 accent-[#1c2b3a]" />
                        Include payment history
                      </label>
                    </div>
                    <div className="space-y-2">
                      {editLineItems.map((item, index) => (
                        <div key={index} className="grid grid-cols-[minmax(0,1fr)_160px_44px] gap-2">
                          <input type="text" value={item.description}
                            onChange={(e) => setEditLineItems((prev) => prev.map((l, i) => i === index ? { ...l, description: e.target.value } : l))}
                            placeholder="Description"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                          <input type="number" value={item.amount}
                            onChange={(e) => setEditLineItems((prev) => prev.map((l, i) => i === index ? { ...l, amount: e.target.value } : l))}
                            placeholder="0.00"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                          <button type="button"
                            onClick={() => setEditLineItems((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index))}
                            className="rounded-xl border border-gray-200 text-gray-400 hover:text-rose-500 hover:border-rose-200 cursor-pointer">
                            <i className="ri-delete-bin-line text-sm"></i>
                          </button>
                        </div>
                      ))}
                      <button type="button"
                        onClick={() => setEditLineItems((prev) => [...prev, { description: '', amount: '' }])}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-[#1c2b3a] hover:bg-slate-100 cursor-pointer">
                        <i className="ri-add-line"></i> Add Item
                      </button>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="px-5 py-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</p>
                    <div className="space-y-3">
                      <label className="space-y-1 block">
                        <span className="text-xs font-medium text-gray-500">Customer Notes</span>
                        <textarea value={editForm.customer_notes}
                          onChange={(e) => setEditForm((p) => ({ ...p, customer_notes: e.target.value }))}
                          rows={3} placeholder="Thank you for your continued trust…"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                      </label>
                      <label className="space-y-1 block">
                        <span className="text-xs font-medium text-gray-500">Payment Instructions</span>
                        <textarea value={editForm.payment_instructions}
                          onChange={(e) => setEditForm((p) => ({ ...p, payment_instructions: e.target.value }))}
                          rows={3} placeholder="Bank details, transfer instructions…"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                      </label>
                      <label className="space-y-1 block">
                        <span className="text-xs font-medium text-gray-500">Amount Due Override</span>
                        <input type="number" value={editForm.amount_requested}
                          onChange={(e) => setEditForm((p) => ({ ...p, amount_requested: e.target.value }))}
                          placeholder="Leave blank to use line items total"
                          className="w-full px-3 py-2 text-sm border border-[#1c2b3a] rounded-xl font-semibold focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25" />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 justify-end p-5 border-t border-gray-100">
              <button
                onClick={closeEditModal}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void resendEditedInvoice()}
                disabled={editLoading || editSaving}
                className="px-4 py-2 text-sm bg-[#111827] text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
              >
                {editSaving ? 'Sending…' : 'Save and resend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
