import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';

const SUPABASE_URL =
  (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string)
  || (import.meta.env.VITE_SUPABASE_URL as string)
  || '';
const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string)
  || (import.meta.env.VITE_SUPABASE_ANON_KEY as string)
  || '';

type ChannelId = 'gcash' | 'bdo' | 'gotyme';

interface PaymentLinkData {
  id: string;
  token: string;
  client_name: string;
  project_name: string;
  invoice_number: string;
  to_email: string;
  amount_due: number;
  due_date: string | null;
  line_items: { description: string; amount: string }[] | null;
  payment_terms: string | null;
  reference: string | null;
  status: 'open' | 'submitted' | 'closed';
  submitted_at: string | null;
}

interface ProofData {
  payer_name: string;
  payer_email: string | null;
  payment_channel: string;
  amount: number | null;
  reference_number: string | null;
  notes: string | null;
  proof_url: string | null;
  submitted_at: string;
}

const channelLogos: Record<ChannelId, string> = {
  gcash:  '/images/logo-gcash.png',
  bdo:    '/images/logo-bdo.png',
  gotyme: '/images/logo-gotyme.png',
};

const ChannelLogo = ({ id }: { id: ChannelId }) => (
  <img src={channelLogos[id]} alt={id} className="w-12 h-12 object-contain rounded-xl" />
);

const channels: Record<ChannelId, { label: string; qr: string }> = {
  gcash:  { label: 'GCash',        qr: 'https://www.hunacreatives.com/images/qr-gcash.jpg' },
  bdo:    { label: 'BDO InstaPay', qr: 'https://www.hunacreatives.com/images/qr-bdo.jpg'   },
  gotyme: { label: 'GoTyme',       qr: 'https://www.hunacreatives.com/images/qr-gotyme.jpg'},
};

const fmt = (n: number | null) =>
  n == null ? '—' : `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const downloadQR = async (url: string, label: string) => {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${label.replace(/\s+/g, '-')}-QR.jpg`;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank');
  }
};

