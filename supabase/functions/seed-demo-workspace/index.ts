import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-seed-secret',
  'Content-Type': 'application/json',
};

// Demo password is read from the environment; never hardcoded or returned in responses.
const DEMO_PASSWORD = Deno.env.get('DEMO_SEED_PASSWORD') ?? '';

type DemoUserConfig = {
  email: string;
  full_name: string;
  role: 'owner' | 'admin' | 'contractor';
  department: string;
  start_date: string;
  payment_type: 'hourly' | 'fixed' | 'project_based';
  hourly_rate?: number;
  monthly_rate?: number;
  project_percentage?: number;
  annual_pto_days?: number;
  annual_sick_days?: number;
  contract_expiry_date?: string;
};

const DEMO_USERS: DemoUserConfig[] = [
  {
    email: 'demo-owner@sentrohub.local',
    full_name: 'Frances Valdez',
    role: 'owner',
    department: 'Leadership',
    start_date: '2025-01-06',
    payment_type: 'fixed',
    monthly_rate: 120000,
    annual_pto_days: 15,
    annual_sick_days: 10,
    contract_expiry_date: '2026-12-31',
  },
  {
    email: 'demo-admin@sentrohub.local',
    full_name: 'Mika Ramos',
    role: 'admin',
    department: 'Operations',
    start_date: '2025-02-10',
    payment_type: 'fixed',
    monthly_rate: 60000,
    annual_pto_days: 15,
    annual_sick_days: 10,
    contract_expiry_date: '2026-11-30',
  },
  {
    email: 'demo-ava@sentrohub.local',
    full_name: 'Ava Santos',
    role: 'contractor',
    department: 'Creative',
    start_date: '2025-04-15',
    payment_type: 'hourly',
    hourly_rate: 350,
    annual_pto_days: 15,
    annual_sick_days: 10,
    contract_expiry_date: '2026-08-15',
  },
  {
    email: 'demo-liam@sentrohub.local',
    full_name: 'Liam Cruz',
    role: 'contractor',
    department: 'Media Buying',
    start_date: '2025-07-01',
    payment_type: 'project_based',
    project_percentage: 18,
    annual_pto_days: 15,
    annual_sick_days: 10,
    contract_expiry_date: '2026-07-01',
  },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // This function creates real auth users — gate it behind a server-only shared
  // secret. It is disabled unless SEED_SECRET (and a demo password) are configured.
  const seedSecret = Deno.env.get('SEED_SECRET') ?? '';
  if (!seedSecret || !DEMO_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Demo seeding is disabled.' }), { status: 403, headers: CORS });
  }
  if (req.headers.get('x-seed-secret') !== seedSecret) {
    return new Response(JSON.stringify({ error: 'Forbidden.' }), { status: 403, headers: CORS });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const users = await Promise.all(DEMO_USERS.map((config) => ensureDemoUser(supabase, config)));

    const owner = users.find((user) => user.role === 'owner')!;
    const admin = users.find((user) => user.role === 'admin')!;
    const ava = users.find((user) => user.email === 'demo-ava@sentrohub.local')!;
    const liam = users.find((user) => user.email === 'demo-liam@sentrohub.local')!;

    await seedAnnouncements(supabase, owner.id);
    await seedSops(supabase, admin.id);
    await seedBlackouts(supabase, admin.id);
    await seedAttendance(supabase, ava.id);
    await seedTimeOff(supabase, ava.id);
    await seedRequests(supabase, ava.id);
    await seedPayouts(supabase, ava.id, admin.id);
    await seedClientsAndProjects(supabase, ava.id, liam.id);
    await seedDocuments(supabase, admin.id, ava.id);
    await seedPerformanceReview(supabase, admin.id, ava.id);

    return new Response(JSON.stringify({
      ok: true,
      message: 'Demo workspace seeded successfully.',
      // Credentials are intentionally not returned. The demo password is the
      // configured DEMO_SEED_PASSWORD secret, known only to operators.
      accounts: DEMO_USERS.map((user) => ({ role: user.role, email: user.email })),
    }, null, 2), {
      headers: CORS,
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: String(error),
    }, null, 2), {
      status: 500,
      headers: CORS,
    });
  }
});

