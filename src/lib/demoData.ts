import { HubUser, HubAnnouncement, HubRequest, HubTimeOff, HubSop, HubClient } from './types';

// The demo admin user (owner role)
export const DEMO_HUB_USER: HubUser = {
  id: 'demo-owner-001',
  full_name: 'Alex Rivera',
  email: 'demo@sentro.app',
  role: 'owner',
  status: 'active',
  department: 'Management',
  avatar_url: undefined,
};

// 8 contractors
export const DEMO_CONTRACTORS: HubUser[] = [
  { id: 'demo-c-001', full_name: 'Maria Santos', email: 'maria@demo.com', role: 'contractor', status: 'active', department: 'Design', payment_type: 'hourly', hourly_rate: 320, currency: 'PHP', shift_start: '09:00', shift_end: '18:00', work_days: ['Mon','Tue','Wed','Thu','Fri'], start_date: '2024-03-01', birthday: '1995-06-15', onboarding_completed: true },
  { id: 'demo-c-002', full_name: 'Juan dela Cruz', email: 'juan@demo.com', role: 'contractor', status: 'active', department: 'Development', payment_type: 'hourly', hourly_rate: 480, currency: 'PHP', shift_start: '08:00', shift_end: '17:00', work_days: ['Mon','Tue','Wed','Thu','Fri'], start_date: '2023-11-15', birthday: '1991-09-22', onboarding_completed: true },
  { id: 'demo-c-003', full_name: 'Ana Reyes', email: 'ana@demo.com', role: 'contractor', status: 'active', department: 'Marketing', payment_type: 'fixed', monthly_rate: 28000, currency: 'PHP', shift_start: '09:00', shift_end: '18:00', work_days: ['Mon','Tue','Wed','Thu','Fri'], start_date: '2024-01-08', birthday: '1993-12-03', onboarding_completed: true },
  { id: 'demo-c-004', full_name: 'Carlo Mendoza', email: 'carlo@demo.com', role: 'contractor', status: 'active', department: 'Development', payment_type: 'hourly', hourly_rate: 420, currency: 'PHP', shift_start: '09:00', shift_end: '18:00', work_days: ['Mon','Tue','Wed','Thu','Fri'], start_date: '2024-05-01', birthday: '1997-03-18', onboarding_completed: true },
  { id: 'demo-c-005', full_name: 'Sophia Lim', email: 'sophia@demo.com', role: 'contractor', status: 'active', department: 'Content', payment_type: 'fixed', monthly_rate: 22000, currency: 'PHP', shift_start: '10:00', shift_end: '19:00', work_days: ['Mon','Tue','Wed','Thu','Fri'], start_date: '2024-02-12', birthday: '1999-07-29', onboarding_completed: true },
  { id: 'demo-c-006', full_name: 'Miguel Torres', email: 'miguel@demo.com', role: 'contractor', status: 'active', department: 'Design', payment_type: 'hourly', hourly_rate: 300, currency: 'PHP', shift_start: '09:00', shift_end: '18:00', work_days: ['Mon','Tue','Wed','Thu','Fri'], start_date: '2024-07-01', birthday: '1996-11-11', onboarding_completed: true },
  { id: 'demo-c-007', full_name: 'Isabella Garcia', email: 'isabella@demo.com', role: 'contractor', status: 'active', department: 'Project Management', payment_type: 'fixed', monthly_rate: 35000, currency: 'PHP', shift_start: '08:00', shift_end: '17:00', work_days: ['Mon','Tue','Wed','Thu','Fri'], start_date: '2023-09-01', birthday: '1990-04-05', onboarding_completed: true },
  { id: 'demo-c-008', full_name: 'Rafael Santos', email: 'rafael@demo.com', role: 'contractor', status: 'inactive', department: 'Video Production', payment_type: 'project_based', currency: 'PHP', start_date: '2024-08-15', birthday: '1994-01-20', onboarding_completed: false },
];

