import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { HubUser } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';

function printDoc(html: string) {
  const win = window.open('', '_blank', 'width=794,height=1123');
  if (!win) return;
  const withPrint = html.replace('</body>', '<script>window.onload=function(){window.focus();window.print();}<\/script></body>');
  win.document.open();
  win.document.write(withPrint);
  win.document.close();
}

function numToWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (n === 0) return 'Zero';
  let w = '';
  if (n >= 1000000) { w += numToWords(Math.floor(n / 1000000)) + ' Million '; n %= 1000000; }
  if (n >= 1000) { w += numToWords(Math.floor(n / 1000)) + ' Thousand '; n %= 1000; }
  if (n >= 100) { w += ones[Math.floor(n / 100)] + ' Hundred '; n %= 100; }
  if (n >= 20) { w += tens[Math.floor(n / 10)]; if (n % 10) w += '-' + ones[n % 10]; w += ' '; }
  else if (n > 0) w += ones[n] + ' ';
  return w.trim();
}

interface Props {
  contractors: HubUser[];
  onClose: () => void;
  onDone: () => void;
}

interface ContractFields {
  contractorId: string;
  contractorName: string;
  employeeAddress: string;
  roleTitle: string;
  effectiveDate: string;
  endDate: string;
  monthlyRate: string;
  annualLeaveDays: string;
  sickLeaveDays: string;
  amendmentType: string;
}

const BLANK: ContractFields = {
  contractorId: '',
  contractorName: '',
  employeeAddress: '',
  roleTitle: '',
  effectiveDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  monthlyRate: '',
  annualLeaveDays: '5',
  sickLeaveDays: '5',
  amendmentType: 'initial',
};

function pageHeader(logoData: string) {
  return `
  <div class="pg-header">
    <img src="${logoData}" alt="FS Architects" class="logo" />
    <div class="header-rule"><div class="rule-thick"></div><div class="rule-thin"></div></div>
  </div>`;
}

function pageFooter() {
  return `
  <div class="pg-footer">
    <div class="footer-rule"><div class="rule-thick"></div><div class="rule-thin"></div></div>
    <div class="footer-contact">
      <div class="footer-from">From the office of</div>
      <div class="footer-name">Ar. Fretz I. Suralta</div>
      <div class="footer-phone">+63 926 751 6692</div>
      <a href="mailto:info@fsarchitects.ph" class="footer-email">info@fsarchitects.ph</a>
    </div>
  </div>`;
}

function generateCustomContractHTML(contractorName: string, effectiveDate: string, body: string, logoData: string): string {
  const bodyHtml = body.split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, '<br />')}</p>`).join('\n');
  const css = sharedCss();
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><style>${css}</style></head>
<body>
<div class="page">
  ${pageHeader(logoData)}
  <div class="pg-body">
    ${bodyHtml}
    <div style="margin-top:28pt;">
      <div class="sig-row">
        <div>
          <div class="sig-space"></div>
          <p class="sig-label" style="margin-top:4pt;">Signature</p>
          <div class="sig-line" style="margin-top:18pt;"></div>
          <p class="sig-label"><strong>${contractorName}</strong> &nbsp;|&nbsp; Date</p>
        </div>
        <div>
          <div class="sig-space"></div>
          <p class="sig-label" style="margin-top:4pt;">Signature</p>
          <div class="sig-line" style="margin-top:18pt;"></div>
          <p class="sig-label"><strong>Fretz I. Suralta</strong>, Principal Architect &nbsp;|&nbsp; Date</p>
        </div>
      </div>
    </div>
  </div>
  ${pageFooter()}
</div>
</body></html>`;
}