async function ensureDemoUser(supabase: ReturnType<typeof createClient>, config: DemoUserConfig) {
  const existingAuthUser = await findAuthUserByEmail(supabase, config.email);
  const authUser = existingAuthUser ?? await createAuthUser(supabase, config);

  const hubPayload = {
    id: authUser.id,
    email: config.email,
    full_name: config.full_name,
    role: config.role,
    department: config.department,
    start_date: config.start_date,
    status: 'active',
    payment_type: config.payment_type,
    hourly_rate: config.hourly_rate ?? null,
    monthly_rate: config.monthly_rate ?? null,
    project_percentage: config.project_percentage ?? null,
    annual_pto_days: config.annual_pto_days ?? 15,
    annual_sick_days: config.annual_sick_days ?? 10,
    contract_expiry_date: config.contract_expiry_date ?? null,
    currency: 'PHP',
    onboarding_completed: true,
    work_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    shift_start: '09:00:00',
    shift_end: '18:00:00',
    is_developer: config.role === 'owner',
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('hub_users').upsert(hubPayload);
  if (error) throw error;

  return { id: authUser.id, role: config.role, email: config.email };
}

async function findAuthUserByEmail(supabase: ReturnType<typeof createClient>, email: string) {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function createAuthUser(supabase: ReturnType<typeof createClient>, config: DemoUserConfig) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: config.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: config.full_name },
  });
  if (error || !data.user) throw error ?? new Error(`Failed to create auth user for ${config.email}`);
  return data.user;
}

async function seedAnnouncements(supabase: ReturnType<typeof createClient>, ownerId: string) {
  const rows = [
    {
      title: 'Monday Operations Sync',
      body: 'This week we are prioritizing campaign QA, payroll finalization, and client handoff prep.',
      priority: 'important',
      category: 'meeting',
      published: true,
      posted_by: ownerId,
    },
    {
      title: 'June Payroll Timeline',
      body: 'Contractors should submit any disputes within 24 hours after their payslip is marked ready.',
      priority: 'normal',
      category: 'payroll',
      published: true,
      posted_by: ownerId,
    },
  ];

  for (const row of rows) {
    const { data: existing } = await supabase.from('hub_announcements').select('id').eq('title', row.title).maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from('hub_announcements').insert(row);
    if (error) throw error;
  }
}

async function seedSops(supabase: ReturnType<typeof createClient>, adminId: string) {
  const rows = [
    {
      title: 'Client Handoff Checklist',
      category: 'Operations',
      content: 'Before a handoff, confirm access, update notes, archive deliverables, and post the status summary in Slack.',
      published: true,
      created_by: adminId,
    },
    {
      title: 'Attendance Correction Policy',
      category: 'HR',
      content: 'Attendance edits should include a reason, a dated correction request, and the original time window.',
      published: true,
      created_by: adminId,
    },
  ];

  for (const row of rows) {
    const { data: existing } = await supabase.from('hub_sops').select('id').eq('title', row.title).maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from('hub_sops').insert(row);
    if (error) throw error;
  }
}

async function seedBlackouts(supabase: ReturnType<typeof createClient>, adminId: string) {
  const row = {
    start_date: '2026-12-15',
    end_date: '2026-12-20',
    reason: 'Holiday campaign production sprint',
    created_by: adminId,
  };
  const { data: existing } = await supabase
    .from('hub_blackout_dates')
    .select('id')
    .eq('start_date', row.start_date)
    .eq('end_date', row.end_date)
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase.from('hub_blackout_dates').insert(row);
    if (error) throw error;
  }
}

async function seedAttendance(supabase: ReturnType<typeof createClient>, contractorId: string) {
  const rows = [
    { user_id: contractorId, date: '2026-05-13', hours_raw: 8.4, hours_capped: 8, overtime_hours: 0.4, first_on: '2026-05-13T01:02:00Z', last_off: '2026-05-13T09:28:00Z' },
    { user_id: contractorId, date: '2026-05-14', hours_raw: 7.9, hours_capped: 7.9, overtime_hours: 0, first_on: '2026-05-14T01:07:00Z', last_off: '2026-05-14T09:01:00Z' },
    { user_id: contractorId, date: '2026-05-15', hours_raw: 8.7, hours_capped: 8, overtime_hours: 0.7, first_on: '2026-05-15T00:58:00Z', last_off: '2026-05-15T09:40:00Z' },
  ];

  for (const row of rows) {
    const { error } = await supabase.from('hub_daily_hours').upsert(row, {
      onConflict: 'user_id,date',
    });
    if (error) throw error;
  }
}

