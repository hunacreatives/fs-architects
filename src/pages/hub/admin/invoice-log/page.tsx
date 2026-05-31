import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useDemo } from '@/contexts/DemoContext';
import { DEMO_INVOICES } from '@/lib/demoData';

const fmt = (n: number | null) =>
  n == null ? '—' : '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  sent_at: string;
  settled: boolean;
  settled_at: string | null;
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
  const [verifying, setVerifying] = useState<Set<number>>(new Set());
  const [resending, setResending] = useState<Set<number>>(new Set());

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
      // 1. Log payment to project
      if (proof.project_id && proof.amount) {
        await supabase.from('hub_project_payments').insert({
          project_id: proof.project_id,
          amount: proof.amount,
          paid_at: proof.submitted_at,
          notes: `${proof.payment_channel} — verified from client proof`,
        });
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

      // 4. Settle matching invoice log entry
      if (proof.invoice_number) {
        const { data: matched } = await supabase
          .from('hub_invoice_log')
          .select('id')
          .eq('invoice_number', proof.invoice_number)
          .eq('project_id', proof.project_id)
          .maybeSingle();
        if (matched) {
          await supabase.from('hub_invoice_log').update({ settled: true, settled_at: verified_at }).eq('id', matched.id);
          setInvoices(prev => prev.map(i => i.id === matched.id ? { ...i, settled: true, settled_at: verified_at } : i));
        }
      }

      // 5. Slack notification
      supabase.functions.invoke('notify-internal-request', {
        body: {
          type: 'payment_verified',
          contractor_name: proof.client_name,
          detail: `${proof.project_name} · ₱${(proof.amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} via ${proof.payment_channel}`,
          notes: receiptSent ? 'Receipt email sent to client.' : 'No client email — receipt not sent.',
        },
      }).catch(() => {});

      setProofs(prev => prev.map(p => p.id === proof.id ? { ...p, verified: true, verified_at } : p));
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
          app_base_url: window.location.origin,
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
          app_base_url: window.location.origin,
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
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
          />
        </div>

        {loading ? (
          <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>
        ) : tab === 'invoices' ? (
          filteredInvoices.length === 0 ? (
            <div className="text-sm text-gray-400 py-12 text-center">No invoices found</div>
          ) : (
            <div className="space-y-2">
              {filteredInvoices.map(inv => (
                <div key={inv.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    className="w-full text-left px-4 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                  >
                    <span className="text-xs font-mono font-bold text-[#FF6B35] bg-orange-50 px-2 py-1 rounded flex-shrink-0">
                      #{inv.invoice_number.padStart(4, '0')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{inv.project_name}</p>
                      <p className="text-xs text-gray-500 truncate">{inv.client_name}</p>
                      <p className="text-xs text-gray-400 hidden sm:block">{inv.sent_to}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900">{fmt(inv.contract_price)}</p>
                      {inv.balance != null && (
                        <p className={`text-xs font-medium ${inv.balance <= 0 ? 'text-emerald-600' : 'text-orange-500'}`}>
                          {inv.balance <= 0 ? 'Paid' : `${fmt(inv.balance)} due`}
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
                          <p className="font-semibold text-gray-900">{fmt(inv.contract_price)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Paid</p>
                          <p className="font-semibold text-emerald-600">{fmt(inv.total_paid)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Balance</p>
                          <p className={`font-semibold ${(inv.balance ?? 1) <= 0 ? 'text-emerald-600' : 'text-orange-500'}`}>{inv.balance != null && inv.balance <= 0 ? 'Paid ✓' : fmt(inv.balance)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-gray-400">
                          Payments history {inv.show_payments ? 'shown' : 'hidden'} · Sent {fmtDateTime(inv.sent_at)}
                          {inv.settled && inv.settled_at && <> · <span className="text-emerald-600">Settled {fmtDateTime(inv.settled_at)}</span></>}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => resendInvoice(inv)}
                            disabled={resending.has(inv.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-[#FF6B35] border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors cursor-pointer disabled:opacity-50"
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
                      <span className="text-xs font-mono font-bold text-[#FF6B35] bg-orange-50 px-2 py-1 rounded flex-shrink-0">
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
                                className="flex items-center gap-1 px-3 py-1.5 text-xs text-[#FF6B35] border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors cursor-pointer disabled:opacity-50"
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
                    <span className="text-xs font-mono font-bold text-[#FF6B35] bg-orange-50 px-2 py-1 rounded flex-shrink-0">
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
                          <p className={`font-semibold ${(r.balance ?? 1) <= 0 ? 'text-emerald-600' : 'text-orange-500'}`}>{r.balance != null && r.balance <= 0 ? 'Paid ✓' : fmt(r.balance)}</p>
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
    </AdminLayout>
  );
}