function sharedCss() {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { background: #fff; font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #111; }
  .page { width: 210mm; height: 297mm; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .pg-header { padding: 10mm 20mm 0 20mm; flex-shrink: 0; }
  .logo { height: 40pt; width: auto; display: block; margin-bottom: 5pt; }
  .header-rule { display: flex; align-items: center; margin-top: 2pt; }
  .pg-body { flex: 1; padding: 10pt 20mm; overflow: hidden; }
  .pg-footer { padding: 0 20mm 8mm 20mm; flex-shrink: 0; }
  .footer-rule { display: flex; align-items: center; margin-bottom: 5pt; }
  .rule-thick { height: 2.5pt; width: 55pt; background: #111; flex-shrink: 0; }
  .rule-thin { flex: 1; height: 0.5pt; background: #333; }
  .footer-contact { text-align: right; font-size: 7.5pt; line-height: 1.6; }
  .footer-from { font-style: italic; color: #444; }
  .footer-name { font-weight: bold; font-size: 8.5pt; color: #111; }
  .footer-phone { color: #333; }
  .footer-email { color: #1a56db; text-decoration: none; display: block; }
  .title { text-align: center; font-weight: bold; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.4pt; margin-bottom: 11pt; }
  p { text-align: justify; margin-bottom: 8pt; font-size: 11pt; line-height: 1.5; }
  .and-sep { text-align: center; margin: 7pt 0; }
  .sh { font-weight: bold; font-size: 11pt; margin: 10pt 0 5pt 0; }
  .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20pt; margin-top: 14pt; }
  .sig-space { height: 38pt; border-bottom: 0.75pt solid #111; }
  .sig-line { border-top: 0.75pt solid #111; margin-bottom: 3pt; }
  .sig-label { font-size: 9pt; color: #333; }
  .sig-name { font-weight: bold; font-size: 10pt; margin-top: 4pt; }
  .sig-role { font-size: 9pt; color: #333; }
  .wit-block { margin-top: 16pt; }
  @page { size: A4 portrait; margin: 0; }
  @media print { html, body { width: 210mm; } .page { width: 210mm; height: 297mm; } }
`;
}

function generateContractHTML(fields: ContractFields, logoData: string): string {
  const { contractorName, employeeAddress, roleTitle, effectiveDate, endDate, monthlyRate, annualLeaveDays, sickLeaveDays } = fields;
  const fmt = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '___________';
  const ROLE = roleTitle.toUpperCase();
  const rate = Number(monthlyRate) || 0;
  const rateWords = numToWords(rate);
  const rateFormatted = rate.toLocaleString();
  const css = sharedCss();

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><style>${css}</style></head>
<body>

<!-- PAGE 1 -->
<div class="page">
  ${pageHeader(logoData)}
  <div class="pg-body">
    <div class="title">Memorandum of Agreement</div>

    <p>KNOW ALL MEN BY THESE PRESENTS:</p>

    <p>This Memorandum of Agreement ("Agreement") is made and executed in Cebu City, Philippines, by and between <strong>${contractorName}</strong>${employeeAddress.trim() ? `, a resident of ${employeeAddress.trim()},` : ','} hereinafter referred to as the "${ROLE}";</p>

    <p class="and-sep">and</p>

    <p><strong>FS Architects</strong>, a company duly organized and existing under the laws of the Philippines, with principal office address at Unit 2115 Meridian by Avenir, Golam Drive, Mabolo, Cebu City, represented herein by its Principal Architect, Arch. Fretz Suralta, hereinafter referred to as the "COMPANY."</p>

    <p><strong>WITNESSETH:</strong></p>

    <p><strong>WHEREAS</strong>, the ${ROLE} has applied voluntarily to the COMPANY or has been directly recruited by one of its representatives;</p>

    <p><strong>WHEREAS</strong>, the Principal Architect of the Company, Arch. Fretz Suralta, warrants that he has full authority to enter into this Agreement on behalf of the COMPANY;</p>

    <p><strong>NOW, THEREFORE</strong>, for and in consideration of the foregoing premises and the mutual covenants herein contained, the parties hereby agree as follows:</p>

    <div class="sh">I. DUTIES AND RESPONSIBILITIES</div>
    <p>The ${ROLE} shall perform duties as may be assigned by the COMPANY related to ${roleTitle.toLowerCase() || 'the assigned role'} and other related tasks.</p>

    <div class="sh">II. DURATION</div>
    <p>This Agreement shall be effective from ${fmt(effectiveDate)}, to ${fmt(endDate)}.</p>
    <p>The ${ROLE} shall undergo a performance assessment review every six (6) months, or as may be determined by the HR Department, for evaluation and performance discussions. This Agreement may be extended upon mutual agreement of both parties, subject to business needs and performance evaluation.</p>
  </div>
  ${pageFooter()}
</div>

<!-- PAGE 2 -->
<div class="page">
  ${pageHeader(logoData)}
  <div class="pg-body">
    <div class="sh">III. WORKING HOURS</div>
    <p>The ${roleTitle || 'employee'} shall render a flexible eight (8) hours per day, totaling at least forty (40) hours per week, Monday to Friday.</p>
    <p>Failure to report for work or arrival beyond 12:00 NN without prior notice and valid reason shall be considered absence.</p>
    <p>Overtime work shall require prior approval from the Principal Architect and shall be compensated per Company policy.</p>

    <div class="sh">IV. COMPENSATION</div>
    <p>The ${ROLE} shall receive a monthly compensation of ${rateWords} Pesos (Php ${rateFormatted}.00).</p>
    <p>This compensation shall be reviewed every three (3) months depending on performance and responsibilities, subject to Company policies.</p>
    <p>Salary shall be released twice a month, every 15th and 30th of the month.</p>

    <div class="sh">V. ANNUAL LEAVE</div>
    <p>The ${ROLE} shall be entitled to ${annualLeaveDays} (${numToWords(Number(annualLeaveDays))}) days of paid leave, in addition to regular rest days and applicable public holidays.</p>

    <div class="sh">VI. SICK LEAVE</div>
    <p>The ${ROLE} shall be entitled to ${sickLeaveDays} (${numToWords(Number(sickLeaveDays))}) days of sick leave per year, subject to approval by the CEO.</p>

    <div class="sh">VII. TERMINATION</div>
    <p>Either party may terminate this Agreement by providing a written notice at least one (1) month prior to the intended date of termination.</p>

    <div class="sh">VIII. INTELLECTUAL PROPERTY</div>
    <p>All intellectual property owned by either party prior to this Agreement shall remain the sole property of the respective owner.</p>
    <p>The ${ROLE} shall not use any confidential information or data belonging to the COMPANY to create intellectual property without prior written consent.</p>
  </div>
  ${pageFooter()}
</div>

<!-- PAGE 3 -->
<div class="page">
  ${pageHeader(logoData)}
  <div class="pg-body">
    <p>Any intellectual property created by the ${ROLE} within the scope of employment shall be the exclusive property of the COMPANY.</p>
    <p>Upon termination of employment, the ${ROLE} may use such work for portfolio and self-promotional purposes, provided no confidential information is disclosed.</p>
    <p>Any intellectual property created outside the scope of assigned duties and with separate compensation shall be governed by a separate written agreement.</p>
    <p>In cases of joint creation with company personnel, ownership shall be shared equally unless otherwise agreed in writing.</p>

    <div class="sh">IX. AMENDMENTS</div>
    <p>Any amendment or modification of this Agreement shall be valid only if made in writing and mutually agreed upon by both parties.</p>
    <p>This Agreement shall take effect upon signing by both parties and shall remain valid until its expiration, unless earlier terminated or extended in accordance with its terms.</p>

    <p style="margin-top:10pt;"><strong>IN WITNESS WHEREOF</strong>, the parties have hereunto affixed their signatures on the date and at the place first above written.</p>

    <!-- Employee signature -->
    <div style="margin-top:14pt;">
      <div style="height:36pt;"></div>
      <div style="width:100%;border-top:0.75pt solid #111;margin-bottom:4pt;"></div>
      <div class="sig-name">${contractorName.toUpperCase()}</div>
      <div class="sig-role">${roleTitle}</div>
      <div style="display:flex;align-items:flex-end;gap:6pt;margin-top:6pt;">
        <span class="sig-role">Date:</span>
        <div style="flex:1;border-bottom:0.75pt solid #555;"></div>
      </div>
    </div>

    <!-- Employer signature -->
    <div style="margin-top:16pt;">
      <div style="height:36pt;"></div>
      <div style="width:100%;border-top:0.75pt solid #111;margin-bottom:4pt;"></div>
      <div class="sig-name">AR. FRETZ I. SURALTA, UAP</div>
      <div class="sig-role">Principal Architect</div>
      <div class="sig-role">FS Architects</div>
      <div style="display:flex;align-items:flex-end;gap:6pt;margin-top:6pt;">
        <span class="sig-role">Date:</span>
        <div style="flex:1;border-bottom:0.75pt solid #555;"></div>
      </div>
    </div>

    <!-- Witness -->
    <div class="wit-block">
      <p style="margin-bottom:8pt;">Signed in the presence of:</p>
      <div style="width:100%;border-top:0.75pt solid #111;margin-bottom:4pt;"></div>
      <div class="sig-name">FRANCIS MARI O. YU</div>
      <div class="sig-role">HR Admin, FS Architects</div>
    </div>
  </div>
  ${pageFooter()}
</div>

</body>
</html>`;
}

export default function ContractGeneratorModal({ contractors, onClose, onDone }: Props) {
  const { hubUser } = useAuth();
  const [fields, setFields] = useState<ContractFields>({ ...BLANK });
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [previewHtml, setPreviewHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [contractMode, setContractMode] = useState<'template' | 'custom'>('template');
  const [customBody, setCustomBody] = useState('');

  const set = (key: keyof ContractFields, val: string) =>
    setFields(prev => ({ ...prev, [key]: val }));

  const handleContractorChange = (id: string) => {
    const c = contractors.find(x => x.id === id);
    set('contractorId', id);
    set('contractorName', c?.full_name ?? '');
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
    const logoDataUrl = await toDataUrl(`${window.location.origin}/images/fs-stacked-logo.png`);
    const html = contractMode === 'custom'
      ? generateCustomContractHTML(fields.contractorName, fields.effectiveDate, customBody, logoDataUrl)
      : generateContractHTML(fields, logoDataUrl);
    setPreviewHtml(html);
    setStep('preview');
  };

  const handleSave = async () => {
    if (!fields.contractorId) return;
    setSaving(true);

    const title = contractMode === 'custom'
      ? `Memorandum of Agreement – ${fields.contractorName}`
      : `Memorandum of Agreement – ${fields.contractorName}`;

    const { data: doc, error } = await supabase
      .from('hub_sign_documents')
      .insert({
        title,
        description: `Effective ${fields.effectiveDate ? new Date(fields.effectiveDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}`,
        file_url: '',
        file_name: '',
        content: previewHtml,
        is_generated: true,
        amendment_type: fields.amendmentType,
        rate_snapshot: fields.monthlyRate ? Number(fields.monthlyRate) : null,
        uploaded_by: hubUser!.id,
      })
      .select('id')
      .single();

    if (error || !doc) {
      setToast(`Failed to save: ${error?.message ?? 'unknown error'}`);
      setSaving(false);
      return;
    }

    await supabase.from('hub_sign_assignments').insert({
      document_id: doc.id,
      contractor_id: fields.contractorId,
    });

    printDoc(previewHtml);

    setSaving(false);
    onDone();
  };

  const openPreviewInTab = () => {
    const blob = new Blob([previewHtml], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';

  const canPreview = contractMode === 'custom'
    ? !!(fields.contractorId && customBody.trim() && fields.effectiveDate)
    : !!(fields.contractorId && fields.roleTitle.trim() && fields.monthlyRate && fields.effectiveDate);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      {toast && (
        <div className="fixed top-5 right-5 z-[60] bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">{toast}</div>
      )}
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            {step === 'preview' && (
              <button onClick={() => setStep('form')} className="text-gray-400 hover:text-gray-700 cursor-pointer">
                <i className="ri-arrow-left-line text-lg"></i>
              </button>
            )}
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {step === 'form' ? 'Generate MOA' : 'Preview MOA'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {step === 'form' ? 'Memorandum of Agreement — FS Architects format' : 'Print, have both parties sign physically'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {step === 'form' && (
          <div className="overflow-y-auto flex-1 p-5 space-y-4">

            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {(['template', 'custom'] as const).map(m => (
                <button key={m} type="button" onClick={() => setContractMode(m)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    contractMode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {m === 'template' ? 'MOA Template' : 'Write Custom'}
                </button>
              ))}
            </div>

            {/* Employee — both modes */}
            <div>
              <label className={lbl}>Employee *</label>
              <select value={fields.contractorId} onChange={e => handleContractorChange(e.target.value)}
                className={`${inp} bg-white cursor-pointer`}>
                <option value="">Select employee…</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>

            {contractMode === 'template' ? (
              <>
                {/* Address */}
                <div>
                  <label className={lbl}>Employee Address <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="text" value={fields.employeeAddress} onChange={e => set('employeeAddress', e.target.value)}
                    placeholder="e.g. Blk. 3 Albany St., Lamac, Consolacion, Cebu"
                    className={inp} />
                </div>

                {/* Role title */}
                <div>
                  <label className={lbl}>Role / Designation *</label>
                  <input type="text" value={fields.roleTitle} onChange={e => set('roleTitle', e.target.value)}
                    placeholder="e.g. Architectural Apprentice"
                    className={inp} />
                  <p className="text-xs text-gray-400 mt-1">Will appear in ALL CAPS throughout the document (e.g. ARCHITECTURAL APPRENTICE)</p>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Effective Date (Start) *</label>
                    <input type="date" value={fields.effectiveDate} onChange={e => set('effectiveDate', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>End Date *</label>
                    <input type="date" value={fields.endDate} onChange={e => set('endDate', e.target.value)} className={inp} />
                  </div>
                </div>

                {/* Compensation */}
                <div>
                  <label className={lbl}>Monthly Rate (₱) *</label>
                  <input type="number" value={fields.monthlyRate} onChange={e => set('monthlyRate', e.target.value)}
                    placeholder="e.g. 7000" className={inp} />
                  {fields.monthlyRate && Number(fields.monthlyRate) > 0 && (
                    <p className="text-xs text-[#1c2b3a] mt-1 font-medium">
                      → {numToWords(Number(fields.monthlyRate))} Pesos (Php {Number(fields.monthlyRate).toLocaleString()}.00)
                    </p>
                  )}
                </div>

                {/* Leave */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Annual Leave Days</label>
                    <input type="number" value={fields.annualLeaveDays} onChange={e => set('annualLeaveDays', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Sick Leave Days</label>
                    <input type="number" value={fields.sickLeaveDays} onChange={e => set('sickLeaveDays', e.target.value)} className={inp} />
                  </div>
                </div>

                {/* Contract type */}
                <div>
                  <label className={lbl}>Contract Type</label>
                  <select value={fields.amendmentType} onChange={e => set('amendmentType', e.target.value)}
                    className={`${inp} bg-white cursor-pointer`}>
                    <option value="initial">Initial Agreement</option>
                    <option value="renewal">Renewal</option>
                    <option value="rate_amendment">Rate Amendment</option>
                    <option value="other">Other Amendment</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className={lbl}>Effective Date *</label>
                  <input type="date" value={fields.effectiveDate} onChange={e => set('effectiveDate', e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Contract Body *</label>
                  <textarea value={customBody} onChange={e => setCustomBody(e.target.value)} rows={16}
                    placeholder={"Type or paste your contract here...\n\nSeparate paragraphs with a blank line.\n\nThe FS Architects header and signature block are added automatically."}
                    className={`${inp} font-mono resize-y`} />
                  <p className="text-xs text-gray-400 mt-1">Blank line = new paragraph. Header + signature block added automatically.</p>
                </div>
              </>
            )}

          </div>
        )}

        {step === 'preview' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 px-5 py-3 bg-amber-50 border-b border-amber-100 flex-shrink-0">
              <i className="ri-information-line text-amber-500"></i>
              <p className="text-xs text-amber-700">Print the document, have both parties sign physically, then mark "Ready for Pickup" in Documents.</p>
              <button onClick={openPreviewInTab} className="ml-auto text-xs text-[#1c2b3a] cursor-pointer whitespace-nowrap hover:underline flex-shrink-0">
                Open in new tab <i className="ri-external-link-line"></i>
              </button>
            </div>
            <iframe srcDoc={previewHtml} className="flex-1 w-full" title="Contract Preview" sandbox="allow-same-origin" />
          </div>
        )}

        <div className="p-5 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 cursor-pointer">
            Cancel
          </button>
          {step === 'form' ? (
            <button onClick={handlePreview} disabled={!canPreview}
              className="flex-1 bg-[#111827] text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 cursor-pointer disabled:opacity-40">
              Preview MOA →
            </button>
          ) : (
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-[#1c2b3a] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#0f1c28] cursor-pointer disabled:opacity-40">
              {saving ? 'Saving…' : 'Save & Download PDF'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