// Payroll / payouts for May 16-31 period
export const DEMO_PAYOUTS = [
  { id: 1, contractor_id: 'demo-c-001', cutoff_start: '2026-05-16', cutoff_end: '2026-05-31', approved_hours: 80, hourly_rate: 320, base_pay: 25600, bonus: 0, incentives: 500, reimbursements: 0, deductions: 0, advances: 0, penalties: 0, overtime_pay: 0, final_payout: 26100, status: 'hr_approved', locked: true, hub_users: DEMO_CONTRACTORS[0] },
  { id: 2, contractor_id: 'demo-c-002', cutoff_start: '2026-05-16', cutoff_end: '2026-05-31', approved_hours: 76, hourly_rate: 480, base_pay: 36480, bonus: 2000, incentives: 0, reimbursements: 500, deductions: 0, advances: 0, penalties: 0, overtime_pay: 1920, final_payout: 40900, status: 'submitted', locked: true, hub_users: DEMO_CONTRACTORS[1] },
  { id: 3, contractor_id: 'demo-c-003', cutoff_start: '2026-05-16', cutoff_end: '2026-05-31', approved_hours: 80, hourly_rate: 0, base_pay: 14000, bonus: 0, incentives: 0, reimbursements: 0, deductions: 0, advances: 0, penalties: 0, overtime_pay: 0, final_payout: 14000, status: 'submitted', locked: true, hub_users: DEMO_CONTRACTORS[2] },
  { id: 4, contractor_id: 'demo-c-004', cutoff_start: '2026-05-16', cutoff_end: '2026-05-31', approved_hours: 72, hourly_rate: 420, base_pay: 30240, bonus: 0, incentives: 0, reimbursements: 0, deductions: 500, advances: 0, penalties: 0, overtime_pay: 0, final_payout: 29740, status: 'pending', locked: false, hub_users: DEMO_CONTRACTORS[3] },
  { id: 5, contractor_id: 'demo-c-005', cutoff_start: '2026-05-16', cutoff_end: '2026-05-31', approved_hours: 80, hourly_rate: 0, base_pay: 11000, bonus: 0, incentives: 0, reimbursements: 0, deductions: 0, advances: 0, penalties: 0, overtime_pay: 0, final_payout: 11000, status: 'pending', locked: false, hub_users: DEMO_CONTRACTORS[4] },
  { id: 6, contractor_id: 'demo-c-006', cutoff_start: '2026-05-16', cutoff_end: '2026-05-31', approved_hours: 68, hourly_rate: 300, base_pay: 20400, bonus: 0, incentives: 0, reimbursements: 0, deductions: 0, advances: 3000, penalties: 0, overtime_pay: 0, final_payout: 17400, status: 'pending', locked: false, hub_users: DEMO_CONTRACTORS[5] },
  { id: 7, contractor_id: 'demo-c-007', cutoff_start: '2026-05-16', cutoff_end: '2026-05-31', approved_hours: 80, hourly_rate: 0, base_pay: 17500, bonus: 1000, incentives: 0, reimbursements: 0, deductions: 0, advances: 0, penalties: 0, overtime_pay: 0, final_payout: 18500, status: 'hr_approved', locked: true, hub_users: DEMO_CONTRACTORS[6] },
];

// Demo attendance (today's team status)
export const DEMO_ATTENDANCE = [
  { hub_user_id: 'demo-c-001', full_name: 'Maria Santos', avatar_url: null, department: 'Design', status: 'on' as const, last_punch: new Date(Date.now() - 2*3600000).toISOString(), hours_today: 5.5, overtime_today: 0 },
  { hub_user_id: 'demo-c-002', full_name: 'Juan dela Cruz', avatar_url: null, department: 'Development', status: 'on' as const, last_punch: new Date(Date.now() - 3600000).toISOString(), hours_today: 6.2, overtime_today: 0.2 },
  { hub_user_id: 'demo-c-003', full_name: 'Ana Reyes', avatar_url: null, department: 'Marketing', status: 'on' as const, last_punch: new Date(Date.now() - 1800000).toISOString(), hours_today: 4.8, overtime_today: 0 },
  { hub_user_id: 'demo-c-004', full_name: 'Carlo Mendoza', avatar_url: null, department: 'Development', status: 'off' as const, last_punch: new Date(Date.now() - 7200000).toISOString(), hours_today: 8.0, overtime_today: 0 },
  { hub_user_id: 'demo-c-005', full_name: 'Sophia Lim', avatar_url: null, department: 'Content', status: 'on' as const, last_punch: new Date(Date.now() - 900000).toISOString(), hours_today: 3.5, overtime_today: 0 },
  { hub_user_id: 'demo-c-006', full_name: 'Miguel Torres', avatar_url: null, department: 'Design', status: 'absent' as const, last_punch: null, hours_today: 0, overtime_today: 0 },
  { hub_user_id: 'demo-c-007', full_name: 'Isabella Garcia', avatar_url: null, department: 'Project Management', status: 'on' as const, last_punch: new Date(Date.now() - 600000).toISOString(), hours_today: 7.1, overtime_today: 0 },
];

