import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { HubUser } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { FRANCIS_SIG, HUNA_LOGO } from './contractAssets';

interface Props {
  contractors: HubUser[];
  onClose: () => void;
  onDone: () => void;
}

const DEFAULT_TOOLS = ['Canva Pro', 'Adobe Photoshop (if required)'];

function generateCustomContractHTML(contractorName: string, effectiveDate: string, body: string, sigData: string, logoData: string): string {
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const bodyHtml = body
    .split(/\n\n+/)
    .map(para => `<p>${para.replace(/\n/g, '<br />')}</p>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #111; background: #fff; line-height: 1.6; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 18mm 20mm 20mm 20mm; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 4pt; }
  .logo-block img { height: 44pt; width: auto; display: block; }
  .logo-tagline { font-size: 8.5pt; color: #333; margin-top: 4pt; font-style: italic; }
  .header-contact { text-align: right; font-size: 8.5pt; color: #333; line-height: 1.7; }
  .header-rule { border: none; border-top: 2.5pt solid #D64F1E; margin: 6pt 0 14pt 0; width: 100%; }
  p { text-align: justify; margin-bottom: 7pt; font-size: 11pt; }
  .divider { border: none; border-top: 0.75pt solid #ccc; margin: 14pt 0; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20pt; margin-top: 28pt; }
  .sig-label { font-size: 9pt; color: #555; }
  @media print { body { background: #fff; } .page { margin: 0; padding: 15mm 18mm 18mm 18mm; } @page { size: A4; margin: 0; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo-block">
      <img src="${logoData}" alt="Huna Creatives" />
      <div class="logo-tagline">Let's bring your <em>hunahuna</em> to life.</div>
    </div>
    <div class="header-contact">
      (032) 505 6921 | +63 952 447 2602<br />
      contact@hunacreatives.com<br />
      Cebu, Philippines, 6004
    </div>
  </div>
  <hr class="header-rule" />

  ${bodyHtml}

  <hr class="divider" style="margin-top:28pt;" />
  <div class="sig-grid">
    <div>
      <p><strong>Huna Creatives</strong><br />("Client")</p>
      <div style="height:44pt;display:flex;align-items:flex-end;padding-bottom:0;margin-top:16pt;">
        <img src="${sigData}" style="height:70pt;width:auto;max-width:240pt;object-fit:contain;" />
      </div>
      <div style="border-top:1pt solid #111;margin-bottom:4pt;"></div>
      <p class="sig-label">Francis Fiel Roble &nbsp;|&nbsp; ${fmt(effectiveDate)}</p>
    </div>
    <div>
      <p><strong>${contractorName}</strong><br />("Contractor")</p>
      <div style="height:44pt;margin-top:16pt;border-bottom:1pt solid #111;"></div>
      <p class="sig-label" style="margin-top:4pt;">Signature</p>
      <div style="border-top:1pt solid #111;margin-top:20pt;margin-bottom:4pt;"></div>
      <p class="sig-label">${contractorName} &nbsp;|&nbsp; Date</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

function generateContractHTML(fields: ContractFields, sigData: string, logoData: string): string {
  const {
    contractorName, effectiveDate, role, primaryClient, responsibilities,
    additionalSupport, hoursPerDay, workDays, shiftTime, monthlyRate,
    hourlyRate, paymentType, paymentSchedule, tools, ptaDays, sickDays,
    hasCommission, commissionClient, commissionPercent, termDate,
  } = fields;

  const isHourly = paymentType === 'hourly';
  const isFlexible = paymentType === 'hourly' || paymentType === 'fixed_flexible';
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const rate = isHourly ? Number(hourlyRate).toLocaleString() : Number(monthlyRate).toLocaleString();
  const respItems = responsibilities.filter(r => r.trim()).map(r => `<li>${r}</li>`).join('\n');
  const addItems = additionalSupport.filter(r => r.trim()).map(r => `<li>${r}</li>`).join('\n');
  const toolItems = tools.filter(t => t.trim()).map(t => `<li>${t}</li>`).join('\n');

  const commissionSection = hasCommission ? `
  <hr class="divider" />
  <div class="section-title">10. Performance-Based Commission – ${commissionClient}</div>
  <p>10.1 In recognition of the Contractor's role with <strong>${commissionClient}</strong>, the Contractor shall be entitled to a <strong>${commissionPercent}% commission</strong> derived from <strong>performance-based commissions actually received by Huna Creatives</strong> under its agreement with ${commissionClient}.</p>
  <p>10.2 The commission shall be calculated <strong>solely on amounts received by Huna Creatives</strong>, and not on gross sales, gross revenue, or client-side net profit.</p>
  <p>10.3 The Contractor shall have <strong>no direct contractual relationship or claim</strong> against ${commissionClient}.</p>
  <p>10.4 Commission eligibility applies only while the Contractor is <strong>actively engaged</strong> with Huna Creatives and providing services related to ${commissionClient}.</p>
  <p>10.5 Commission payouts shall be settled on a <strong>monthly basis</strong>, aligned with Huna Creatives' receipt of commission payments.</p>
  <p>10.6 No commission shall be due on refunded, reversed, disputed, unpaid, or cancelled transactions, or after termination of this Agreement.</p>
  <p>10.7 This commission is a <strong>performance-based incentive</strong> and does not form part of the Contractor's guaranteed compensation.</p>` : '';

  const sectionNum = (n: number) => hasCommission ? n : n >= 11 ? n - 1 : n;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #111; background: #fff; line-height: 1.6; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 18mm 20mm 20mm 20mm; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 4pt; }
  .logo-block img { height: 44pt; width: auto; display: block; }
  .logo-tagline { font-size: 8.5pt; color: #333; margin-top: 4pt; font-style: italic; }
  .header-contact { text-align: right; font-size: 8.5pt; color: #333; line-height: 1.7; }
  .header-rule { border: none; border-top: 2.5pt solid #D64F1E; margin: 6pt 0 14pt 0; width: 100%; }
  .doc-title { font-size: 15pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 14pt; font-family: Arial, sans-serif; }
  p { text-align: justify; margin-bottom: 7pt; font-size: 11pt; }
  ul { margin: 4pt 0 8pt 24pt; }
  ul li { margin-bottom: 3pt; font-size: 11pt; }
  .section-title { font-size: 13pt; font-weight: bold; margin: 20pt 0 8pt 0; font-family: Arial, sans-serif; }
  .sub-title { font-size: 11pt; font-weight: bold; margin: 10pt 0 4pt 0; font-family: Arial, sans-serif; }
  .divider { border: none; border-top: 0.75pt solid #ccc; margin: 14pt 0; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20pt; margin-top: 14pt; }
  .sig-label { font-size: 9pt; color: #555; }
  @media print { body { background: #fff; } .page { margin: 0; padding: 15mm 18mm 18mm 18mm; } @page { size: A4; margin: 0; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo-block">
      <img src="${logoData}" alt="Huna Creatives" />
      <div class="logo-tagline">Let's bring your <em>hunahuna</em> to life.</div>
    </div>
    <div class="header-contact">
      (032) 505 6921 | +63 952 447 2602<br />
      contact@hunacreatives.com<br />
      Cebu, Philippines, 6004
    </div>
  </div>
  <hr class="header-rule" />

  <div class="doc-title">Independent Contractor Agreement</div>
  <p>This Independent Contractor Agreement ("Agreement") is made and entered into effective <strong>${fmt(effectiveDate)}</strong>, by and between:</p>
  <p><strong>Huna Creatives</strong>, represented by <strong>Francis Fiel Roble</strong> ("Client"),</p>
  <p>and <strong>${contractorName}</strong> ("Contractor").</p>
  <hr class="divider" />

  <div class="section-title">1. Scope of Work</div>
  <div class="sub-title">1.1 Primary Role</div>
  <p>The Contractor's <strong>primary role</strong> shall be to serve as <strong>${role}</strong> for <strong>${primaryClient}</strong>, a client of Huna Creatives. Responsibilities may include, but are not limited to:</p>
  <ul>${respItems}</ul>

  ${addItems ? `<div class="sub-title">1.2 Additional Client Support</div>
  <p>In addition to the primary role, the Contractor may also provide creative support services for <strong>Huna Creatives and its other clients</strong>, including but not limited to:</p>
  <ul>${addItems}</ul>` : ''}

  <div class="sub-title">${addItems ? '1.3' : '1.2'} General Duties</div>
  <p>The Contractor agrees to perform tasks reasonably related to the scope above, consistent with the Contractor's skills, as assigned by Huna Creatives.</p>

  <div class="sub-title">${addItems ? '1.4' : '1.3'} Coordination</div>
  <p>The Contractor shall coordinate directly with the Client or a designated supervisor regarding deliverables, priorities, and timelines.</p>
  <hr class="divider" />

  <div class="section-title">2. Work Schedule &amp; Availability</div>
  ${isFlexible ? `
  <p>2.1 The Contractor shall work on a <strong>flexible, as-needed basis</strong>, rendering services based on project requirements and mutual availability. There is no fixed minimum number of hours per day or days per week.</p>
  <p>2.2 The Contractor is expected to communicate availability in advance and remain responsive via Slack or email during agreed working windows.</p>
  <p>2.3 Specific project timelines, deadlines, and deliverable windows will be communicated by Huna Creatives as work arises.</p>
  ` : `
  <p>2.1 The Contractor shall be <strong>primarily available</strong> to render services for up to <strong>${hoursPerDay} hours per day</strong>, <strong>${workDays.length} days per week</strong> (${workDays.join(', ')}), based on agreed priorities and deliverables.</p>
  <p>2.2 Standard working hours shall follow the <strong>${shiftTime}</strong>, unless otherwise agreed in writing.</p>
  <p>2.3 The Contractor is expected to remain responsive and available during scheduled working hours.</p>
  `}
  <hr class="divider" />

  <div class="section-title">3. Compensation</div>
  ${isHourly ? `
  <div class="sub-title">3.1 Hourly Rate</div>
  <p>Effective <strong>${fmt(effectiveDate)}</strong>, the Contractor shall be compensated at a rate of <strong>₱${rate} PHP per hour</strong> for all approved hours rendered.</p>
  <div class="sub-title">3.2 Hour Logging</div>
  <p>The Contractor is responsible for accurately logging all hours worked through Huna Creatives' designated attendance system. Hours must be submitted and approved prior to payment processing.</p>
  <div class="sub-title">3.3 Payment Schedule</div>
  <p>Payments shall be made on a <strong>${paymentSchedule}</strong>, based on approved hours logged during the pay period.</p>
  <div class="sub-title">3.4 Adjustments</div>
  <p>Any changes to the hourly rate, scope of work, or engagement terms must be confirmed in writing by both parties.</p>
  ` : `
  <div class="sub-title">3.1 Monthly Service Fee</div>
  <p>Effective <strong>${fmt(effectiveDate)}</strong>, the Contractor shall receive a fixed <strong>monthly service fee of ₱${rate} PHP</strong>${paymentType === 'fixed_flexible' ? ', covering services rendered on a flexible, as-needed basis during the pay period.' : ', regardless of the number of working days in a given month.'}</p>
  <div class="sub-title">3.2 Payment Schedule</div>
  <p>Payments shall be made on a <strong>${paymentSchedule}</strong>.</p>
  ${paymentType === 'fixed_flexible' ? '' : `
  <div class="sub-title">3.3 Absences and Deductions</div>
  <p>In the event of approved absences or non-rendered workdays, a proportional deduction may be applied based on the following formula:</p>
  <p>₱${rate} ÷ Total Working Days in the Month = Daily Rate</p>
  `}
  <div class="sub-title">${paymentType === 'fixed_flexible' ? '3.3' : '3.4'} Adjustments</div>
  <p>Any changes to the service fee, workload, or scope of work must be confirmed in writing by both parties.</p>
  `}
  <hr class="divider" />

  <div class="section-title">4. Tools &amp; Resources</div>
  <p>Huna Creatives shall provide the Contractor with access to necessary tools and subscriptions required for work, which may include but are not limited to:</p>
  <ul>${toolItems}</ul>
  <p>All tools remain the property of Huna Creatives and are to be used solely for authorized work purposes.</p>
  <hr class="divider" />

  <div class="section-title">5. Discretionary Paid Time Away (PTA)</div>
  <p>5.1 As a <strong>courtesy benefit voluntarily extended by Huna Creatives</strong>, the Contractor may be granted up to <strong>${ptaDays} days of Paid Time Away (PTA) per calendar year</strong>, effective after <strong>six (6) months</strong> of continuous engagement.</p>
  <p>5.2 PTA is <strong>not an entitlement</strong>, does not form part of the Contractor's service fee, and is provided solely as a goodwill benefit at the discretion of Huna Creatives.</p>
  <p>5.3 PTA may be taken in increments, provided that <strong>no more than three (3) PTA days may be used within any rolling two-month period</strong>. PTA may not be taken consecutively beyond this limit unless expressly approved in writing.</p>
  <p>5.4 PTA requests must be submitted at least <strong>one (1) week in advance</strong>, except in cases of emergency or illness, and remain subject to approval based on operational needs.</p>
  <p>5.5 Unused PTA credits do not carry over and automatically expire at the end of each calendar year.</p>
  <p>5.6 Huna Creatives reserves the right to modify, suspend, or withdraw this discretionary benefit at any time.</p>
  <hr class="divider" />

  <div class="section-title">6. Sick Leave</div>
  <p>6.1 The Contractor is entitled to <strong>${sickDays} days of paid sick leave per calendar year</strong>, effective upon the start of engagement.</p>
  <p>6.2 Sick leave is intended for use when the Contractor is genuinely ill or unwell and unable to render services. It is <strong>not interchangeable with PTA</strong> or other leave types.</p>
  <p>6.3 The Contractor must notify the Client or designated supervisor <strong>as early as possible</strong> on the day of absence, or in advance when foreseeable.</p>
  <p>6.4 Huna Creatives may request reasonable documentation (e.g., a medical certificate) for sick leave absences exceeding two (2) consecutive days.</p>
  <p>6.5 Unused sick leave credits do not carry over and automatically expire at the end of each calendar year.</p>
  <p>6.6 Sick leave taken beyond the allotted days will be treated as unpaid leave or deducted proportionally from the Contractor's monthly service fee.</p>
  <hr class="divider" />

  <div class="section-title">7. Confidentiality</div>
  <p>The Contractor agrees to maintain strict confidentiality over all proprietary, sensitive, and client-related information obtained during the engagement. No materials, strategies, files, or information may be shared or reused without prior written consent from Huna Creatives.</p>
  <hr class="divider" />

  <div class="section-title">8. Non-Compete &amp; Conflict of Interest</div>
  <p>The Contractor agrees not to engage in work for <strong>direct competitors of Huna Creatives</strong> or participate in activities that create a conflict of interest during the term of this Agreement, without prior written approval.</p>
  <hr class="divider" />

  <div class="section-title">9. Ownership of Work</div>
  <p>9.1 All creative output, designs, content, and materials produced during this engagement shall be the <strong>exclusive property of Huna Creatives and/or its clients</strong>.</p>
  <p>9.2 The Contractor may not use, repurpose, or redistribute such materials without prior written consent from Huna Creatives.</p>
  <hr class="divider" />

  <div class="section-title">10. Communication &amp; Remote Work Expectations</div>
  <p>The Contractor shall remain active and responsive during scheduled working hours via Slack, email, or other designated platforms and must promptly notify the Client if unavailable.</p>

  ${commissionSection}

  <hr class="divider" />
  <div class="section-title">${sectionNum(11)}. Term &amp; Termination</div>
  <p>${sectionNum(11)}.1 This Agreement shall commence on <strong>${fmt(termDate || effectiveDate)}</strong>, and continue on a <strong>month-to-month basis</strong>.</p>
  <p>${sectionNum(11)}.2 Either party may terminate this Agreement with <strong>thirty (30) days' written notice</strong>.</p>
  <p>${sectionNum(11)}.3 Immediate termination may occur in cases of misconduct, breach of this Agreement, or failure to deliver agreed services.</p>
  <hr class="divider" />

  <div class="section-title">${sectionNum(12)}. Independent Contractor Status</div>
  <p>The Contractor is engaged as an independent contractor and not as an employee, agent, or partner of Huna Creatives. The Contractor is solely responsible for all applicable taxes, government contributions, and other obligations arising from this engagement. Nothing in this Agreement shall be construed to create an employer-employee relationship.</p>
  <hr class="divider" />

  <div class="section-title">${sectionNum(13)}. Governing Law</div>
  <p>This Agreement shall be governed by the laws of the Republic of the Philippines. Any disputes arising from this Agreement shall first be resolved through good-faith negotiation between the parties.</p>
  <hr class="divider" />

  <div class="section-title">Signatures</div>
  <p>By signing below, both parties acknowledge that they have read, understood, and agreed to the terms of this Agreement.</p>
  <div class="sig-grid">
    <div>
      <p><strong>Huna Creatives</strong><br />("Client")</p>
      <div style="height:44pt;display:flex;align-items:flex-end;padding-bottom:0;margin-top:16pt;">
        <img src="${sigData}" style="height:70pt;width:auto;max-width:240pt;object-fit:contain;" />
      </div>
      <div style="border-top:1pt solid #111;margin-bottom:4pt;"></div>
      <p class="sig-label">Francis Fiel Roble &nbsp;|&nbsp; ${fmt(effectiveDate)}</p>
    </div>
    <div>
      <p><strong>${contractorName}</strong><br />("Contractor")</p>
      <div style="height:44pt;margin-top:16pt;border-bottom:1pt solid #111;"></div>
      <p class="sig-label" style="margin-top:4pt;">Signature</p>
      <div style="border-top:1pt solid #111;margin-top:20pt;margin-bottom:4pt;"></div>
      <p class="sig-label">${contractorName} &nbsp;|&nbsp; Date</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

interface ContractFields {
  contractorId: string;
  contractorName: string;
  effectiveDate: string;
  role: string;
  primaryClient: string;
  responsibilities: string[];
  additionalSupport: string[];
  hoursPerDay: string;
  workDays: string[];
  shiftTime: string;
  monthlyRate: string;
  hourlyRate: string;
  paymentType: 'fixed' | 'hourly' | 'fixed_flexible';
  paymentSchedule: string;
  tools: string[];
  ptaDays: string;
  sickDays: string;
  hasCommission: boolean;
  commissionClient: string;
  commissionPercent: string;
  termDate: string;
  amendmentType: string;
}

const BLANK: ContractFields = {
  contractorId: '',
  contractorName: '',
  effectiveDate: new Date().toISOString().slice(0, 10),
  role: '',
  primaryClient: '',
  responsibilities: ['', '', ''],
  additionalSupport: [],
  hoursPerDay: '8',
  workDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  shiftTime: 'graveyard shift from 11:00 PM to 7:00 AM Philippine Time',
  monthlyRate: '',
  hourlyRate: '',
  paymentType: 'fixed',
  paymentSchedule: 'bi-monthly basis, on the 15th and the last working day of each month',
  tools: [...DEFAULT_TOOLS],
  ptaDays: '10',
  sickDays: '5',
  hasCommission: false,
  commissionClient: '',
  commissionPercent: '1',
  termDate: '',
  amendmentType: 'initial',
};

export default function ContractGeneratorModal({ contractors, onClose, onDone }: Props) {
  const { hubUser } = useAuth();
  const [fields, setFields] = useState<ContractFields>({ ...BLANK });
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [previewHtml, setPreviewHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [contractMode, setContractMode] = useState<'template' | 'custom'>('template');
  const [customBody, setCustomBody] = useState('');

  const set = (key: keyof ContractFields, val: any) =>
    setFields(prev => ({ ...prev, [key]: val }));

  const setListItem = (key: 'responsibilities' | 'additionalSupport' | 'tools', idx: number, val: string) =>
    setFields(prev => {
      const arr = [...(prev[key] as string[])];
      arr[idx] = val;
      return { ...prev, [key]: arr };
    });

  const addItem = (key: 'responsibilities' | 'additionalSupport' | 'tools') =>
    setFields(prev => ({ ...prev, [key]: [...(prev[key] as string[]), ''] }));

  const removeItem = (key: 'responsibilities' | 'additionalSupport' | 'tools', idx: number) =>
    setFields(prev => {
      const arr = (prev[key] as string[]).filter((_, i) => i !== idx);
      return { ...prev, [key]: arr };
    });

  const handleContractorChange = (id: string) => {
    const c = contractors.find(x => x.id === id);
    set('contractorId', id);
    set('contractorName', c?.full_name ?? '');
  };

  const handlePreview = () => {
    const html = contractMode === 'custom'
      ? generateCustomContractHTML(fields.contractorName, fields.effectiveDate, customBody, FRANCIS_SIG, HUNA_LOGO)
      : generateContractHTML(fields, FRANCIS_SIG, HUNA_LOGO);
    setPreviewHtml(html);
    setStep('preview');
  };

  const handleSendForSignature = async () => {
    if (!fields.contractorId) return;
    setSaving(true);

    const html = previewHtml;
    const title = contractMode === 'custom'
      ? `Custom Agreement – ${fields.contractorName}`
      : `Independent Contractor Agreement – ${fields.contractorName}`;

    const { data: doc, error } = await supabase
      .from('hub_sign_documents')
      .insert({
        title,
        description: `Effective ${new Date(fields.effectiveDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
        file_url: null,
        file_name: null,
        content: html,
        is_generated: true,
        amendment_type: fields.amendmentType,
        rate_snapshot: fields.paymentType === 'hourly'
          ? (fields.hourlyRate ? Number(fields.hourlyRate) : null)
          : (fields.monthlyRate ? Number(fields.monthlyRate) : null),

        uploaded_by: hubUser!.id,
      })
      .select('id')
      .single();

    if (error || !doc) {
      setToast('Failed to save contract.');
      setSaving(false);
      return;
    }

    const { data: assignment } = await supabase.from('hub_sign_assignments').insert({
      document_id: doc.id,
      contractor_id: fields.contractorId,
    }).select('id').single();

    if (assignment?.id) {
      await supabase.functions.invoke('notify-contract-assigned', { body: { assignment_id: assignment.id } });
    }

    setSaving(false);
    onDone();
  };

  const openPreviewInTab = () => {
    const blob = new Blob([previewHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      {toast && (
        <div className="fixed top-5 right-5 z-[60] bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">{toast}</div>
      )}
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            {step === 'preview' && (
              <button onClick={() => setStep('form')} className="text-gray-400 hover:text-gray-700 cursor-pointer">
                <i className="ri-arrow-left-line text-lg"></i>
              </button>
            )}
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {step === 'form' ? 'Generate Contract' : 'Preview Contract'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {step === 'form' ? 'Fill in the details — your signature is added automatically' : 'Review before sending'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {step === 'form' && (
          <div className="overflow-y-auto flex-1 p-5 space-y-5">

            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {(['template', 'custom'] as const).map(m => (
                <button key={m} type="button" onClick={() => setContractMode(m)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    contractMode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {m === 'template' ? 'Use Template' : 'Write Custom'}
                </button>
              ))}
            </div>

            {contractMode === 'custom' ? (
              <>
                {/* Contractor */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contractor *</label>
                  <select
                    value={fields.contractorId}
                    onChange={e => handleContractorChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] bg-white cursor-pointer"
                  >
                    <option value="">Select contractor…</option>
                    {contractors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </div>

                {/* Effective date + amendment type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Effective Date *</label>
                    <input type="date" value={fields.effectiveDate} onChange={e => set('effectiveDate', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contract Type</label>
                    <select value={fields.amendmentType} onChange={e => set('amendmentType', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] bg-white cursor-pointer">
                      <option value="initial">Initial Agreement</option>
                      <option value="rate_amendment">Rate Amendment</option>
                      <option value="scope_change">Scope Change</option>
                      <option value="renewal">Renewal</option>
                      <option value="other">Other Amendment</option>
                    </select>
                  </div>
                </div>

                {/* Custom body */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contract Body *</label>
                  <textarea
                    value={customBody}
                    onChange={e => setCustomBody(e.target.value)}
                    rows={18}
                    placeholder={"Type or paste your contract here...\n\nSeparate paragraphs with a blank line.\n\nThe Huna Creatives header and signature block are added automatically."}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] font-mono resize-y"
                  />
                  <p className="text-xs text-gray-400 mt-1">Blank line = new paragraph. Header + signature block added automatically.</p>
                </div>
              </>
            ) : (
              <>
            {/* Contractor */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contractor *</label>
              <select
                value={fields.contractorId}
                onChange={e => handleContractorChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] bg-white cursor-pointer"
              >
                <option value="">Select contractor…</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>

            {/* Payment type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Payment Structure *</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'fixed',          label: 'Fixed Monthly Rate',    icon: 'ri-calendar-line',  desc: 'Set monthly fee, fixed schedule' },
                  { key: 'fixed_flexible', label: 'Fixed + Flexible',      icon: 'ri-shield-line',    desc: 'Set monthly fee, flexible schedule' },
                  { key: 'hourly',         label: 'Hourly / Flexible',     icon: 'ri-time-line',      desc: 'Paid per approved hour logged' },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => set('paymentType', t.key)}
                    className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                      fields.paymentType === t.key
                        ? 'bg-[#FF6B35] border-[#FF6B35] text-white'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-medium"><i className={t.icon}></i>{t.label}</span>
                    <span className={`text-[10px] ${fields.paymentType === t.key ? 'text-white/70' : 'text-gray-400'}`}>{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Contract type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contract Type *</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { key: 'initial',        label: 'Initial Agreement', icon: 'ri-file-text-line' },
                  { key: 'rate_amendment', label: 'Rate Amendment',    icon: 'ri-money-dollar-circle-line' },
                  { key: 'scope_change',   label: 'Scope Change',      icon: 'ri-edit-box-line' },
                  { key: 'renewal',        label: 'Renewal',           icon: 'ri-refresh-line' },
                  { key: 'other',          label: 'Other Amendment',   icon: 'ri-file-edit-line' },
                ].map(t => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => set('amendmentType', t.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                      fields.amendmentType === t.key
                        ? 'bg-[#FF6B35] border-[#FF6B35] text-white'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <i className={t.icon}></i>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Effective Date *</label>
                <input type="date" value={fields.effectiveDate} onChange={e => set('effectiveDate', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Term Start Date</label>
                <input type="date" value={fields.termDate} onChange={e => set('termDate', e.target.value)}
                  placeholder="Same as effective date"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
              </div>
            </div>

            {/* Role & Client */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role / Title *</label>
                <input type="text" value={fields.role} onChange={e => set('role', e.target.value)}
                  placeholder="e.g. Graphic Designer and Admin Support"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Primary Client *</label>
                <input type="text" value={fields.primaryClient} onChange={e => set('primaryClient', e.target.value)}
                  placeholder="e.g. Kei Concepts"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
              </div>
            </div>

            {/* Responsibilities */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-600">Responsibilities *</label>
                <button onClick={() => addItem('responsibilities')} className="text-xs text-[#FF6B35] cursor-pointer hover:underline">+ Add</button>
              </div>
              <div className="space-y-2">
                {fields.responsibilities.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={r} onChange={e => setListItem('responsibilities', i, e.target.value)}
                      placeholder={`Responsibility ${i + 1}`}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                    {fields.responsibilities.length > 1 && (
                      <button onClick={() => removeItem('responsibilities', i)} className="text-gray-300 hover:text-red-400 cursor-pointer flex-shrink-0">
                        <i className="ri-close-line"></i>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Additional support */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-600">Additional Client Support <span className="text-gray-400 font-normal">(optional)</span></label>
                <button onClick={() => addItem('additionalSupport')} className="text-xs text-[#FF6B35] cursor-pointer hover:underline">+ Add</button>
              </div>
              {fields.additionalSupport.length === 0 ? (
                <p className="text-xs text-gray-400">None added.</p>
              ) : (
                <div className="space-y-2">
                  {fields.additionalSupport.map((r, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="text" value={r} onChange={e => setListItem('additionalSupport', i, e.target.value)}
                        placeholder={`Additional duty ${i + 1}`}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                      <button onClick={() => removeItem('additionalSupport', i)} className="text-gray-300 hover:text-red-400 cursor-pointer flex-shrink-0">
                        <i className="ri-close-line"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Schedule */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Work Schedule</p>
              {fields.paymentType === 'fixed' || fields.paymentType === 'fixed_flexible' ? (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Work Days</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => {
                        const active = fields.workDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => set('workDays', active ? fields.workDays.filter(d => d !== day) : [...fields.workDays, day])}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all border ${active ? 'bg-[#FF6B35] border-[#FF6B35] text-white' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                          >
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Hours/day</label>
                      <input type="number" value={fields.hoursPerDay} onChange={e => set('hoursPerDay', e.target.value)} min={1} max={24}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">PTA days/year</label>
                      <input type="number" value={fields.ptaDays} onChange={e => set('ptaDays', e.target.value)} min={0}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Sick days/year</label>
                      <input type="number" value={fields.sickDays} onChange={e => set('sickDays', e.target.value)} min={0}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                    </div>
                  </div>
                  {fields.paymentType === 'fixed' && (
                    <div className="mt-2">
                      <label className="block text-xs text-gray-500 mb-1">Shift / Working Hours</label>
                      <input type="text" value={fields.shiftTime} onChange={e => set('shiftTime', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                    </div>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">PTA days/year</label>
                    <input type="number" value={fields.ptaDays} onChange={e => set('ptaDays', e.target.value)} min={0}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Sick days/year</label>
                    <input type="number" value={fields.sickDays} onChange={e => set('sickDays', e.target.value)} min={0}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                  </div>
                </div>
              )}
            </div>

            {/* Compensation */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                {fields.paymentType !== 'hourly' ? (
                  <>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Rate (₱) *</label>
                    <input type="number" value={fields.monthlyRate} onChange={e => set('monthlyRate', e.target.value)}
                      placeholder="55000"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                  </>
                ) : (
                  <>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Hourly Rate (₱) *</label>
                    <input type="number" value={fields.hourlyRate} onChange={e => set('hourlyRate', e.target.value)}
                      placeholder="250"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                  </>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Schedule</label>
                <select value={fields.paymentSchedule} onChange={e => set('paymentSchedule', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] bg-white cursor-pointer">
                  <option value="bi-monthly basis, on the 15th and the last working day of each month">Bi-monthly (15th & last day)</option>
                  <option value="monthly basis, on the last working day of each month">Monthly (last day)</option>
                  <option value="weekly basis, every Friday">Weekly (every Friday)</option>
                </select>
              </div>
            </div>

            {/* Tools */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-600">Tools Provided</label>
                <button onClick={() => addItem('tools')} className="text-xs text-[#FF6B35] cursor-pointer hover:underline">+ Add</button>
              </div>
              <div className="space-y-2">
                {fields.tools.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={t} onChange={e => setListItem('tools', i, e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                    <button onClick={() => removeItem('tools', i)} className="text-gray-300 hover:text-red-400 cursor-pointer flex-shrink-0">
                      <i className="ri-close-line"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Commission toggle */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={fields.hasCommission} onChange={e => set('hasCommission', e.target.checked)} className="accent-[#FF6B35]" />
                <span className="text-sm font-medium text-gray-700">Include performance-based commission clause</span>
              </label>
              {fields.hasCommission && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Client name</label>
                    <input type="text" value={fields.commissionClient} onChange={e => set('commissionClient', e.target.value)}
                      placeholder="e.g. The Second Haus"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Commission %</label>
                    <input type="number" value={fields.commissionPercent} onChange={e => set('commissionPercent', e.target.value)}
                      min={0} max={100} step={0.5}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                  </div>
                </div>
              )}
            </div>
              </>
            )}

          </div>
        )}

        {step === 'preview' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 px-5 py-3 bg-amber-50 border-b border-amber-100 flex-shrink-0">
              <i className="ri-information-line text-amber-500"></i>
              <p className="text-xs text-amber-700">Review the contract below. Your signature is already on it. Once sent, the contractor will be notified to sign.</p>
              <button onClick={openPreviewInTab} className="ml-auto text-xs text-[#FF6B35] cursor-pointer whitespace-nowrap hover:underline flex-shrink-0">
                Open in new tab <i className="ri-external-link-line"></i>
              </button>
            </div>
            <iframe
              srcDoc={previewHtml}
              className="flex-1 w-full"
              title="Contract Preview"
              sandbox="allow-same-origin"
            />
          </div>
        )}

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 cursor-pointer">
            Cancel
          </button>
          {step === 'form' ? (
            <button
              onClick={handlePreview}
              disabled={contractMode === 'custom'
                ? !fields.contractorId || !customBody.trim() || !fields.effectiveDate
                : !fields.contractorId || !fields.role || !fields.primaryClient || !(fields.paymentType === 'hourly' ? fields.hourlyRate : fields.monthlyRate) || !fields.effectiveDate}
              className="flex-1 bg-[#111827] text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 cursor-pointer disabled:opacity-40"
            >
              Preview Contract →
            </button>
          ) : (
            <button
              onClick={handleSendForSignature}
              disabled={saving}
              className="flex-1 bg-[#FF6B35] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#e55a24] cursor-pointer disabled:opacity-40"
            >
              {saving ? 'Sending…' : 'Send for Signature'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