export default function PublicPaymentPage() {
  const { token } = useParams<{ token: string }>();
  const isDemoToken = token === 'demo' || token === 'preview';
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [link, setLink] = useState<PaymentLinkData | null>(null);
  const [proof, setProof] = useState<ProofData | null>(null);
  const [selected, setSelected] = useState<ChannelId | null>(null);
  const [showChannels, setShowChannels] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const channelsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    if (isDemoToken) {
      // For preview tokens, read invoice data from sessionStorage (set by invoice builder buttons)
      let previewData = null;
      try {
        const stored = window.sessionStorage.getItem('previewInvoiceData');
        if (stored) previewData = JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse preview invoice data:', e);
      }
      // Read invoice data from URL query params (set by the Pay Now button in the invoice preview)
      const qp = new URLSearchParams(window.location.search);
      const clientFromUrl = qp.get('client');
      if (token === 'preview' && clientFromUrl) {
        setLink({
          id: 'preview', token: 'preview',
          client_name: clientFromUrl,
          project_name: qp.get('project') || 'Project',
          invoice_number: qp.get('invoice') || '0000',
          to_email: '',
          amount_due: parseFloat(qp.get('amount') || '0') || 0,
          due_date: qp.get('due') || null,
          line_items: [{ description: qp.get('service') || 'Service', amount: qp.get('amount') || '0' }],
          payment_terms: null,
          reference: null,
          status: 'open',
          submitted_at: null,
        });
      } else if (token === 'preview' && previewData) {
        setLink({
          id: 'preview', token: 'preview',
          client_name: previewData.client || 'Client Name',
          project_name: previewData.project || 'Project Name',
          invoice_number: previewData.invoice || '0000',
          to_email: '',
          amount_due: previewData.amount || 0,
          due_date: previewData.due || null,
          line_items: [{ description: previewData.service || 'Service', amount: String(previewData.amount || 0) }],
          payment_terms: null,
          reference: null,
          status: 'open',
          submitted_at: null,
        });
      } else {
        // Fallback demo data
        setLink({
          id: 'demo', token: 'demo', client_name: 'FS Architects', project_name: 'fsarchitects.ph',
          invoice_number: '0001', to_email: 'billing@example.com', amount_due: 28864.54,
          due_date: null, line_items: [{ description: 'Website Design', amount: '48864.54' }],
          payment_terms: 'Due upon receipt', reference: 'INV-0001', status: 'open', submitted_at: null,
        });
      }
      setLoading(false);
      return;
    }
    fetch(`${SUPABASE_URL}/functions/v1/get-payment-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ token: token.trim() }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
        return body;
      })
      .then((body) => {
        if (!body?.ok || !body.link) { setNotFound(true); return; }
        setLink(body.link as PaymentLinkData);
        setProof(body.proof ?? null);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token, isDemoToken]);

  // Preselect channel from query param if present (e.g. ?channel=gcash)
  const location = useLocation();
  useEffect(() => {
    if (!link) return;
    const params = new URLSearchParams(location.search);
    const channel = params.get('channel');
    if (!channel) return;
    if (channel === 'gcash' || channel === 'bdo' || channel === 'gotyme') {
      setShowChannels(true);
      setSelected(channel as ChannelId);
      setTimeout(() => qrRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }, [link, location.search]);


  const openChannels = () => {
    setShowChannels(true);
    setTimeout(() => channelsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const selectChannel = (id: ChannelId) => {
    setSelected(id);
    setTimeout(() => {
      qrRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const submit = async () => {
    if (!token || !link || !selected) return;
    if (isDemoToken) { setMessage({ ok: false, text: 'Demo mode only. Send a real invoice to use live proof submission.' }); return; }
    if (!file) { setMessage({ ok: false, text: 'Please attach a screenshot or file as proof of payment.' }); return; }
    setSubmitting(true);
    setMessage(null);
    const body = new FormData();
    body.append('token', token);
    body.append('payer_name', link.client_name);
    body.append('payer_email', link.to_email);
    body.append('payment_channel', channels[selected].label);
    body.append('amount', String(link.amount_due));
    body.append('reference_number', '');
    body.append('notes', '');
    body.append('proof', file);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-payment-proof`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body,
      });
      const result = await res.json();
      if (!result?.ok) { setMessage({ ok: false, text: result?.error ?? 'Failed to submit proof of payment.' }); return; }
      const submittedAt = new Date().toISOString();
      setProof({
        payer_name: link.client_name, payer_email: link.to_email,
        payment_channel: channels[selected].label, amount: link.amount_due,
        reference_number: null, notes: null,
        proof_url: result.proof_url ?? null, submitted_at: submittedAt,
      });
      setLink({ ...link, status: 'submitted', submitted_at: submittedAt });
      setSubmitted(true);
    } catch {
      setMessage({ ok: false, text: 'Something went wrong. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-2xl text-gray-400"></i>
      </div>
    );
  }

  if (notFound || !link) {
    return (
      <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <i className="ri-error-warning-line text-xl text-gray-400"></i>
          </div>
          <h1 className="text-lg font-bold text-[#111827]">Payment link unavailable</h1>
          <p className="text-sm text-gray-500 mt-2">This payment link is invalid, expired, or no longer active.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f5f4f0]">
        <div className="bg-[#111827] px-6 py-4">
          <div className="max-w-xl mx-auto">
            <img src="https://www.hunacreatives.com/images/fc04818c74ad69bdfb22b93a6a0c6a72.png" alt="Huna Creatives" className="h-6" />
          </div>
        </div>

        <div className="max-w-xl mx-auto px-4 py-10 space-y-5">
          {/* Thank you card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
              <i className="ri-check-double-line text-2xl text-emerald-600"></i>
            </div>
            <h1 className="text-2xl font-bold text-[#111827] mt-5">Thank you for your payment!</h1>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              We've received your proof of payment for <span className="font-semibold text-[#111827]">{link?.project_name}</span>. Our billing team will verify and confirm within 1–2 business days.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-xs text-gray-500">
              <i className="ri-mail-line text-gray-400"></i>
              Questions? <a href="mailto:contact@hunacreatives.com" className="text-[#FF6B35] font-medium">contact@hunacreatives.com</a>
            </div>
          </div>

          {/* Services */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Explore Our Services</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <a href="https://www.hunacreatives.com/portfolio/web-design" target="_blank" rel="noreferrer"
                className="flex flex-col gap-2 px-5 py-5 hover:bg-gray-50 transition-colors group">
                <div className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center">
                  <i className="ri-computer-line text-sm text-[#FF6B35]"></i>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#111827] group-hover:text-[#FF6B35] transition-colors">Website Design</p>
                  <p className="text-xs text-gray-400 mt-0.5">Custom sites that convert</p>
                </div>
                <i className="ri-arrow-right-up-line text-xs text-gray-300 group-hover:text-[#FF6B35] transition-colors mt-auto"></i>
              </a>
              <a href="https://www.hunacreatives.com/portfolio/social-media" target="_blank" rel="noreferrer"
                className="flex flex-col gap-2 px-5 py-5 hover:bg-gray-50 transition-colors group">
                <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center">
                  <i className="ri-instagram-line text-sm text-sky-500"></i>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#111827] group-hover:text-[#FF6B35] transition-colors">Social Media Marketing</p>
                  <p className="text-xs text-gray-400 mt-0.5">Content & growth strategy</p>
                </div>
                <i className="ri-arrow-right-up-line text-xs text-gray-300 group-hover:text-[#FF6B35] transition-colors mt-auto"></i>
              </a>
            </div>
            <div className="px-5 pb-4 pt-1 border-t border-gray-50">
              <a href="https://hunacreatives.com/services" target="_blank" rel="noreferrer"
                className="text-xs text-[#FF6B35] font-medium hover:underline flex items-center gap-1">
                View all services <i className="ri-arrow-right-line"></i>
              </a>
            </div>
          </div>

          {/* Sentro OS ad */}
          <a href="https://hunacreatives.com/sentro" target="_blank" rel="noreferrer"
            className="block bg-[#111827] rounded-2xl p-6 group hover:bg-[#0b1220] transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-white/40 font-semibold">Introducing</span>
                <h3 className="text-lg font-bold text-white mt-1">Sentro OS</h3>
                <p className="text-sm text-white/60 mt-1.5 leading-relaxed">
                  A smarter way to run your business — clients, projects, invoicing, and your team, all in one place.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF6B35]">
                  Learn more <i className="ri-arrow-right-line group-hover:translate-x-0.5 transition-transform"></i>
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <i className="ri-layout-grid-line text-xl text-white/70"></i>
              </div>
            </div>
          </a>

          <p className="text-center text-xs text-gray-400 pb-2">© {new Date().getFullYear()} Huna Creatives</p>
        </div>
      </div>
    );
  }

  const alreadySubmitted = link.status === 'submitted' && proof;
  const currentChannel = selected ? channels[selected] : null;

  return (
    <div className="min-h-screen bg-[#f5f4f0]">
      {/* Header */}
      <div className="bg-[#111827] px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <img src="https://www.hunacreatives.com/images/fc04818c74ad69bdfb22b93a6a0c6a72.png" alt="Huna Creatives" className="h-6" />
          <span className="text-[10px] uppercase tracking-widest text-white/40">Secure Payment</span>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-8 space-y-4">

        {/* Invoice Summary */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 pt-6 pb-4">
            <p className="text-[10px] uppercase tracking-widest text-[#FF6B35] font-semibold">Invoice Payment</p>
            <h1 className="text-xl font-bold text-[#111827] mt-1">{link.project_name}</h1>
            <p className="text-sm text-gray-500 mt-1">Hi {link.client_name.split(' ')[0]}, here's your outstanding balance.</p>
          </div>

          <div className="mx-6 mb-5 bg-[#111827] rounded-xl px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/50">Balance Due</p>
              <p className="text-2xl font-bold text-white mt-0.5">{fmt(link.amount_due)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-white/50">Invoice</p>
              <p className="text-sm font-semibold text-white/80 mt-0.5">#{link.invoice_number.padStart(4, '0')}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100">
            <MetaCell label="Client" value={link.client_name} />
            <MetaCell label="Due" value={link.due_date ? new Date(`${link.due_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} />
            <MetaCell label="Project" value={link.project_name} />
          </div>
        </div>


        {/* Pay Now button — shown until channels are revealed */}
        {!alreadySubmitted && !showChannels && (
          <button onClick={openChannels}
            className="w-full py-4 rounded-2xl bg-[#FF6B35] text-white text-base font-bold hover:bg-[#ea5c28] transition-colors cursor-pointer shadow-sm">
            Pay Now
          </button>
        )}

        {alreadySubmitted ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto">
              <i className="ri-check-line text-xl text-emerald-600"></i>
            </div>
            <h2 className="text-lg font-bold text-[#111827] mt-4">Proof received</h2>
            <p className="text-sm text-gray-500 mt-1">Your payment is with our billing team for review.</p>
            <div className="grid grid-cols-2 gap-3 mt-5 text-left">
              <InfoCell label="Channel" value={proof.payment_channel} />
              <InfoCell label="Amount" value={fmt(proof.amount)} />
              <InfoCell label="Submitted" value={new Date(proof.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
              {proof.proof_url && (
                <a href={proof.proof_url} target="_blank" rel="noreferrer"
                  className="col-span-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                  <i className="ri-image-line"></i> View submitted proof
                </a>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Step 1: Choose channel — logo only */}
            {showChannels && (
            <div ref={channelsRef} className="bg-white border border-gray-200 rounded-2xl overflow-hidden scroll-mt-6">
              <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Choose Payment Method</p>
                <p className="text-sm font-semibold text-[#111827] mt-0.5">Paying as {link.client_name}</p>
              </div>
              <div className="p-4 grid grid-cols-3 gap-3">
                {(Object.entries(channels) as [ChannelId, typeof channels[ChannelId]][]).map(([id, ch]) => {
                  const active = selected === id;
                  return (
                    <button key={id} type="button" onClick={() => selectChannel(id)}
                      className={`flex flex-col items-center gap-2.5 px-3 py-4 rounded-xl border-2 transition-all cursor-pointer ${
                        active ? 'border-[#FF6B35] bg-orange-50' : 'border-gray-100 hover:border-gray-200 bg-white'
                      }`}>
                      <ChannelLogo id={id} />
                      <span className={`text-xs font-semibold text-center leading-tight ${active ? 'text-[#FF6B35]' : 'text-gray-600'}`}>
                        {ch.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            )}

            {/* Step 2 & 3 — shown after channel selected */}
            {selected && currentChannel && (
              <>
                <div ref={qrRef} className="bg-white border border-gray-200 rounded-2xl overflow-hidden scroll-mt-6">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scan & Pay via {currentChannel.label}</p>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex items-center justify-center">
                      <img src={currentChannel.qr} alt={`${currentChannel.label} QR`} className="w-full max-w-xs rounded-lg" />
                    </div>

                    <button type="button" onClick={() => downloadQR(currentChannel.qr, currentChannel.label)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
                      <i className="ri-download-line"></i> Save QR to device
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
                        <p className="text-[10px] uppercase tracking-widest text-[#FF6B35]">Amount</p>
                        <p className="text-base font-bold text-[#111827] mt-0.5">{fmt(link.amount_due)}</p>
                      </div>
                      <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                        <p className="text-[10px] uppercase tracking-widest text-gray-400">Reference</p>
                        <p className="text-sm font-semibold text-[#111827] mt-0.5 truncate">
                          {link.reference || `INV-${link.invoice_number.padStart(4, '0')}`}
                        </p>
                      </div>
                    </div>

                    <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 space-y-1">
                      <p className="text-xs font-semibold text-[#FF6B35]">Before you continue</p>
                      <ul className="text-xs text-gray-500 space-y-1">
                        <li>• Open {currentChannel.label} and scan the QR code above.</li>
                        <li>• Enter the exact amount and include the reference number.</li>
                        <li>• Take a screenshot of your payment receipt.</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Step 3: Upload */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Upload Proof of Payment</p>
                  </div>
                  <div className="p-5 space-y-4">
                    <label className="block border-2 border-dashed border-gray-200 rounded-xl px-4 py-6 hover:border-[#FF6B35]/40 transition-colors cursor-pointer text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center">
                          <i className="ri-upload-cloud-2-line text-xl text-[#FF6B35]"></i>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#111827]">
                            {file ? file.name : 'Tap to upload screenshot or receipt'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, WEBP, or PDF — up to 10MB</p>
                        </div>
                      </div>
                      <input type="file" accept="image/*,application/pdf" className="hidden"
                        onChange={e => setFile(e.target.files?.[0] ?? null)} />
                    </label>

                    {message && (
                      <div className={`rounded-xl px-4 py-3 text-sm border ${message.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                        {message.text}
                      </div>
                    )}

                    <button onClick={submit} disabled={submitting || !file}
                      className="w-full py-3.5 rounded-xl bg-[#FF6B35] text-white text-sm font-semibold hover:bg-[#ea5c28] transition-colors disabled:opacity-40 cursor-pointer">
                      {submitting ? 'Submitting…' : 'Submit Proof of Payment'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <p className="text-center text-xs text-gray-400 pb-2">
          Questions? Email{' '}
          <a href="mailto:contact@hunacreatives.com" className="text-gray-500 underline underline-offset-2">contact@hunacreatives.com</a>
          {' '}— please do not reply to invoice emails directly.
        </p>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] uppercase tracking-widest text-gray-400">{label}</p>
      <p className="text-xs font-semibold text-[#111827] mt-0.5 truncate">{value}</p>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
      <p className="text-[10px] uppercase tracking-widest text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-[#111827] mt-0.5">{value}</p>
    </div>
  );
}