// Announcements
export const DEMO_ANNOUNCEMENTS: HubAnnouncement[] = [
  { id: 1, title: 'May Payroll Schedule Update', body: 'Payroll for the May 16–31 period will be processed on May 30. Please submit your payslips by EOD May 28.', priority: 'important', category: 'payroll', published: true, created_at: '2026-05-25T08:00:00Z' },
  { id: 2, title: 'June Holiday: Independence Day', body: 'A reminder that June 12 is a national holiday. Please plan your deliverables accordingly.', priority: 'normal', category: 'holiday', published: true, created_at: '2026-05-20T09:00:00Z' },
  { id: 3, title: 'New Project Kickoff — Pacific Wellness', body: 'We are starting the Pacific Wellness App UI project next week. Isabella will be the PM. Please check your assignments.', priority: 'normal', category: 'general', published: true, created_at: '2026-05-15T10:00:00Z' },
];

// Requests
export const DEMO_REQUESTS: HubRequest[] = [
  { id: 1, contractor_id: 'demo-c-006', type: 'equipment', title: 'Request for External Monitor', description: 'Need a second monitor for dual-screen design work.', status: 'open', created_at: '2026-05-27T14:00:00Z', hub_users: DEMO_CONTRACTORS[5] },
  { id: 2, contractor_id: 'demo-c-004', type: 'access', title: 'Access to Figma Pro Account', description: 'Current free plan limits collaboration on active projects.', status: 'in_review', created_at: '2026-05-24T11:00:00Z', hub_users: DEMO_CONTRACTORS[3] },
  { id: 3, contractor_id: 'demo-c-001', type: 'other', title: 'Certificate of Employment', description: 'Needed for bank loan application.', status: 'open', created_at: '2026-05-22T09:00:00Z', hub_users: DEMO_CONTRACTORS[0] },
];

// Time-off
export const DEMO_TIME_OFF: HubTimeOff[] = [
  { id: 1, contractor_id: 'demo-c-005', type: 'sick', start_date: '2026-06-02', end_date: '2026-06-02', reason: 'Medical check-up', status: 'pending', created_at: '2026-05-28T08:00:00Z', hub_users: DEMO_CONTRACTORS[4] },
  { id: 2, contractor_id: 'demo-c-002', type: 'vacation', start_date: '2026-06-10', end_date: '2026-06-12', reason: 'Family trip', status: 'pending', created_at: '2026-05-26T10:00:00Z', hub_users: DEMO_CONTRACTORS[1] },
];

// Overtime requests
export const DEMO_OVERTIME = [
  { id: 1, contractor_id: 'demo-c-002', date: '2026-05-27', hours: 2, reason: 'Feature deployment deadline', status: 'approved', admin_notes: '', created_at: '2026-05-27T18:00:00Z', hub_users: DEMO_CONTRACTORS[1] },
  { id: 2, contractor_id: 'demo-c-007', date: '2026-05-26', hours: 1.5, reason: 'Client call ran over schedule', status: 'pending', admin_notes: '', created_at: '2026-05-26T17:30:00Z', hub_users: DEMO_CONTRACTORS[6] },
  { id: 3, contractor_id: 'demo-c-001', date: '2026-05-25', hours: 3, reason: 'Urgent design revisions for Pacific Wellness', status: 'approved', admin_notes: 'Approved — client deadline', created_at: '2026-05-25T20:00:00Z', hub_users: DEMO_CONTRACTORS[0] },
];

