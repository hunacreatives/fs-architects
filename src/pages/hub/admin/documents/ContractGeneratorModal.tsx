import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { HubUser } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  contractors: HubUser[];
  onClose: () => void;
  onDone: () => void;
}

const DEFAULT_TOOLS = ['AutoCAD', 'Revit / SketchUp (if applicable)', 'Adobe Acrobat'];

function generateCustomContractHTML(contractorName: string, effectiveDate: string, body: string, logoData: string): string {
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
  .header-contact { text-align: right; font-size: 8.5pt; color: #333; line-height: 1.7; }
  .header-rule { border: none; border-top: 2.5pt solid #334049; margin: 6pt 0 14pt 0; width: 100%; }
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
      <img src="${logoData}" alt="FS Architects" />
    </div>
    <div class="header-contact">
      info@fsarchitects.ph<br />
      Cebu City, Philippines
    </div>
  </div>
  <hr class="header-rule" />

  ${bodyHtml}

  <hr class="divider" style="margin-top:28pt;" />
  <div class="sig-grid">
    <div>
      <p><strong>FS Architects</strong><br />("Employer")</p>
      <div style="height:44pt;margin-top:16pt;border-bottom:1pt solid #111;"></div>
      <p class="sig-label" style="margin-top:4pt;">Signature</p>
      <div style="border-top:1pt solid #111;margin-top:20pt;margin-bottom:4pt;"></div>
      <p class="sig-label">Fretz I. Suralta, Owner/Principal Architect &nbsp;|&nbsp; Date</p>
    </div>
    <div>
      <p><strong>${contractorName}</strong><br />("Employee")</p>
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

function generateContractHTML(fields: ContractFields, logoData: string): string {
  const {
    contractorName, effectiveDate, role, department, responsibilities,
    hoursPerDay, workDays, shiftTime, monthlyRate,
    paymentSchedule, tools, ptaDays, sickDays, termDate,
  } = fields;

  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const rate = Number(monthlyRate).toLocaleString();
  const respItems = responsibilities.filter(r => r.trim()).map(r => `<li>${r}</li>`).join('\n');
  const toolItems = tools.filter(t => t.trim()).map(t => `<li>${t}</li>`).join('\n');
  const deptDisplay = department.trim() || 'to be assigned';

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
  .header-contact { text-align: right; font-size: 8.5pt; color: #333; line-height: 1.7; }
  .header-rule { border: none; border-top: 2.5pt solid #334049; margin: 6pt 0 14pt 0; width: 100%; }
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
      <img src="${logoData}" alt="FS Architects" />
    </div>
    <div class="header-contact">
      info@fsarchitects.ph<br />
      Cebu City, Philippines
    </div>
  </div>
  <hr class="header-rule" />

  <div class="doc-title">Employment Agreement</div>
  <p>This Employment Agreement ("Agreement") is entered into effective <strong>${fmt(effectiveDate)}</strong>, by and between:</p>
  <p><strong>FS Architects</strong>, a sole proprietorship/partnership duly registered under Philippine law, represented by <strong>Fretz I. Suralta</strong>, Owner/Principal Architect ("Employer"), with principal office at Cebu City, Philippines;</p>
  <p>and <strong>${contractorName}</strong> ("Employee").</p>
  <hr class="divider" />

  <div class="section-title">1. Nature of Employment &amp; Probationary Period</div>
  <p>1.1 The Employee is engaged on a <strong>probationary basis</strong> for an initial period of <strong>six (6) months</strong> commencing on <strong>${fmt(termDate || effectiveDate)}</strong>, in accordance with Article 296 of the Labor Code of the Philippines.</p>
  <p>1.2 During the probationary period, the Employee shall be evaluated against the following standards for regularization: (a) consistent attendance and punctuality; (b) quality and accuracy of work output; (c) professional conduct and teamwork; (d) adherence to FS Architects' policies and procedures; and (e) satisfactory performance of assigned responsibilities.</p>
  <p>1.3 Upon successful completion of the probationary period and satisfactory performance of the above standards, the Employee shall acquire <strong>regular employment status</strong>.</p>
  <p>1.4 FS Architects reserves the right to terminate the probationary employment prior to the six-month period if the Employee fails to meet the standards for regularization, subject to due process.</p>
  <hr class="divider" />

  <div class="section-title">2. Position &amp; Department</div>
  <p>2.1 The Employee is engaged in the role of <strong>${role}</strong>, assigned to the <strong>${deptDisplay}</strong> department.</p>
  <p>2.2 The Employee shall report directly to management or a designated supervisor, as determined by FS Architects.</p>
  <hr class="divider" />

  <div class="section-title">3. Scope of Work</div>
  <p>3.1 The Employee's responsibilities shall include, but are not limited to:</p>
  <ul>${respItems}</ul>
  <p>3.2 The Employee may be assigned additional duties reasonably related to the above scope, consistent with the Employee's role and qualifications, as directed by FS Architects.</p>
  <hr class="divider" />

  <div class="section-title">4. Working Hours</div>
  <p>4.1 In accordance with <strong>Article 83 of the Labor Code</strong>, the normal working hours shall not exceed <strong>${hoursPerDay} hours per day</strong>, <strong>${workDays.length} days per week</strong> (${workDays.join(', ')}).</p>
  <p>4.2 Standard hours shall follow <strong>${shiftTime}</strong>, unless otherwise agreed in writing.</p>
  <p>4.3 A one (1) hour unpaid meal break shall be observed daily, not counted as working time per Article 85 of the Labor Code.</p>
  <p>4.4 <strong>Overtime work</strong> shall be compensated at the Employee's regular hourly rate plus an additional <strong>twenty-five percent (25%)</strong> thereof, in accordance with Article 87 of the Labor Code. Work performed on a scheduled rest day or regular holiday shall be compensated at an additional <strong>thirty percent (30%)</strong> of the regular rate.</p>
  <p>4.5 Work performed between <strong>10:00 PM and 6:00 AM</strong> shall be entitled to a <strong>night differential</strong> of at least ten percent (10%) of the Employee's regular wage, per Article 86 of the Labor Code.</p>
  <hr class="divider" />

  <div class="section-title">5. Compensation &amp; Mandatory Benefits</div>
  <div class="sub-title">5.1 Monthly Salary</div>
  <p>Effective <strong>${fmt(effectiveDate)}</strong>, the Employee shall receive a monthly salary of <strong>₱${rate} PHP</strong>, paid on a <strong>${paymentSchedule}</strong>. The agreed salary meets or exceeds the applicable minimum wage prescribed by the Regional Tripartite Wages and Productivity Board for Region VII.</p>
  <div class="sub-title">5.2 Salary Deductions</div>
  <p>In the event of approved absences or non-rendered workdays, a proportional deduction shall be applied based on the following formula: ₱${rate} ÷ Total Working Days in the Month = Daily Rate. Mandatory government deductions (SSS, PhilHealth, Pag-IBIG) shall also be applied as prescribed by law.</p>
  <div class="sub-title">5.3 13th Month Pay</div>
  <p>The Employee shall be entitled to <strong>13th Month Pay</strong> as mandated under <strong>Presidential Decree No. 851</strong>, computed as one-twelfth (1/12) of the Employee's total basic salary earned within a calendar year. Payment shall be made on or before <strong>December 24</strong> of each year.</p>
  <div class="sub-title">5.4 Government-Mandated Contributions</div>
  <p>FS Architects shall enroll the Employee in and remit the employer's share of contributions to the following mandatory programs:</p>
  <ul>
    <li><strong>Social Security System (SSS)</strong> — per Republic Act No. 11199</li>
    <li><strong>Philippine Health Insurance Corporation (PhilHealth)</strong> — per Republic Act No. 11223</li>
    <li><strong>Home Development Mutual Fund / Pag-IBIG</strong> — per Republic Act No. 9679</li>
  </ul>
  <p>The Employee's share of contributions shall be deducted from the monthly salary as prescribed by the respective government agencies.</p>
  <div class="sub-title">5.5 Holiday Pay</div>
  <p>The Employee shall be entitled to holiday pay in accordance with <strong>Article 94 of the Labor Code</strong> and applicable Presidential Proclamations. Employees not required to work on a regular holiday shall receive their regular daily wage. Employees required to work on a regular holiday shall receive double (200%) their regular daily wage for the first eight hours.</p>
  <div class="sub-title">5.6 Salary Adjustments</div>
  <p>Any changes to the salary, scope of work, or terms of employment must be confirmed in a written amendment signed by both parties.</p>
  <hr class="divider" />

  <div class="section-title">6. Tools &amp; Resources</div>
  <p>FS Architects shall provide the Employee with access to necessary tools and resources required for work, which may include but are not limited to:</p>
  <ul>${toolItems}</ul>
  <p>All tools and resources remain the property of FS Architects and are to be used solely for authorized work purposes. The Employee shall return all company property upon separation.</p>
  <hr class="divider" />

  <div class="section-title">7. Leave Benefits</div>
  <div class="sub-title">7.1 Service Incentive Leave (SIL)</div>
  <p>In accordance with <strong>Article 95 of the Labor Code</strong>, the Employee shall be entitled to a minimum of five (5) days of paid Service Incentive Leave per year after one (1) year of service. FS Architects grants <strong>${ptaDays} days of paid leave per calendar year</strong>, effective after six (6) months of continuous employment, which exceeds the statutory minimum. SIL requests must be submitted in advance and are subject to approval based on operational requirements. Unused SIL shall not be carried over beyond the calendar year unless otherwise agreed in writing.</p>
  <div class="sub-title">7.2 Sick Leave</div>
  <p>The Employee is entitled to <strong>${sickDays} days of paid sick leave per calendar year</strong>, effective upon the start of employment. The Employee must notify the designated supervisor as early as possible on the day of absence. FS Architects may require a medical certificate for absences exceeding two (2) consecutive days. Sick leave taken beyond the allotted days shall be treated as unpaid leave.</p>
  <div class="sub-title">7.3 Maternity &amp; Paternity Leave</div>
  <p>Female employees shall be entitled to <strong>105 days of paid maternity leave</strong> (extendable by 30 days unpaid) per <strong>Republic Act No. 11210</strong>. Male employees whose spouse gives birth shall be entitled to <strong>seven (7) days of paid paternity leave</strong> per <strong>Republic Act No. 8187</strong>, applicable to the first four deliveries.</p>
  <div class="sub-title">7.4 Other Statutory Leaves</div>
  <p>The Employee shall be entitled to all other leaves mandated by applicable Philippine laws, including but not limited to Solo Parent Leave (RA 8972) and leave for victims of violence against women and children (RA 9262), subject to eligibility requirements and proper documentation.</p>
  <hr class="divider" />

  <div class="section-title">8. Confidentiality</div>
  <p>The Employee agrees to maintain strict confidentiality over all proprietary, client, and project information obtained during employment. No materials, designs, plans, drawings, strategies, files, or client information may be shared, reproduced, or disclosed without prior written consent from FS Architects. This obligation survives termination of employment.</p>
  <hr class="divider" />

  <div class="section-title">9. Non-Compete &amp; Conflict of Interest</div>
  <p>During the term of employment, the Employee shall not engage in work for direct competitors of FS Architects or participate in activities that create a conflict of interest, without prior written approval. The Employee shall promptly disclose to management any potential conflict of interest that may arise.</p>
  <hr class="divider" />

  <div class="section-title">10. Intellectual Property</div>
  <p>10.1 All work product, designs, drawings, plans, specifications, and documents produced by the Employee in the course of employment shall be the <strong>exclusive property of FS Architects</strong>, consistent with Article 172 and related provisions of the Intellectual Property Code of the Philippines (RA 8293).</p>
  <p>10.2 The Employee may not use, repurpose, publish, or redistribute such materials without prior written consent from FS Architects.</p>
  <hr class="divider" />

  <div class="section-title">11. Professional Standards</div>
  <p>11.1 The Employee agrees to maintain the professional and ethical standards expected in the architecture industry and to uphold the reputation of FS Architects in all client and project interactions.</p>
  <p>11.2 If the Employee holds a professional license issued by the <strong>Professional Regulation Commission (PRC)</strong> under the Board of Architecture (RA 9266), the Employee agrees to keep the license current, comply with all applicable PRC regulations, and fulfill Continuing Professional Development (CPD) requirements.</p>
  <hr class="divider" />

  <div class="section-title">12. Discipline &amp; Termination</div>
  <div class="sub-title">12.1 Just Causes</div>
  <p>The Employer may terminate employment for just causes as enumerated under <strong>Article 297 of the Labor Code</strong> (e.g., serious misconduct, willful disobedience, gross neglect of duty, fraud, or commission of a crime). Termination for just cause shall follow the <strong>twin-notice rule</strong>: (a) a written Notice to Explain stating the grounds for termination, with at least five (5) calendar days to respond; and (b) a written Notice of Decision after evaluation of the Employee's explanation.</p>
  <div class="sub-title">12.2 Authorized Causes</div>
  <p>Termination for authorized causes under <strong>Article 298 of the Labor Code</strong> (e.g., installation of labor-saving devices, redundancy, retrenchment, or closure) shall require a written notice served to both the Employee and the <strong>Department of Labor and Employment (DOLE)</strong> at least <strong>thirty (30) days</strong> prior to the intended termination date. Applicable separation pay shall be provided in accordance with law.</p>
  <div class="sub-title">12.3 Resignation</div>
  <p>The Employee may resign by serving a written notice to the Employer at least <strong>thirty (30) days</strong> in advance, in accordance with Article 300 of the Labor Code. The Employer may waive the notice period at its discretion.</p>
  <div class="sub-title">12.4 Clearance &amp; Final Pay</div>
  <p>Upon separation, the Employee shall undergo standard clearance procedures. Final pay, including any unpaid wages, pro-rated 13th month pay, and cash conversion of unused leave credits (if applicable), shall be released within <strong>thirty (30) days</strong> from the date of separation, per DOLE Labor Advisory No. 06, Series of 2020.</p>
  <hr class="divider" />

  <div class="section-title">13. Governing Law</div>
  <p>This Agreement shall be governed by the <strong>Labor Code of the Philippines</strong> and all applicable labor laws, rules, and regulations. Any disputes arising from this Agreement shall first be resolved through good-faith negotiation between the parties. If unresolved, either party may bring the matter before the <strong>National Labor Relations Commission (NLRC)</strong> or other competent authority.</p>
  <hr class="divider" />

  <p style="font-size:9pt;color:#555;font-style:italic;">Note: This Agreement is intended to comply with applicable Philippine labor laws as of its effective date. FS Architects reserves the right to update company policies in conformity with any future changes in law, and the Employee shall be notified of any such changes.</p>
  <hr class="divider" />

  <div class="section-title">Signatures</div>
  <p>By signing below, both parties acknowledge that they have read, understood, and agreed to the terms of this Agreement.</p>
  <div class="sig-grid">
    <div>
      <p><strong>FS Architects</strong><br />("Employer")</p>
      <div style="height:44pt;margin-top:16pt;border-bottom:1pt solid #111;"></div>
      <p class="sig-label" style="margin-top:4pt;">Signature</p>
      <div style="border-top:1pt solid #111;margin-top:20pt;margin-bottom:4pt;"></div>
      <p class="sig-label">Fretz I. Suralta, Owner/Principal Architect &nbsp;|&nbsp; Date</p>
    </div>
    <div>
      <p><strong>${contractorName}</strong><br />("Employee")</p>
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
  department: string;
  responsibilities: string[];
  hoursPerDay: string;
  workDays: string[];
  shiftTime: string;
  monthlyRate: string;
  paymentType: 'fixed';
  paymentSchedule: string;
  tools: string[];
  ptaDays: string;
  sickDays: string;
  termDate: string;
  amendmentType: string;
}

const BLANK: ContractFields = {
  contractorId: '',
  contractorName: '',
  effectiveDate: new Date().toISOString().slice(0, 10),
  role: '',
  department: '',
  responsibilities: ['', '', ''],
  hoursPerDay: '8',
  workDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  shiftTime: '8:00 AM to 5:00 PM Philippine Time',
  monthlyRate: '',
  paymentType: 'fixed',
  paymentSchedule: 'bi-monthly basis, on the 15th and the last working day of each month',
  tools: [...DEFAULT_TOOLS],
  ptaDays: '10',
  sickDays: '5',
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

  const setListItem = (key: 'responsibilities' | 'tools', idx: number, val: string) =>
    setFields(prev => {
      const arr = [...(prev[key] as string[])];
      arr[idx] = val;
      return { ...prev, [key]: arr };
    });

  const addItem = (key: 'responsibilities' | 'tools') =>
    setFields(prev => ({ ...prev, [key]: [...(prev[key] as string[]), ''] }));

  const removeItem = (key: 'responsibilities' | 'tools', idx: number) =>
    setFields(prev => {
      const arr = (prev[key] as string[]).filter((_, i) => i !== idx);
      return { ...prev, [key]: arr };
    });

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
    const logoDataUrl = await toDataUrl(`${window.location.origin}/images/fs-architects-logo-horizontal.png`);
    const html = contractMode === 'custom'
      ? generateCustomContractHTML(fields.contractorName, fields.effectiveDate, customBody, logoDataUrl)
      : generateContractHTML(fields, logoDataUrl);
    setPreviewHtml(html);
    setStep('preview');
  };

  const handleSendForSignature = async () => {
    if (!fields.contractorId) return;
    setSaving(true);

    const html = previewHtml;
    const title = contractMode === 'custom'
      ? `Custom Agreement – ${fields.contractorName}`
      : `Employment Agreement – ${fields.contractorName}`;

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
        rate_snapshot: fields.monthlyRate ? Number(fields.monthlyRate) : null,
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Employee *</label>
                  <select
                    value={fields.contractorId}
                    onChange={e => handleContractorChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white cursor-pointer"
                  >
                    <option value="">Select employee…</option>
                    {contractors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </div>

                {/* Effective date + amendment type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Effective Date *</label>
                    <input type="date" value={fields.effectiveDate} onChange={e => set('effectiveDate', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contract Type</label>
                    <select value={fields.amendmentType} onChange={e => set('amendmentType', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white cursor-pointer">
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
                    placeholder={"Type or paste your contract here...\n\nSeparate paragraphs with a blank line.\n\nThe FS Architects header and signature block are added automatically."}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] font-mono resize-y"
                  />
                  <p className="text-xs text-gray-400 mt-1">Blank line = new paragraph. Header + signature block added automatically.</p>
                </div>
              </>
            ) : (
              <>
            {/* Contractor */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Employee *</label>
              <select
                value={fields.contractorId}
                onChange={e => handleContractorChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white cursor-pointer"
              >
                <option value="">Select employee…</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
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
                        ? 'bg-[#1c2b3a] border-[#1c2b3a] text-white'
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Term Start Date</label>
                <input type="date" value={fields.termDate} onChange={e => set('termDate', e.target.value)}
                  placeholder="Same as effective date"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
            </div>

            {/* Role & Department */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role / Title *</label>
                <input type="text" value={fields.role} onChange={e => set('role', e.target.value)}
                  placeholder="e.g. Architectural Draftsman"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Department <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={fields.department} onChange={e => set('department', e.target.value)}
                  placeholder="e.g. Architecture, Design, Admin"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
            </div>

            {/* Responsibilities */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-600">Responsibilities *</label>
                <button onClick={() => addItem('responsibilities')} className="text-xs text-[#1c2b3a] cursor-pointer hover:underline">+ Add</button>
              </div>
              <div className="space-y-2">
                {fields.responsibilities.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={r} onChange={e => setListItem('responsibilities', i, e.target.value)}
                      placeholder={`Responsibility ${i + 1}`}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                    {fields.responsibilities.length > 1 && (
                      <button onClick={() => removeItem('responsibilities', i)} className="text-gray-300 hover:text-red-400 cursor-pointer flex-shrink-0">
                        <i className="ri-close-line"></i>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Schedule */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Work Schedule</p>
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
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all border ${active ? 'bg-[#1c2b3a] border-[#1c2b3a] text-white' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
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
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">SIL days/year</label>
                    <input type="number" value={fields.ptaDays} onChange={e => set('ptaDays', e.target.value)} min={0}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Sick days/year</label>
                    <input type="number" value={fields.sickDays} onChange={e => set('sickDays', e.target.value)} min={0}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">Shift / Working Hours</label>
                  <input type="text" value={fields.shiftTime} onChange={e => set('shiftTime', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              </>
            </div>

            {/* Compensation */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Rate (₱) *</label>
                <input type="number" value={fields.monthlyRate} onChange={e => set('monthlyRate', e.target.value)}
                  placeholder="55000"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Schedule</label>
                <select value={fields.paymentSchedule} onChange={e => set('paymentSchedule', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white cursor-pointer">
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
                <button onClick={() => addItem('tools')} className="text-xs text-[#1c2b3a] cursor-pointer hover:underline">+ Add</button>
              </div>
              <div className="space-y-2">
                {fields.tools.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={t} onChange={e => setListItem('tools', i, e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                    <button onClick={() => removeItem('tools', i)} className="text-gray-300 hover:text-red-400 cursor-pointer flex-shrink-0">
                      <i className="ri-close-line"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
              </>
            )}

          </div>
        )}

        {step === 'preview' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 px-5 py-3 bg-amber-50 border-b border-amber-100 flex-shrink-0">
              <i className="ri-information-line text-amber-500"></i>
              <p className="text-xs text-amber-700">Review the contract below. Your signature is already on it. Once sent, the employee will be notified to sign.</p>
              <button onClick={openPreviewInTab} className="ml-auto text-xs text-[#1c2b3a] cursor-pointer whitespace-nowrap hover:underline flex-shrink-0">
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
                : !fields.contractorId || !fields.role || !fields.monthlyRate || !fields.effectiveDate}
              className="flex-1 bg-[#111827] text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 cursor-pointer disabled:opacity-40"
            >
              Preview Contract →
            </button>
          ) : (
            <button
              onClick={handleSendForSignature}
              disabled={saving}
              className="flex-1 bg-[#1c2b3a] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#e55a24] cursor-pointer disabled:opacity-40"
            >
              {saving ? 'Sending…' : 'Send for Signature'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
