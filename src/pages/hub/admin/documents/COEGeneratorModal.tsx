import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { HubUser } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  contractors: HubUser[];
  onClose: () => void;
  onDone: () => void;
}

function generateCOEHtml(
  employeeName: string,
  role: string,
  department: string,
  startDate: string,
  issuedDate: string,
  purpose: string,
  employmentStatus: string,
  monthlyRate: string,
  includeRate: boolean,
  logoData: string,
): string {
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const issued = new Date(issuedDate + 'T12:00:00');
  const docRef = `FSA/COE/${issued.getFullYear()}/${String(issued.getMonth() + 1).padStart(2, '0')}${String(issued.getDate()).padStart(2, '0')}-${employeeName.split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 4)}`;
  const yearsOfService = startDate
    ? (() => {
        const ms = new Date(issuedDate + 'T12:00:00').getTime() - new Date(startDate + 'T12:00:00').getTime();
        const yrs = Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25));
        const mos = Math.floor((ms % (1000 * 60 * 60 * 24 * 365.25)) / (1000 * 60 * 60 * 24 * 30.44));
        if (yrs === 0 && mos === 0) return 'less than one (1) month';
        if (yrs === 0) return `${mos} month${mos !== 1 ? 's' : ''}`;
        if (mos === 0) return `${yrs} year${yrs !== 1 ? 's' : ''}`;
        return `${yrs} year${yrs !== 1 ? 's' : ''} and ${mos} month${mos !== 1 ? 's' : ''}`;
      })()
    : null;

  const deptLine = department.trim() ? `, assigned to the <strong>${department.trim()}</strong> Department` : '';
  const rateLine = includeRate && monthlyRate
    ? `with a monthly salary of <strong>₱${Number(monthlyRate).toLocaleString()} PHP</strong>, `
    : '';
  const serviceLine = yearsOfService
    ? `having been in the company's employ since <strong>${fmt(startDate)}</strong> (${yearsOfService} of service)`
    : '';
  const purposeLine = purpose.trim()
    ? `This certification is issued upon the request of the above-named employee for the purpose of <strong>${purpose.trim()}</strong>, and for whatever legal purpose it may serve.`
    : 'This certification is issued upon the request of the above-named employee for whatever legal purpose it may serve.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 210mm; height: 297mm; background: #fff; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #111; line-height: 1.6; }
  .page { width: 210mm; height: 297mm; padding: 0 22mm 0 22mm; display: flex; flex-direction: column; overflow: hidden; }
  .header { display: flex; align-items: center; justify-content: space-between; background: #334049; margin: 0 -22mm; padding: 12pt 22pt; flex-shrink: 0; }
  .logo-block img { height: 48pt; width: auto; display: block; filter: invert(1) brightness(2); }
  .header-contact { text-align: right; font-size: 8pt; color: #a8b9c9; line-height: 1.8; }
  .header-rule { display: none; }
  .body-wrap { flex: 1; display: flex; flex-direction: column; padding: 18pt 0 0 0; overflow: hidden; }
  .doc-label { font-size: 8pt; letter-spacing: 0.15em; text-transform: uppercase; color: #666; font-family: Arial, sans-serif; margin-bottom: 3pt; }
  .doc-title { font-size: 16pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 4pt; font-family: Arial, sans-serif; }
  .doc-subtitle { font-size: 9pt; color: #555; font-family: Arial, sans-serif; margin-bottom: 20pt; }
  p { text-align: justify; margin-bottom: 10pt; font-size: 10.5pt; }
  .body-content { flex: 1; }
  .sig-block { margin-top: 24pt; flex-shrink: 0; }
  .sig-line { border-top: 1pt solid #111; width: 200pt; margin-bottom: 3pt; }
  .sig-name { font-size: 10pt; font-weight: bold; font-family: Arial, sans-serif; }
  .sig-title { font-size: 8.5pt; color: #555; font-family: Arial, sans-serif; }
  .sig-date { font-size: 8.5pt; color: #777; font-family: Arial, sans-serif; margin-top: 2pt; }
  .footer-band { background: #334049; margin: 16pt -22mm 0 -22mm; padding: 12pt 22pt; flex-shrink: 0; }
  .footer-band-ref { font-size: 7.5pt; color: #a8b9c9; font-family: Arial, sans-serif; letter-spacing: 0.08em; margin-bottom: 4pt; }
  .footer-band-text { font-size: 7pt; color: #7a99af; font-family: Arial, sans-serif; line-height: 1.6; }
  @page { size: A4 portrait; margin: 0; }
  @media print { html, body { width: 210mm; height: 297mm; } .page { width: 210mm; height: 297mm; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo-block">
      <img src="${logoData}" alt="FS Architects" />
    </div>
    <div class="header-contact">
      info@fsarchitects.ph<br />
      Cebu City, Philippines
    </div>
  </div>
  <hr class="header-rule" />

  <div class="body-wrap">
    <div class="body-content">
      <div class="doc-label">Official Document</div>
      <div class="doc-title">Certificate of Employment</div>
      <div class="doc-subtitle">FS Architects · Cebu City, Philippines</div>

      <p>TO WHOM IT MAY CONCERN:</p>

      <p>This is to certify that <strong>${employeeName}</strong> is a <strong>${employmentStatus}</strong> employee of <strong>FS Architects</strong>${deptLine}, holding the position of <strong>${role}</strong>${serviceLine ? ', ' + serviceLine : ''}, ${rateLine}as of the date of this certification.</p>

      <p>${purposeLine}</p>

      <p>This certification is issued in good faith to attest to the truthfulness of the aforementioned facts.</p>
    </div>

    <div class="sig-block">
      <p style="margin-bottom:22pt;">Issued on <strong>${fmt(issuedDate)}</strong> at Cebu City, Philippines.</p>
      <div class="sig-line"></div>
      <div class="sig-name">Fretz I. Suralta</div>
      <div class="sig-title">Owner / Principal Architect</div>
      <div class="sig-title">FS Architects</div>
      <div class="sig-date">${fmt(issuedDate)}</div>
    </div>
  </div>

  <div class="footer-band">
    <div class="footer-band-ref">Document Reference: ${docRef} &nbsp;·&nbsp; Issued: ${fmt(issuedDate)}</div>
    <div class="footer-band-text">
      This Certificate of Employment is issued in accordance with the Labor Code of the Philippines and DOLE Department Order No. 174-17.
      It is valid only with the original wet signature of the authorized signatory. Any erasure, alteration, or unauthorized reproduction renders this document void.
      Falsification of this document is punishable under Article 172 of the Revised Penal Code of the Philippines.
      For verification, contact: <strong style="color:#c8d9e4;">info@fsarchitects.ph</strong>
    </div>
  </div>
</div>
</body>
</html>`;
}

export default function COEGeneratorModal({ contractors, onClose, onDone }: Props) {
  const { hubUser } = useAuth();
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [previewHtml, setPreviewHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const [manualMode, setManualMode] = useState(false);
  const [contractorId, setContractorId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [startDate, setStartDate] = useState('');
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [purpose, setPurpose] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('regular');
  const [monthlyRate, setMonthlyRate] = useState('');
  const [includeRate, setIncludeRate] = useState(false);

  const handleContractorChange = (id: string) => {
    const c = contractors.find(x => x.id === id);
    setContractorId(id);
    setEmployeeName(c?.full_name ?? '');
  };

  const switchMode = (manual: boolean) => {
    setManualMode(manual);
    setContractorId('');
    setEmployeeName('');
  };

  const handlePreview = async () => {
    const toDataUrl = async (url: string) => {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch { return url; }
    };
    const logoDataUrl = await toDataUrl(`${window.location.origin}/images/fs-architects-logo-horizontal.png`);
    const html = generateCOEHtml(employeeName, role, department, startDate, issuedDate, purpose, employmentStatus, monthlyRate, includeRate, logoDataUrl);
    setPreviewHtml(html);
    setStep('preview');
  };

  const handleSave = async () => {
    if (!employeeName.trim()) return;
    setSaving(true);

    const title = `Certificate of Employment – ${employeeName}`;
    const description = `Issued ${new Date(issuedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

    const { data: doc, error } = await supabase
      .from('hub_sign_documents')
      .insert({
        title,
        description,
        file_url: '',
        file_name: '',
        content: previewHtml,
        is_generated: true,
        amendment_type: 'coe',
        rate_snapshot: null,
        uploaded_by: hubUser!.id,
      })
      .select('id')
      .single();

    if (error || !doc) {
      console.error('[COE save error]', error);
      setToast(`Failed to save COE: ${error?.message ?? 'unknown error'}`);
      setSaving(false);
      return;
    }

    if (contractorId) {
      await supabase
        .from('hub_sign_assignments')
        .insert({ document_id: doc.id, contractor_id: contractorId });
    }

    const printHtml = previewHtml.replace('</body>', '<script>window.onload=function(){window.print();}</script></body>');
    const blob = new Blob([printHtml], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');

    setSaving(false);
    onDone();
  };

  const openInTab = () => {
    const blob = new Blob([previewHtml], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const canPreview = !!(manualMode ? employeeName.trim() : contractorId) && !!role.trim() && !!issuedDate;

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      {toast && (
        <div className="fixed top-5 right-5 z-[60] bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">{toast}</div>
      )}
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            {step === 'preview' && (
              <button onClick={() => setStep('form')} className="text-gray-400 hover:text-gray-700 cursor-pointer">
                <i className="ri-arrow-left-line text-lg" />
              </button>
            )}
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {step === 'form' ? 'Generate Certificate of Employment' : 'Preview COE'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {step === 'form' ? 'Fill in the details — Fretz signs the printed copy' : 'Review before sending to employee'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {step === 'form' && (
          <div className="overflow-y-auto flex-1 p-5 space-y-4">

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls}>Employee *</label>
                <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                  <button type="button" onClick={() => switchMode(false)}
                    className={`text-xs px-2.5 py-1 rounded-md transition-all cursor-pointer ${!manualMode ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'}`}>
                    From hub
                  </button>
                  <button type="button" onClick={() => switchMode(true)}
                    className={`text-xs px-2.5 py-1 rounded-md transition-all cursor-pointer ${manualMode ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'}`}>
                    Manual
                  </button>
                </div>
              </div>
              {manualMode ? (
                <input type="text" value={employeeName} onChange={e => setEmployeeName(e.target.value)}
                  placeholder="Full name of employee" className={inputCls} />
              ) : (
                <select value={contractorId} onChange={e => handleContractorChange(e.target.value)}
                  className={`${inputCls} bg-white cursor-pointer`}>
                  <option value="">Select employee…</option>
                  {contractors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Role / Position *</label>
                <input type="text" value={role} onChange={e => setRole(e.target.value)}
                  placeholder="e.g. Architectural Draftsman" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Department</label>
                <input type="text" value={department} onChange={e => setDepartment(e.target.value)}
                  placeholder="e.g. Architecture" className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Employment Status *</label>
              <div className="flex gap-2">
                {(['regular', 'probationary', 'project-based'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setEmploymentStatus(s)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all capitalize ${
                      employmentStatus === s ? 'bg-[#1c2b3a] border-[#1c2b3a] text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Date Started</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Date of Issue *</label>
                <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Purpose <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)}
                placeholder="e.g. visa application, loan purposes, bank requirements"
                className={inputCls} />
            </div>

            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={includeRate} onChange={e => setIncludeRate(e.target.checked)} className="accent-[#1c2b3a]" />
                <span className="text-sm font-medium text-gray-700">Include monthly salary</span>
              </label>
              {includeRate && (
                <div>
                  <label className={labelCls}>Monthly Rate (₱)</label>
                  <input type="number" value={monthlyRate} onChange={e => setMonthlyRate(e.target.value)}
                    placeholder="e.g. 25000" className={inputCls} />
                </div>
              )}
            </div>

          </div>
        )}

        {step === 'preview' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 px-5 py-3 bg-amber-50 border-b border-amber-100 flex-shrink-0">
              <i className="ri-information-line text-amber-500" />
              <p className="text-xs text-amber-700">Print the document, have Fretz sign physically, then mark it "Ready for Pickup" in the Documents list.</p>
              <button onClick={openInTab} className="ml-auto text-xs text-[#1c2b3a] cursor-pointer whitespace-nowrap hover:underline flex-shrink-0">
                Open in new tab <i className="ri-external-link-line" />
              </button>
            </div>
            <iframe srcDoc={previewHtml} className="flex-1 w-full" title="COE Preview" sandbox="allow-same-origin" />
          </div>
        )}

        <div className="p-5 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 cursor-pointer">
            Cancel
          </button>
          {step === 'form' ? (
            <button onClick={handlePreview} disabled={!canPreview}
              className="flex-1 bg-[#111827] text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 cursor-pointer disabled:opacity-40">
              Preview COE →
            </button>
          ) : (
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-[#1c2b3a] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#0f1c28] cursor-pointer disabled:opacity-40">
              {saving ? 'Saving…' : 'Save & Print'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