// Clients
export const DEMO_CLIENTS: HubClient[] = [
  { id: 1, client_name: 'Verde Tech Solutions', platform: 'Website / App', status: 'active', contract_value: 2500, contract_currency: 'USD', notes: 'Long-term retainer client', hub_client_assignments: [{ id: 1, client_id: 1, contractor_id: 'demo-c-007', role: 'Project Manager', hub_users: { id: 'demo-c-007', full_name: 'Isabella Garcia', avatar_url: undefined, department: 'Project Management' } }] },
  { id: 2, client_name: 'Sunrise Capital Group', platform: 'Branding', status: 'active', contract_value: 1800, contract_currency: 'USD', notes: '', hub_client_assignments: [{ id: 2, client_id: 2, contractor_id: 'demo-c-001', role: 'Lead Designer', hub_users: { id: 'demo-c-001', full_name: 'Maria Santos', avatar_url: undefined, department: 'Design' } }] },
  { id: 3, client_name: 'Pacific Wellness Inc.', platform: 'Mobile App UI', status: 'active', contract_value: 3200, contract_currency: 'USD', notes: 'New client, started May 2026', hub_client_assignments: [{ id: 3, client_id: 3, contractor_id: 'demo-c-002', role: 'Lead Developer', hub_users: { id: 'demo-c-002', full_name: 'Juan dela Cruz', avatar_url: undefined, department: 'Development' } }] },
  { id: 4, client_name: 'Northern Star Media', platform: 'Social Media & Content', status: 'active', contract_value: 85000, contract_currency: 'PHP', notes: 'Quarterly renewal', hub_client_assignments: [{ id: 4, client_id: 4, contractor_id: 'demo-c-003', role: 'Marketing Lead', hub_users: { id: 'demo-c-003', full_name: 'Ana Reyes', avatar_url: undefined, department: 'Marketing' } }] },
];

// Projects
export const DEMO_PROJECTS = [
  { id: 1, project_type: 'client', client_name: 'Verde Tech Solutions', project_name: 'Website Redesign', service: 'Website Design', contract_price: 180000, status: 'ongoing', start_date: '2026-03-01', deadline: '2026-07-31', notes: 'Full redesign with CMS integration', contact_email: 'contact@verde.tech', hub_project_payments: [{ id: 1, amount: 90000, paid_at: '2026-03-15', notes: 'Initial 50%', receipt_url: null }], hub_project_costs: [{ id: 1, label: 'Stock assets', amount: 8500, date: '2026-03-10' }], hub_payment_reminders: [], hub_project_contractors: [] },
  { id: 2, project_type: 'client', client_name: 'Sunrise Capital Group', project_name: 'Brand Identity Package', service: 'Branding & Identity', contract_price: 95000, status: 'ongoing', start_date: '2026-04-15', deadline: '2026-06-30', notes: 'Logo, brand guide, collateral', contact_email: 'hello@sunrise.com', hub_project_payments: [{ id: 2, amount: 47500, paid_at: '2026-04-20', notes: 'Down payment', receipt_url: null }], hub_project_costs: [{ id: 2, label: 'Printing samples', amount: 3200, date: '2026-05-05' }], hub_payment_reminders: [], hub_project_contractors: [] },
  { id: 3, project_type: 'client', client_name: 'Pacific Wellness Inc.', project_name: 'App UI/UX Design', service: 'Website Design', contract_price: 240000, status: 'ongoing', start_date: '2026-05-20', deadline: '2026-09-30', notes: 'iOS & Android screens, design system', contact_email: 'ops@pacificwellness.ph', hub_project_payments: [{ id: 3, amount: 80000, paid_at: '2026-05-22', notes: 'Kickoff payment', receipt_url: null }], hub_project_costs: [], hub_payment_reminders: [], hub_project_contractors: [] },
  { id: 4, project_type: 'client', client_name: 'Northern Star Media', project_name: 'Q2 Social Campaign', service: 'Social Media Management', contract_price: 75000, status: 'completed', start_date: '2026-04-01', deadline: '2026-05-31', notes: 'April–May social campaign', contact_email: 'team@northernstar.media', hub_project_payments: [{ id: 4, amount: 75000, paid_at: '2026-05-28', notes: 'Full payment', receipt_url: null }], hub_project_costs: [{ id: 3, label: 'Ad spend', amount: 15000, date: '2026-04-10' }], hub_payment_reminders: [], hub_project_contractors: [] },
];