async function seedTimeOff(supabase: ReturnType<typeof createClient>, contractorId: string) {
  const rows = [
    {
      contractor_id: contractorId,
      type: 'pto',
      start_date: '2026-06-18',
      end_date: '2026-06-18',
      reason: 'Family event',
      status: 'approved',
      half_day: true,
      half_day_period: 'afternoon',
      admin_notes: 'Approved for coverage handoff.',
      hr_notes: 'Approved for coverage handoff.',
    },
    {
      contractor_id: contractorId,
      type: 'sick',
      start_date: '2026-05-20',
      end_date: '2026-05-20',
      reason: 'Flu recovery',
      status: 'forwarded',
      half_day: false,
      admin_notes: 'Awaiting owner confirmation.',
      hr_notes: 'Awaiting owner confirmation.',
      forwarded_to_owner: true,
    },
  ];

  for (const row of rows) {
    const { data: existing } = await supabase
      .from('hub_time_off')
      .select('id')
      .eq('contractor_id', contractorId)
      .eq('type', row.type)
      .eq('start_date', row.start_date)
      .maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from('hub_time_off').insert(row);
    if (error) throw error;
  }
}

async function seedRequests(supabase: ReturnType<typeof createClient>, contractorId: string) {
  const row = {
    contractor_id: contractorId,
    type: 'equipment',
    title: 'Request additional SSD for editing workstation',
    description: 'Current drive is close to full because of active campaign assets.',
    status: 'in_review',
    admin_notes: 'Pending budget signoff.',
  };
  const { data: existing } = await supabase
    .from('hub_requests')
    .select('id')
    .eq('contractor_id', contractorId)
    .eq('title', row.title)
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase.from('hub_requests').insert(row);
    if (error) throw error;
  }
}

async function seedPayouts(supabase: ReturnType<typeof createClient>, contractorId: string, adminId: string) {
  const row = {
    contractor_id: contractorId,
    cutoff_start: '2026-05-01',
    cutoff_end: '2026-05-15',
    approved_hours: 23.9,
    hourly_rate: 350,
    base_pay: 8365,
    bonus: 0,
    incentives: 0,
    reimbursements: 0,
    deductions: 0,
    advances: 0,
    penalties: 0,
    final_payout: 8750,
    status: 'hr_approved',
    locked: false,
    created_by: adminId,
    submitted_at: '2026-05-16T03:00:00Z',
    approved_at: '2026-05-16T08:00:00Z',
  };
  const { error } = await supabase.from('hub_payouts').upsert(row, {
    onConflict: 'contractor_id,cutoff_start',
  });
  if (error) throw error;
}

async function seedClientsAndProjects(supabase: ReturnType<typeof createClient>, hourlyContractorId: string, projectContractorId: string) {
  const clientRows = [
    {
      client_name: 'Northstar Dental',
      platform: 'Meta Ads',
      status: 'active',
      notes: 'Demo retainer client with recurring paid social support.',
      contract_value: 45000,
      contract_currency: 'PHP',
    },
    {
      client_name: 'Crestline Studio',
      platform: 'Branding',
      status: 'active',
      notes: 'Demo branding and site rollout client.',
      contract_value: 65000,
      contract_currency: 'PHP',
    },
  ];

  const clientIds: number[] = [];
  for (const row of clientRows) {
    let { data } = await supabase.from('hub_clients').select('id').eq('client_name', row.client_name).maybeSingle();
    if (!data) {
      const insert = await supabase.from('hub_clients').insert(row).select('id').single();
      if (insert.error || !insert.data) throw insert.error ?? new Error(`Failed to seed client ${row.client_name}`);
      data = insert.data;
    }
    clientIds.push(data.id);
  }

  const assignmentRows = [
    { client_id: clientIds[0], contractor_id: hourlyContractorId, role: 'Designer' },
    { client_id: clientIds[1], contractor_id: projectContractorId, role: 'Media Buyer' },
  ];
  for (const row of assignmentRows) {
    const { error } = await supabase.from('hub_client_assignments').upsert(row, {
      onConflict: 'client_id,contractor_id',
    });
    if (error) throw error;
  }

  let { data: project } = await supabase
    .from('hub_projects')
    .select('id')
    .eq('client_name', 'Crestline Studio')
    .eq('project_name', 'Crestline Launch Site')
    .maybeSingle();

  if (!project) {
    const insert = await supabase.from('hub_projects').insert({
      client_name: 'Crestline Studio',
      project_name: 'Crestline Launch Site',
      service: 'Landing Page + Funnel Build',
      contract_price: 85000,
      status: 'ongoing',
      start_date: '2026-05-05',
      deadline: '2026-06-10',
      notes: 'Demo project used for contractor payout previews.',
    }).select('id').single();
    if (insert.error || !insert.data) throw insert.error ?? new Error('Failed to seed project');
    project = insert.data;
  }

  const { data: existingPayment } = await supabase
    .from('hub_project_payments')
    .select('id')
    .eq('project_id', project.id)
    .eq('amount', 40000)
    .maybeSingle();
  if (!existingPayment) {
    const { error } = await supabase.from('hub_project_payments').insert({
      project_id: project.id,
      amount: 40000,
      paid_at: '2026-05-20',
      notes: 'Initial deposit',
    });
    if (error) throw error;
  }

  const { data: existingCost } = await supabase
    .from('hub_project_costs')
    .select('id')
    .eq('project_id', project.id)
    .eq('label', 'Hosting and tooling')
    .maybeSingle();
  if (!existingCost) {
    const { error } = await supabase.from('hub_project_costs').insert({
      project_id: project.id,
      label: 'Hosting and tooling',
      amount: 6500,
      date: '2026-05-22',
      notes: 'Demo operating cost',
    });
    if (error) throw error;
  }

  const contractorInsert = await supabase.from('hub_project_contractors').upsert({
    project_id: project.id,
    contractor_id: projectContractorId,
    percentage: 18,
    payout_type: 'percentage',
    payout_status: 'approved',
  }, {
    onConflict: 'project_id,contractor_id',
  }).select('id').single();

  if (contractorInsert.error || !contractorInsert.data) throw contractorInsert.error ?? new Error('Failed to seed project contractor');

  const { data: existingPayout } = await supabase
    .from('hub_project_contractor_payouts')
    .select('id')
    .eq('project_contractor_id', contractorInsert.data.id)
    .eq('amount', 9500)
    .maybeSingle();

  if (!existingPayout) {
    const { error } = await supabase.from('hub_project_contractor_payouts').insert({
      project_contractor_id: contractorInsert.data.id,
      amount: 9500,
      paid_at: '2026-05-24',
      notes: 'First partial payout',
      receipt_url: 'https://example.com/demo-project-receipt.jpg',
    });
    if (error) throw error;
  }
}

