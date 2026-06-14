import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import {
  buildDefaultInvoiceLineItems,
  buildInvoiceDefaults,
  buildInvoicePreviewHtml,
  emptyInvoiceBuilderForm,
  formatInvoiceCurrency,
  InvoiceBuilderFormState,
  InvoiceLineItem,
  InvoiceProjectSnapshot,
  isValidEmail,
  parseEmailList,
} from '@/lib/invoiceBuilder';

export default function AdminInvoiceBuilderPage() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [project, setProject] = useState<InvoiceProjectSnapshot | null>(null);
  const [form, setForm] = useState<InvoiceBuilderFormState>(emptyInvoiceBuilderForm());
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([{ description: '', amount: '' }]);
  const [includePaymentHistory, setIncludePaymentHistory] = useState(true);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const draftKey = `hub_invoice_draft_${projectId}`;

  async function previewPaymentPage() {
    if (!project) return;
    // compute amount due same as preview renderer
    const validLineItemsLocal = lineItems.filter((item) => item.description.trim() && item.amount !== '');
    const subtotalLocal = validLineItemsLocal.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const amountRequestedLocal = form.amount_requested ? parseFloat(form.amount_requested) : NaN;
    const amountDue = Number.isFinite(amountRequestedLocal) ? amountRequestedLocal : subtotalLocal;

    const fmt = (n: number) => new Intl.NumberFormat(form.currency === 'USD' ? 'en-US' : 'en-PH', { style: 'currency', currency: form.currency, minimumFractionDigits: 2 }).format(n);

    // open popup immediately (user gesture) and show a loading state
    const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=800');
    if (!win) return;
    const staticPreviewHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment preview — ${project.project_name}</title>
      <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#111827;padding:28px} .card{max-width:720px;margin:0 auto;background:#fff;border:1px solid #e6e9ef;border-radius:12px;padding:22px} .header{display:flex;align-items:center;gap:12px;margin-bottom:12px} .logo{height:32px} .amount{font-weight:800;font-size:28px;margin-top:6px} .channels{display:flex;gap:12px;margin-top:16px} .chan{flex:1;border:1px solid #f1f5f9;border-radius:10px;padding:12px;text-align:center} .chan img{max-width:140px;border-radius:8px} .btn{display:inline-block;margin-top:10px;padding:10px 14px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;font-weight:700}</style>
      </head><body><div class="card"><div class="header"><img src="https://www.hunacreatives.com/images/fc04818c74ad69bdfb22b93a6a0c6a72.png" class="logo"/><div><div style="font-size:12px;color:#6b7280">Payment Preview</div><div style="font-size:14px;font-weight:700">${project.project_name} — ${form.invoice_number || ''}</div></div></div>
      <div><div style="font-size:12px;color:#6b7280">Amount due</div><div class="amount">${fmt(amountDue)}</div></div>
      <div style="margin-top:12px;color:#6b7280">Choose your payment channel and follow the instructions to complete payment. This is a preview — uploads are disabled.</div>
      <div class="channels">
        <div class="chan"><div style="font-weight:700">GCash</div><img src="https://www.hunacreatives.com/images/qr-gcash.jpg" alt="GCash QR"/><div><a class="btn" href="#" onclick="window.open('https://www.hunacreatives.com/images/qr-gcash.jpg','_blank')">Open QR</a></div></div>
        <div class="chan"><div style="font-weight:700">BDO InstaPay</div><img src="https://www.hunacreatives.com/images/qr-bdo.jpg" alt="BDO QR"/><div><a class="btn" href="#" onclick="window.open('https://www.hunacreatives.com/images/qr-bdo.jpg','_blank')">Open QR</a></div></div>
        <div class="chan"><div style="font-weight:700">GoTyme</div><img src="https://www.hunacreatives.com/images/qr-gotyme.jpg" alt="GoTyme QR"/><div><a class="btn" href="#" onclick="window.open('https://www.hunacreatives.com/images/qr-gotyme.jpg','_blank')">Open QR</a></div></div>
      </div>
      <div style="margin-top:18px;font-size:13px;color:#374151">Reference: ${form.reference || '—'}</div>
      <div style="margin-top:10px;font-size:13px;color:#374151">To test an actual submission, send a real invoice — this preview is local only.</div>
      </div></body></html>`;
    const loadingHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preparing payment preview…</title>
      <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#111827} .muted{color:#6b7280}</style></head><body><h2>Preparing payment preview…</h2><p class="muted">Please wait while we create a secure preview link.</p></body></html>`;
    try {
      win.document.open();
      win.document.write(loadingHtml);
      win.document.close();

      const SUPABASE_URL = (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string) || (import.meta.env.VITE_SUPABASE_URL as string) || '';
      const SUPABASE_ANON_KEY = (import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string) || (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';
      const payload = buildSendPayload();
      if (!payload) {
        // if payload can't be built, show local preview content
        win.document.open();
        win.document.write(staticPreviewHtml);
        win.document.close();
        return;
      }
      const bodyPayload: any = { ...(payload as any), preview_only: true, app_base_url: window.location.origin };
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify(bodyPayload),
      });
      const body = await res.json().catch(() => null);
      const token = body?.token || body?.paymentLink?.token || null;
      if (token) {
        setPreviewToken(token);
        // navigate the already-opened window to the real pay route (user gesture preserved)
        win.location.href = `${window.location.origin}/pay/${token}`;
        return;
      }
      // fallback: write the static preview into the popup
      win.document.open();
      win.document.write(staticPreviewHtml);
      win.document.close();
    } catch (err) {
      // on error, write local preview
      win.document.open();
      win.document.write(staticPreviewHtml);
      win.document.close();
    }
  };

  const loadNextInvoiceNumber = async () => {
    const [sentRes, scheduledRes] = await Promise.all([
      supabase.from('hub_invoice_log').select('invoice_number').order('id', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('hub_scheduled_invoices').select('invoice_number').order('id', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const latest = [sentRes.data?.invoice_number, scheduledRes.data?.invoice_number]
      .map((value) => parseInt(String(value ?? ''), 10))
      .filter((value) => !Number.isNaN(value));

    if (latest.length === 0) return '0001';
    return String(Math.max(...latest) + 1).padStart(4, '0');
  };

  useEffect(() => {
    const load = async () => {
      if (!projectId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [{ data: projectData }, nextInvoiceNumber] = await Promise.all([
          supabase
            .from('hub_projects')
            .select('id, client_name, project_name, service, contract_price, start_date, deadline, contact_email, hub_project_payments(id, amount, paid_at, notes, receipt_url)')
            .eq('id', Number(projectId))
            .maybeSingle(),
          loadNextInvoiceNumber(),
        ]);

        const nextProject = (projectData as InvoiceProjectSnapshot | null) ?? null;
        setProject(nextProject);

        if (nextProject) {
          const defaults = buildInvoiceDefaults(nextProject, nextInvoiceNumber);
          const storedDraft = window.localStorage.getItem(draftKey);
          if (storedDraft) {
            try {
              const parsed = JSON.parse(storedDraft) as {
                form: InvoiceBuilderFormState;
                lineItems: InvoiceLineItem[];
                includePaymentHistory: boolean;
              };
              setForm({ ...defaults, ...parsed.form });
              setLineItems(parsed.lineItems?.length ? parsed.lineItems : buildDefaultInvoiceLineItems(nextProject));
              setIncludePaymentHistory(parsed.includePaymentHistory ?? true);
            } catch (error) {
              setForm(defaults);
              setLineItems(buildDefaultInvoiceLineItems(nextProject));
              setIncludePaymentHistory(true);
            }
          } else {
            setForm(defaults);
            setLineItems(buildDefaultInvoiceLineItems(nextProject));
            setIncludePaymentHistory(true);
          }
        }
      } catch (error) {
        console.error('Failed to load invoice builder project', error);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [draftKey, projectId]);

  const validLineItems = useMemo(
    () => lineItems.filter((item) => item.description.trim() && item.amount !== ''),
    [lineItems],
  );

  const subtotal = useMemo(
    () => validLineItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
    [validLineItems],
  );
  const totalPaid = (project?.hub_project_payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
  const amountRequested = form.amount_requested ? parseFloat(form.amount_requested) : NaN;
  const balanceDue = Number.isFinite(amountRequested) ? amountRequested : subtotal;

  const previewHtml = useMemo(() => {
    if (!project) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://hunacreatives.com';
    // Always show pay buttons in live preview using a static preview URL
    // The "Preview payment page" button creates a real token for actual payment testing
    const payUrl = `${origin}/pay/preview`;
    return buildInvoicePreviewHtml({
      project,
      form,
      lineItems,
      includePaymentHistory,
      payUrl,
    });
  }, [form, includePaymentHistory, lineItems, project]);

  const updateForm = (patch: Partial<InvoiceBuilderFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const updateLineItem = (index: number, patch: Partial<InvoiceLineItem>) => {
    setLineItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const validateRecipients = () => {
    const toList = parseEmailList(form.send_to);
    const ccList = parseEmailList(form.cc);

    if (toList.length === 0 || toList.some((email) => !isValidEmail(email))) {
      return 'Enter at least one valid "Send To" email.';
    }
    if (ccList.some((email) => !isValidEmail(email))) {
      return 'One or more CC emails are invalid.';
    }
    return null;
  };

  const buildSendPayload = () => {
    if (!project) return null;
    const filteredLineItems = validLineItems.length > 0 ? validLineItems : buildDefaultInvoiceLineItems(project);
    return {
      to: parseEmailList(form.send_to),
      cc: parseEmailList(form.cc),
      subject: `Invoice #${form.invoice_number} — ${project.project_name}`,
      client_name: form.client_name.trim() || project.client_name,
      project_name: project.project_name,
      service: project.service,
      contract_price: project.contract_price,
      start_date: project.start_date,
      issue_date: form.issue_date || null,
      deadline: form.due_date || project.deadline,
      payments: project.hub_project_payments,
      show_payments: includePaymentHistory,
      line_items: filteredLineItems,
      notes: form.payment_instructions.trim() || null,
      bill_to_name: form.client_name.trim() || project.client_name,
      bill_to_address: form.billing_address.trim() || null,
      reference: form.reference.trim() || null,
      payment_terms: form.payment_terms.trim() || null,
      message: form.customer_notes.trim() || null,
      invoice_number: form.invoice_number.trim(),
      project_id: project.id,
      app_base_url: 'https://hunacreatives.com',
      amount_requested: balanceDue,
      currency: form.currency,
    };
  };

  const saveDraft = async () => {
    if (!project) return;
    setSavingDraft(true);
    window.localStorage.setItem(draftKey, JSON.stringify({ form, lineItems, includePaymentHistory }));
    if (form.send_to.trim() !== (project.contact_email ?? '').trim()) {
      await supabase.from('hub_projects').update({ contact_email: form.send_to.trim() || null }).eq('id', project.id);
    }
    setSavingDraft(false);
    setStatus({ ok: true, text: 'Draft saved locally for this project.' });
  };

  const previewPdf = () => {
    if (!project) return;
    const win = window.open('', '_blank', 'width=1200,height=840');
    if (!win) return;
    win.document.open();
    win.document.write(buildInvoicePreviewHtml({
      project,
      form,
      lineItems,
      includePaymentHistory,
      payUrl: 'https://hunacreatives.com/pay/preview',
      printOnLoad: true,
    }));
    win.document.close();
  };

  const sendInvoice = async () => {
    if (!project) return;

    const recipientError = validateRecipients();
    if (recipientError) {
      setStatus({ ok: false, text: recipientError });
      return;
    }

    setSending(true);
    setStatus(null);
    const payload = buildSendPayload();
    if (!payload) {
      setSending(false);
      return;
    }

    const invokePromise = supabase.functions.invoke('send-invoice', { body: payload });
    const timeoutPromise = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('Invoice sending timed out. Please try again.')), 45000);
    });

    let data: any;
    let error: any;
    try {
      ({ data, error } = await Promise.race([invokePromise, timeoutPromise]) as any);
    } catch (err) {
      error = err;
    } finally {
      setSending(false);
    }

    if (error || data?.error) {
      setStatus({ ok: false, text: data?.error ?? error?.message ?? 'Failed to send invoice.' });
      return;
    }

    await supabase.from('hub_projects').update({ contact_email: form.send_to.trim() || null }).eq('id', project.id);
    window.localStorage.removeItem(draftKey);
    setStatus({ ok: true, text: 'Invoice sent successfully.' });
  };

  if (loading) {
    return (
      <AdminLayout title="Invoice Builder">
        <div className="flex items-center justify-center py-20">
          <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
        </div>
      </AdminLayout>
    );
  }

  if (!project) {
    return (
      <AdminLayout title="Invoice Builder">
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
          <p className="text-sm font-medium text-gray-900">Project not found</p>
          <p className="text-sm text-gray-500 mt-1">Open the builder from a project workspace to create an invoice.</p>
          <button
            onClick={() => navigate('/hub/admin/projects')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#111827] px-4 py-2.5 text-sm font-medium text-white hover:bg-black cursor-pointer"
          >
            Back to Projects
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Invoice Builder">
      <div className="space-y-5">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1c2b3a]">Billing Workspace</p>
              <h1 className="mt-2 text-2xl font-bold text-[#111827]">{project.project_name}</h1>
              <p className="mt-1 text-sm text-gray-500">{project.client_name} · Build the invoice while seeing the final document live.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => navigate('/hub/admin/projects')}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={saveDraft}
                disabled={savingDraft}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                {savingDraft ? 'Saving Draft…' : 'Save Draft'}
              </button>
              <button
                onClick={previewPdf}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Preview PDF
              </button>
              <button
                onClick={sendInvoice}
                disabled={sending}
                className="rounded-xl bg-[#1c2b3a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0f1c28] disabled:opacity-50 cursor-pointer"
              >
                {sending ? 'Sending…' : 'Send Invoice'}
              </button>
            </div>
          </div>
          {status && (
            <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${status.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
              {status.text}
            </div>
          )}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(420px,0.98fr)]">
          <div className="space-y-5">
            <section className="bg-white border border-gray-100 rounded-2xl p-5 md:p-6">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[#111827]">Client Details</p>
                <p className="text-xs text-gray-400 mt-1">Who receives the invoice and how they should see themselves on the document.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-600">Send To</span>
                  <input value={form.send_to} onChange={(e) => updateForm({ send_to: e.target.value })} placeholder="client@email.com"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-600">CC</span>
                  <input value={form.cc} onChange={(e) => updateForm({ cc: e.target.value })} placeholder="finance@client.com, partner@client.com"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-600">Client Name</span>
                  <input value={form.client_name} onChange={(e) => updateForm({ client_name: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                </label>
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-medium text-gray-600">Billing Address</span>
                  <textarea value={form.billing_address} onChange={(e) => updateForm({ billing_address: e.target.value })} rows={3}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                </label>
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-medium text-gray-600">Reference / PO</span>
                  <input value={form.reference} onChange={(e) => updateForm({ reference: e.target.value })} placeholder="PO-1042"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                </label>
              </div>
            </section>

            <section className="bg-white border border-gray-100 rounded-2xl p-5 md:p-6">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[#111827]">Invoice Settings</p>
                <p className="text-xs text-gray-400 mt-1">Document identity, timing, and how money is presented.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-600">Invoice Number</span>
                  <input value={form.invoice_number} onChange={(e) => updateForm({ invoice_number: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-600">Currency</span>
                  <select value={form.currency} onChange={(e) => updateForm({ currency: e.target.value as 'PHP' | 'USD' })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]">
                    <option value="PHP">PHP</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-600">Issue Date</span>
                  <input type="date" value={form.issue_date} onChange={(e) => updateForm({ issue_date: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-600">Due Date</span>
                  <input type="date" value={form.due_date} onChange={(e) => updateForm({ due_date: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                </label>
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-medium text-gray-600">Payment Terms</span>
                  <input value={form.payment_terms} onChange={(e) => updateForm({ payment_terms: e.target.value })} placeholder="Due on receipt"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                </label>
              </div>
            </section>

            <section className="bg-white border border-gray-100 rounded-2xl p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#111827]">Line Items</p>
                  <p className="text-xs text-gray-400 mt-1">Build the invoice like a document, one charge at a time.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLineItems((current) => [...current, { description: '', amount: '' }])}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-[#1c2b3a] hover:bg-slate-100 cursor-pointer"
                >
                  <i className="ri-add-line"></i>
                  Add Item
                </button>
              </div>
              <div className="space-y-3">
                {lineItems.map((item, index) => (
                  <div key={index} className="grid gap-3 rounded-xl border border-gray-100 bg-[#fcfcfc] p-3 md:grid-cols-[minmax(0,1fr)_160px_44px]">
                    <input
                      value={item.description}
                      onChange={(e) => updateLineItem(index, { description: e.target.value })}
                      placeholder="Description"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]"
                    />
                    <input
                      type="number"
                      value={item.amount}
                      onChange={(e) => updateLineItem(index, { amount: e.target.value })}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]"
                    />
                    <button
                      type="button"
                      onClick={() => setLineItems((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))}
                      className="rounded-xl border border-gray-200 text-gray-400 hover:text-rose-500 hover:border-rose-200 cursor-pointer"
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white border border-gray-100 rounded-2xl p-5 md:p-6">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[#111827]">Payment History</p>
                <p className="text-xs text-gray-400 mt-1">Choose whether received payments should appear in the invoice record.</p>
              </div>
              <label className="inline-flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={includePaymentHistory}
                  onChange={(e) => setIncludePaymentHistory(e.target.checked)}
                  className="h-4 w-4 accent-[#1c2b3a]"
                />
                <span className="text-sm text-gray-700">Include payment history on invoice</span>
              </label>
            </section>

            <section className="bg-white border border-gray-100 rounded-2xl p-5 md:p-6">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[#111827]">Notes</p>
                <p className="text-xs text-gray-400 mt-1">Add context for the client and instructions for how they should pay.</p>
              </div>
              <div className="grid gap-4">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-600">Customer Notes</span>
                  <textarea value={form.customer_notes} onChange={(e) => updateForm({ customer_notes: e.target.value })} rows={4}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-600">Payment Instructions</span>
                  <textarea value={form.payment_instructions} onChange={(e) => updateForm({ payment_instructions: e.target.value })} rows={4}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-600">Amount due</span>
                  <input value={form.amount_requested} onChange={(e) => updateForm({ amount_requested: e.target.value })}
                    className="w-full rounded-xl border border-[#1c2b3a] px-3 py-2.5 text-sm font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/25 focus:border-[#1c2b3a]" />
                </label>
              </div>
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6 self-start">
            <div className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div>
                  <p className="text-sm font-semibold text-[#111827]">Live Preview</p>
                  <p className="text-xs text-gray-400 mt-1">This mirrors the final invoice document.</p>
                </div>
                <div className="text-right text-xs text-gray-400">
                  <div>Subtotal: {formatInvoiceCurrency(subtotal, form.currency)}</div>
                  <div>Amount due: <span className="font-semibold text-[#1c2b3a]">{formatInvoiceCurrency(balanceDue, form.currency)}</span></div>
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-[#f7f7f7]">
                <iframe title="Invoice preview" srcDoc={previewHtml} className="h-[980px] w-full bg-white" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AdminLayout>
  );
}