// SOPs
export const DEMO_SOPS: HubSop[] = [
  { id: 1, title: 'Daily Time-In / Time-Out Process', category: 'Attendance', content: 'All team members must clock in and out using the Sentro Hub. Clock-in by 9:15 AM. If you forget, log a manual entry with your reason.', published: true, created_at: '2026-01-10T00:00:00Z' },
  { id: 2, title: 'How to Submit a Payslip', category: 'Payroll', content: 'At the end of each cutoff period, submit your payslip through the Payouts section. Review your hours and adjustments before submitting.', published: true, created_at: '2026-01-15T00:00:00Z' },
  { id: 3, title: 'Requesting Time Off', category: 'HR', content: 'Submit time-off requests at least 3 days in advance for planned leaves. Sick leaves may be submitted on the day with a medical certificate if required.', published: true, created_at: '2026-01-20T00:00:00Z' },
  { id: 4, title: 'Client Communication Standards', category: 'Operations', content: 'All client-facing communication must be professional and timely. Response time SLA is 4 hours during business hours. CC your PM on all client emails.', published: true, created_at: '2026-02-01T00:00:00Z' },
  { id: 5, title: 'File Naming Conventions', category: 'Operations', content: 'Use the format: [ProjectCode]_[Deliverable]_[Version]_[Date]. Example: VT001_Homepage_v2_20260415. Store all files in the designated Google Drive folder.', published: true, created_at: '2026-02-10T00:00:00Z' },
];

// Invoices
export const DEMO_INVOICES = [
  { id: 1, invoice_number: 'INV-2026-018', client_name: 'Pacific Wellness Inc.', project_name: 'App UI/UX Design', balance: 160000, sent_at: '2026-05-22T10:00:00Z', due_date: '2026-06-22', settled: false },
  { id: 2, invoice_number: 'INV-2026-015', client_name: 'Sunrise Capital Group', project_name: 'Brand Identity Package', balance: 47500, sent_at: '2026-05-01T09:00:00Z', due_date: '2026-05-31', settled: false },
  { id: 3, invoice_number: 'INV-2026-012', client_name: 'Verde Tech Solutions', project_name: 'Website Redesign', balance: 90000, sent_at: '2026-04-01T08:00:00Z', due_date: '2026-06-01', settled: false },
];

// Attendance history records
export const DEMO_ATTENDANCE_HISTORY = DEMO_CONTRACTORS.filter(c => c.status === 'active').slice(0, 7).map(c => ({
  user_id: c.id,
  full_name: c.full_name,
  avatar_url: null as string | null,
  department: c.department,
  shift_start: c.shift_start,
  shift_end: c.shift_end,
  hours_raw: 8.0,
  hours_capped: 8.0,
  overtime_hours: 0,
  first_on: new Date(Date.now() - 8*3600000).toISOString(),
  last_off: new Date().toISOString(),
  work_days: c.work_days,
  payment_type: c.payment_type,
  start_date: c.start_date,
}));

// Pre-computed dashboard totals
export const DEMO_DASHBOARD = {
  totalPayroll: 157640,
  totalHours: 484,
  totalNetProfit: 272300,
  totalContractValue: 590000,
  totalCollected: 292500,
  activeProjectCount: 3,
  monthlyRetainerTotal: 420000,
};

// ── Contractor demo data ────────────────────────────────────────────────────