async function seedDocuments(supabase: ReturnType<typeof createClient>, adminId: string, contractorId: string) {
  let { data: document } = await supabase
    .from('hub_sign_documents')
    .select('id')
    .eq('title', 'Independent Contractor Agreement — Demo')
    .maybeSingle();

  if (!document) {
    const insert = await supabase.from('hub_sign_documents').insert({
      title: 'Independent Contractor Agreement — Demo',
      description: 'Demo contract used for pilot walkthroughs.',
      file_url: 'https://example.com/demo-contractor-agreement.pdf',
      file_name: 'demo-contractor-agreement.pdf',
      uploaded_by: adminId,
    }).select('id').single();
    if (insert.error || !insert.data) throw insert.error ?? new Error('Failed to seed sign document');
    document = insert.data;
  }

  const { error: assignmentError } = await supabase.from('hub_sign_assignments').upsert({
    document_id: document.id,
    contractor_id: contractorId,
    status: 'pending',
  }, {
    onConflict: 'document_id,contractor_id',
  });
  if (assignmentError) throw assignmentError;

  const { data: docRequest } = await supabase
    .from('hub_doc_requests')
    .select('id')
    .eq('contractor_id', contractorId)
    .eq('doc_type', 'Certificate of Engagement')
    .maybeSingle();

  if (!docRequest) {
    const { error } = await supabase.from('hub_doc_requests').insert({
      contractor_id: contractorId,
      doc_type: 'Certificate of Engagement',
      notes: 'Needed for bank proof of income.',
      status: 'pending',
    });
    if (error) throw error;
  }
}

async function seedPerformanceReview(supabase: ReturnType<typeof createClient>, reviewerId: string, contractorId: string) {
  const { data: existing } = await supabase
    .from('hub_performance_reviews')
    .select('id')
    .eq('contractor_id', contractorId)
    .eq('period_label', 'Q2 2026')
    .maybeSingle();

  if (existing) return;

  const { error } = await supabase.from('hub_performance_reviews').insert({
    contractor_id: contractorId,
    reviewer_id: reviewerId,
    period_label: 'Q2 2026',
    overall_rating: 4,
    attendance_rating: 4,
    quality_rating: 5,
    communication_rating: 4,
    initiative_rating: 4,
    strengths: 'Consistently ships clean creative work and communicates blockers early.',
    improvements: 'Could tighten turnaround time on revision rounds.',
    notes: 'Good candidate for expanded ownership in the next cycle.',
  });
  if (error) throw error;
}