export const DEMO_CONTRACTOR_PROJECTS = [
  {
    id: 101, percentage: 20, payout_type: 'percentage', fixed_amount: null,
    payout_status: 'pending', paid_at: null,
    hub_project_contractor_payouts: [],
    hub_projects: {
      id: 1, client_name: 'Verde Tech Solutions', project_name: 'Website Redesign',
      service: 'Website Design', contract_price: 180000, status: 'ongoing',
      start_date: '2026-03-01', deadline: '2026-07-31',
      notes: 'Full redesign with CMS integration. Mobile-first approach.',
      drive_url: null, project_type: 'client',
      hub_project_payments: [{ amount: 90000 }],
      hub_project_costs: [{ amount: 8500 }],
    },
  },
  {
    id: 102, percentage: 0, payout_type: 'fixed', fixed_amount: 15000,
    payout_status: 'paid', paid_at: '2026-05-28',
    hub_project_contractor_payouts: [{ id: 1, amount: 15000, paid_at: '2026-05-28', notes: 'Milestone 1', receipt_url: null }],
    hub_projects: {
      id: 2, client_name: 'Sunrise Capital Group', project_name: 'Brand Identity Package',
      service: 'Branding & Identity', contract_price: 95000, status: 'ongoing',
      start_date: '2026-04-15', deadline: '2026-06-30',
      notes: 'Logo, brand guide, collateral. Two revision rounds included.',
      drive_url: null, project_type: 'client',
      hub_project_payments: [{ amount: 47500 }],
      hub_project_costs: [{ amount: 3200 }],
    },
  },
];

export const DEMO_CONTRACTOR_TASKS = [
  // Website Redesign tasks
  { id: 201, project_id: 1, title: 'Homepage wireframes', description: 'Desktop + mobile layouts', status: 'done' as const, priority: 'high' as const, due_date: '2026-05-20', start_date: '2026-05-10', assigned_to: 'demo-c-001' },
  { id: 202, project_id: 1, title: 'Design system & components', description: 'Color tokens, typography, button states', status: 'in_progress' as const, priority: 'high' as const, due_date: '2026-06-10', start_date: '2026-05-25', assigned_to: 'demo-c-001' },
  { id: 203, project_id: 1, title: 'Inner page templates', description: 'About, Services, Contact pages', status: 'todo' as const, priority: 'medium' as const, due_date: '2026-06-25', start_date: '2026-06-15', assigned_to: null },
  { id: 204, project_id: 1, title: 'Client review & revisions', description: 'Incorporate feedback from round 1', status: 'todo' as const, priority: 'medium' as const, due_date: '2026-07-10', start_date: '2026-07-01', assigned_to: 'demo-c-001' },
  { id: 205, project_id: 1, title: 'Export & handoff to dev', description: 'Figma export + component specs', status: 'todo' as const, priority: 'low' as const, due_date: '2026-07-25', start_date: '2026-07-18', assigned_to: null },
  // Brand Identity tasks
  { id: 206, project_id: 2, title: 'Brand discovery workshop', description: 'Mood boards + competitor analysis', status: 'done' as const, priority: 'high' as const, due_date: '2026-05-05', start_date: '2026-04-28', assigned_to: 'demo-c-001' },
  { id: 207, project_id: 2, title: 'Logo concepts (3 directions)', description: 'Present initial directions to client', status: 'done' as const, priority: 'high' as const, due_date: '2026-05-20', start_date: '2026-05-08', assigned_to: 'demo-c-001' },
  { id: 208, project_id: 2, title: 'Refine chosen direction', description: 'Colour variations, dark/light versions', status: 'in_progress' as const, priority: 'high' as const, due_date: '2026-06-05', start_date: '2026-05-26', assigned_to: 'demo-c-001' },
  { id: 209, project_id: 2, title: 'Brand guide document', description: 'Typography, colour palette, usage rules', status: 'todo' as const, priority: 'medium' as const, due_date: '2026-06-20', start_date: '2026-06-10', assigned_to: null },
];

export const DEMO_CONTRACTOR_TEAM: Record<number, { id: string; full_name: string; avatar_url: string | null }[]> = {
  1: [
    { id: 'demo-c-001', full_name: 'Maria Santos', avatar_url: null },
    { id: 'demo-c-007', full_name: 'Isabella Garcia', avatar_url: null },
  ],
  2: [
    { id: 'demo-c-001', full_name: 'Maria Santos', avatar_url: null },
    { id: 'demo-c-003', full_name: 'Ana Reyes', avatar_url: null },
  ],
};
