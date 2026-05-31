import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────

type QType = 'short_text' | 'paragraph' | 'single_choice' | 'multi_choice';

interface Question {
  id: string;
  type: QType;
  label: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface Questionnaire {
  id: number;
  service_type: string;
  client_name: string;
  client_email: string;
  token: string;
  status: 'draft' | 'sent' | 'submitted';
  questions: Question[];
  answers: Record<string, string | string[]> | null;
  intro_message: string | null;
  submitted_at: string | null;
  created_at: string;
}

// ─── Service templates ────────────────────────────────────────────────────────

const SERVICES = [
  'Website Design',
  'Graphic Design / Flyer',
  'Branding & Identity',
  'Social Media Management',
  'SEO / Digital Ads',
  'Custom Hub / Web App',
];

const q = (id: string, type: QType, label: string, opts?: { required?: boolean; options?: string[]; placeholder?: string }): Question =>
  ({ id, type, label, ...opts });

const TEMPLATES: Record<string, Question[]> = {
  'Website Design': [
    q('biz_name', 'short_text', 'What is your business name?', { required: true }),
    q('biz_desc', 'paragraph', 'Describe your business and what you do.', { required: true }),
    q('audience', 'paragraph', 'Who is your target audience?', { required: true }),
    q('existing_site', 'single_choice', 'Do you have an existing website?', { options: ['Yes', 'No', 'In progress'] }),
    q('existing_url', 'short_text', 'If yes, what is the URL?', { placeholder: 'https://...' }),
    q('pages', 'multi_choice', 'What pages do you need?', { options: ['Home', 'About', 'Services', 'Portfolio / Gallery', 'Blog', 'Contact', 'Shop / E-commerce', 'Booking / Scheduling', 'Other'] }),
    q('features', 'multi_choice', 'What features do you need?', { options: ['Contact form', 'Online booking', 'Payment / checkout', 'Client login portal', 'Photo / video gallery', 'Blog / news section', 'Newsletter signup', 'Live chat', 'Other'] }),
    q('branding', 'single_choice', 'Do you have existing branding?', { options: ['Yes – logo and brand colors', 'Partial – just a logo', 'No – we need everything'] }),
    q('brand_assets', 'short_text', 'If yes, share your brand assets (link or description).'),
    q('references', 'paragraph', 'List 3–5 websites you like and what you like about them.'),
    q('content', 'single_choice', 'What is your content situation?', { options: ['We have all content ready', 'We have some content', 'We need help with content'] }),
    q('timeline', 'single_choice', 'What is your timeline?', { options: ['ASAP', 'Within 1 month', '1–3 months', '3–6 months', 'Flexible'] }),
    q('budget', 'single_choice', 'What is your budget range?', { options: ['₱60k–₱100k', '₱100k–₱200k', '₱200k–₱500k', '₱500k+', "I have a specific budget in mind", "Let's discuss"] }),
    q('budget_custom', 'short_text', 'If you have a specific budget in mind, please share it.', { placeholder: 'e.g. ₱150,000' }),
    q('other', 'paragraph', 'Anything else we should know?'),
  ],
  'Graphic Design / Flyer': [
    q('purpose', 'short_text', 'What is this design for?', { required: true }),
    q('output_type', 'multi_choice', 'What type of output do you need?', { options: ['Flyer', 'Poster', 'Social media post', 'Banner (web or print)', 'Business card', 'Brochure', 'Presentation deck', 'Menu', 'Other'] }),
    q('event_details', 'paragraph', 'Event or campaign details (date, time, venue if applicable).'),
    q('audience', 'short_text', 'Who is the target audience?'),
    q('dimensions', 'single_choice', 'What size / dimensions do you need?', { options: ['A4 (print)', 'A5 (print)', 'Letter (print)', 'Social media square (1:1)', 'Social media portrait (4:5)', 'Facebook cover', 'LinkedIn banner', 'Custom – specify below'] }),
    q('branding', 'single_choice', 'Do you have existing branding?', { options: ['Yes – logo and brand colors', 'Partial – just a logo', 'No'] }),
    q('brand_assets', 'short_text', 'If yes, share your brand assets (link or description).'),
    q('copy_ready', 'single_choice', 'Do you have copy / text ready?', { options: ['Yes – fully written', 'Partial', 'No – we need help with copy'] }),
    q('copy_text', 'paragraph', 'Share the copy or key information to include.'),
    q('references', 'paragraph', 'Reference designs you like (links, descriptions, or key words).'),
    q('style', 'multi_choice', 'Preferred style / mood.', { options: ['Minimalist', 'Bold / vibrant', 'Elegant / luxury', 'Playful / fun', 'Corporate / professional', 'Vintage / retro', 'Modern / tech', 'Natural / organic'] }),
    q('delivery', 'multi_choice', 'Delivery format needed.', { options: ['Print-ready PDF', 'PNG / JPG', 'Editable file (AI / PSD)', 'Social-ready JPG/PNG'] }),
    q('timeline', 'single_choice', 'What is your timeline?', { options: ['ASAP', '3–5 days', '1 week', '2 weeks', 'Flexible'] }),
    q('other', 'paragraph', 'Anything else?'),
  ],
  'Branding & Identity': [
    q('biz_name', 'short_text', 'What is your business name?', { required: true }),
    q('biz_desc', 'paragraph', 'What does your business do?', { required: true }),
    q('audience', 'paragraph', 'Who is your target audience?', { required: true }),
    q('values', 'paragraph', 'What are your brand values?'),
    q('personality', 'multi_choice', 'How would you describe your brand\'s personality?', { options: ['Professional', 'Playful', 'Luxurious', 'Bold', 'Minimalist', 'Friendly', 'Innovative', 'Traditional', 'Eco-conscious'] }),
    q('colors_like', 'paragraph', 'What colors do you like?'),
    q('colors_avoid', 'paragraph', 'What colors do you want to avoid?'),
    q('admired_brands', 'paragraph', 'List 3–5 brands you admire and what you like about them.'),
    q('competitors', 'paragraph', 'Who are your competitors?'),
    q('deliverables', 'multi_choice', 'What deliverables do you need?', { options: ['Primary logo', 'Logo variations (horizontal, stacked, icon)', 'Brand color palette', 'Typography system', 'Business cards', 'Letterhead', 'Brand guide / style guide', 'Social media profile graphics', 'Other'] }),
    q('existing_brand', 'single_choice', 'Do you have existing brand assets?', { options: ['Yes – full branding', 'Partial – just a logo', 'No – starting from scratch'] }),
    q('timeline', 'single_choice', 'What is your timeline?', { options: ['1–2 weeks', '1 month', '1–3 months', 'Flexible'] }),
    q('budget', 'single_choice', 'What is your budget range?', { options: ['₱15k–₱25k', '₱25k–₱50k', '₱50k+', "Let's discuss"] }),
    q('other', 'paragraph', 'Anything else?'),
  ],
  'Social Media Management': [
    q('biz_name', 'short_text', 'What is your business name?', { required: true }),
    q('platforms', 'multi_choice', 'What platforms do you want managed?', { options: ['Facebook', 'Instagram', 'TikTok', 'LinkedIn', 'Twitter / X', 'YouTube', 'Pinterest', 'Other'] }),
    q('current_following', 'paragraph', 'What is your current following on each platform?'),
    q('goals', 'multi_choice', 'What are your social media goals?', { options: ['Brand awareness', 'Drive website traffic', 'Generate leads', 'Grow followers', 'Increase engagement', 'Product / service promotion', 'Community building'] }),
    q('topics', 'paragraph', 'What topics / content pillars do you want covered?', { required: true }),
    q('tone', 'single_choice', 'What is your brand\'s tone of voice?', { options: ['Professional', 'Conversational / friendly', 'Humorous', 'Inspirational', 'Educational', 'Bold / edgy'] }),
    q('existing_content', 'single_choice', 'Do you have existing content (photos, videos, graphics)?', { options: ['Yes – plenty', 'Some', 'No – need content creation too'] }),
    q('frequency', 'single_choice', 'How many posts per week do you want?', { options: ['3x per week', '5x per week', 'Daily', 'Custom – specify below'] }),
    q('mgmt_budget', 'single_choice', 'What is your monthly budget for social media management?', { options: ['₱12k–₱20k / month', '₱20k–₱35k / month', '₱35k+ / month', "Let's discuss"] }),
    q('paid_ads', 'single_choice', 'Do you need paid ads management?', { options: ['Yes', 'No', 'Maybe later'] }),
    q('ad_budget', 'single_choice', 'What is your monthly ad budget?', { options: ['Under ₱5k / month', '₱5k–₱15k / month', '₱15k–₱30k / month', '₱30k+ / month', 'No budget yet'] }),
    q('competitors', 'short_text', 'Who are your competitors?'),
    q('other', 'paragraph', 'Anything else?'),
  ],
  'SEO / Digital Ads': [
    q('biz_name', 'short_text', 'What is your business name?', { required: true }),
    q('website', 'short_text', 'What is your website URL?', { required: true, placeholder: 'https://...' }),
    q('service', 'multi_choice', 'What service are you interested in?', { options: ['SEO', 'Google Ads', 'Facebook / Meta Ads', 'TikTok Ads', 'Email marketing'] }),
    q('goal', 'paragraph', 'What is your primary business goal?', { required: true }),
    q('audience', 'paragraph', 'Who is your target audience?', { required: true }),
    q('keywords', 'paragraph', 'What keywords do you want to rank for or target?'),
    q('competitors', 'paragraph', 'Who are your main competitors?'),
    q('analytics', 'single_choice', 'Do you have Google Analytics / Search Console set up?', { options: ['Yes', 'No', 'Not sure'] }),
    q('ad_budget', 'single_choice', 'What is your monthly budget for ads?', { options: ['Under ₱5k', '₱5k–₱15k', '₱15k–₱30k', '₱30k+', "Let's discuss"] }),
    q('timeline', 'single_choice', 'What is your expected timeline to see results?', { options: ['1–3 months', '3–6 months', '6–12 months', 'Long-term', 'Just want to start'] }),
    q('other', 'paragraph', 'Anything else?'),
  ],
  'Custom Hub / Web App': [
    q('biz_name', 'short_text', 'What is your business or organization name?', { required: true }),
    q('tool_desc', 'paragraph', 'What kind of tool do you need?', { required: true, placeholder: 'e.g. team management system, client portal, inventory tracker, booking system…' }),
    q('users', 'multi_choice', 'Who will use it?', { options: ['Internal team only', 'Clients only', 'Both internal team and clients', 'Partners / vendors', 'Public users'] }),
    q('user_count', 'single_choice', 'How many users are you expecting?', { options: ['1–10', '10–50', '50–200', '200+', 'Not sure yet'] }),
    q('features', 'multi_choice', 'What core features do you need?', { options: ['User login & roles / permissions', 'Dashboard with charts / reports', 'Form submissions', 'File uploads', 'Email or in-app notifications', 'Messaging / chat', 'Calendar / scheduling', 'Payment collection', 'Inventory / product tracking', 'API integrations', 'Mobile app', 'Other'] }),
    q('integrations', 'paragraph', 'What external tools should it connect to?', { placeholder: 'e.g. Slack, Google Sheets, Stripe, existing CRM…' }),
    q('mobile', 'single_choice', 'Does it need to work on mobile?', { options: ['Yes – must be mobile-friendly (web)', 'Yes – native mobile app preferred', 'Desktop only', 'Unsure'] }),
    q('replace', 'paragraph', 'What are you currently doing manually that this should replace?', { required: true }),
    q('existing_data', 'single_choice', 'Do you have an existing system or database?', { options: ['Yes – migrating from existing system', 'No – starting fresh', 'Partial – some data exists'] }),
    q('success', 'paragraph', 'What does success look like for you?'),
    q('timeline', 'single_choice', 'What is your timeline?', { options: ['ASAP', '1–2 months', '3–6 months', '6–12 months', 'Flexible'] }),
    q('budget', 'single_choice', 'What is your budget range?', { options: ['Under ₱50k', '₱50k–₱150k', '₱150k–₱300k', '₱300k+', "Let's discuss"] }),
    q('other', 'paragraph', 'Anything else we should know?'),
  ],
};

// ─── Status config ────────────────────────────────────────────────────────────

const statusCfg = {
  draft:     { label: 'Draft',     cls: 'bg-gray-100 text-gray-500' },
  sent:      { label: 'Sent',      cls: 'bg-sky-100 text-sky-700' },
  submitted: { label: 'Submitted', cls: 'bg-emerald-100 text-emerald-700' },
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuestionnairesPage() {
  const { hubUser } = useAuth();
  const [list, setList] = useState<Questionnaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [service, setService] = useState(SERVICES[0]);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [introMsg, setIntroMsg] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [sending, setSending] = useState<number | null>(null);
  const [sendMsg, setSendMsg] = useState<Record<number, string>>({});

  const fetchAll = async () => {
    const { data } = await supabase
      .from('hub_questionnaires')
      .select('*')
      .order('created_at', { ascending: false });
    setList((data as Questionnaire[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const activeQ = list.find(q => q.id === activeId) ?? null;

  const openCreate = () => {
    setService(SERVICES[0]);
    setClientName('');
    setClientEmail('');
    setIntroMsg('');
    setCreateError('');
    setShowCreate(true);
  };

  const saveAndSend = async (send: boolean) => {
    if (!clientName.trim() || !clientEmail.trim()) { setCreateError('Client name and email are required.'); return; }
    setCreating(true);
    setCreateError('');
    const questions = TEMPLATES[service] ?? [];
    const { data, error } = await supabase.from('hub_questionnaires').insert({
      service_type: service,
      client_name: clientName.trim(),
      client_email: clientEmail.trim(),
      questions,
      intro_message: introMsg.trim() || null,
      status: send ? 'sent' : 'draft',
      created_by: hubUser?.id,
    }).select().single();
    if (error || !data) { setCreateError(error?.message ?? 'Failed to save'); setCreating(false); return; }

    if (send) {
      const { data: fnData } = await supabase.functions.invoke('send-questionnaire', {
        body: {
          to: clientEmail.trim(),
          client_name: clientName.trim(),
          service_type: service,
          token: data.token,
          intro_message: introMsg.trim() || null,
          question_count: questions.length,
        },
      });
      if (fnData?.error) { setCreateError(fnData.error); setCreating(false); return; }
    }

    setCreating(false);
    setShowCreate(false);
    fetchAll();
  };

  const resend = async (q: Questionnaire) => {
    setSending(q.id);
    const { data } = await supabase.functions.invoke('send-questionnaire', {
      body: {
        to: q.client_email,
        client_name: q.client_name,
        service_type: q.service_type,
        token: q.token,
        intro_message: q.intro_message,
        question_count: q.questions.length,
      },
    });
    if (q.status === 'draft') {
      await supabase.from('hub_questionnaires').update({ status: 'sent' }).eq('id', q.id);
      fetchAll();
    }
    setSending(null);
    setSendMsg(p => ({ ...p, [q.id]: data?.error ? `Error: ${data.error}` : 'Sent!' }));
    setTimeout(() => setSendMsg(p => ({ ...p, [q.id]: '' })), 3000);
  };

  const deleteQ = async (id: number) => {
    await supabase.from('hub_questionnaires').delete().eq('id', id);
    if (activeId === id) setActiveId(null);
    fetchAll();
  };

  const questions = TEMPLATES[service] ?? [];

  return (
    <AdminLayout title="Questionnaires">
      <div className="flex flex-col md:flex-row gap-5 md:h-[calc(100vh-220px)]">

        {/* Left: list */}
        <div className={`w-full md:w-80 flex-shrink-0 flex flex-col gap-3 ${activeId ? 'hidden md:flex' : 'flex'}`}>
          <button onClick={openCreate}
            className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-[#111827] text-white text-sm rounded-xl hover:bg-gray-800 cursor-pointer">
            <i className="ri-add-line"></i> New Questionnaire
          </button>

          <div className="md:flex-1 md:overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <div className="flex justify-center py-8"><i className="ri-loader-4-line animate-spin text-gray-300 text-xl"></i></div>
            ) : list.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
                <i className="ri-questionnaire-line text-3xl text-gray-200 block mb-2"></i>
                <p className="text-sm text-gray-400">No questionnaires yet</p>
              </div>
            ) : list.map(q => {
              const cfg = statusCfg[q.status];
              return (
                <button key={q.id} onClick={() => setActiveId(q.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${activeId === q.id ? 'border-[#FF6B35] bg-orange-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#111827] truncate">{q.client_name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{q.service_type}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${cfg.cls}`}>{cfg.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {new Date(q.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: detail */}
        {activeQ ? (
          <div className="flex-1 md:overflow-y-auto space-y-4 min-w-0">
            <button onClick={() => setActiveId(null)} className="md:hidden flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 cursor-pointer">
              <i className="ri-arrow-left-line"></i> All Questionnaires
            </button>

            {/* Header */}
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-[#111827] text-lg">{activeQ.client_name}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg[activeQ.status].cls}`}>{statusCfg[activeQ.status].label}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{activeQ.service_type}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{activeQ.client_email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {activeQ.status !== 'submitted' && (
                    <button onClick={() => resend(activeQ)} disabled={sending === activeQ.id}
                      className="text-xs px-2.5 py-1.5 bg-[#111827] text-white rounded-lg hover:bg-gray-700 cursor-pointer disabled:opacity-40 flex items-center gap-1">
                      {sending === activeQ.id ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-mail-send-line"></i>}
                      {activeQ.status === 'draft' ? 'Send' : 'Resend'}
                    </button>
                  )}
                  {sendMsg[activeQ.id] && (
                    <span className={`text-xs font-medium ${sendMsg[activeQ.id].startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}`}>
                      {sendMsg[activeQ.id]}
                    </span>
                  )}
                  <button onClick={() => deleteQ(activeQ.id)} className="text-gray-300 hover:text-rose-400 cursor-pointer"><i className="ri-delete-bin-line text-sm"></i></button>
                </div>
              </div>
              {activeQ.submitted_at && (
                <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                  <i className="ri-check-line"></i>
                  Submitted {new Date(activeQ.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              )}
              {activeQ.intro_message && (
                <div className="mt-3 bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 italic">{activeQ.intro_message}</p>
                </div>
              )}
            </div>

            {/* Responses or Questions preview */}
            {activeQ.status === 'submitted' && activeQ.answers ? (
              <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-5">
                <h3 className="text-sm font-semibold text-[#111827]">Client Responses</h3>
                {activeQ.questions.map(question => {
                  const answer = activeQ.answers![question.id];
                  const hasAnswer = answer && (Array.isArray(answer) ? answer.length > 0 : answer.trim() !== '');
                  return (
                    <div key={question.id} className="space-y-1.5">
                      <p className="text-xs font-medium text-gray-700">{question.label}{question.required && <span className="text-red-400 ml-0.5">*</span>}</p>
                      {hasAnswer ? (
                        Array.isArray(answer) ? (
                          <div className="flex flex-wrap gap-1.5">
                            {answer.map(a => <span key={a} className="text-xs bg-[#FF6B35]/10 text-[#FF6B35] px-2 py-0.5 rounded-full font-medium">{a}</span>)}
                          </div>
                        ) : (
                          <p className="text-sm text-[#111827] bg-gray-50 rounded-lg px-3 py-2">{answer}</p>
                        )
                      ) : (
                        <p className="text-xs text-gray-300 italic">No answer</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide text-xs">Questions that will be sent</h3>
                <ol className="space-y-3">
                  {activeQ.questions.map((question, i) => (
                    <li key={question.id} className="flex gap-3">
                      <span className="text-xs text-gray-300 font-mono mt-0.5 flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <p className="text-sm text-gray-700">{question.label}{question.required && <span className="text-red-400 ml-0.5">*</span>}</p>
                        {question.options && (
                          <p className="text-xs text-gray-400 mt-0.5">{question.options.join(' · ')}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ) : !activeId && (
          <div className="hidden md:flex flex-1 items-center justify-center">
            <div className="text-center">
              <i className="ri-questionnaire-line text-4xl text-gray-200 block mb-3"></i>
              <p className="text-sm text-gray-400">Select a questionnaire to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold text-[#111827]">New Questionnaire</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer"><i className="ri-close-line text-lg"></i></button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Service type */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Service type</label>
                <select value={service} onChange={e => setService(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] bg-white">
                  {SERVICES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              {/* Client info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Client name <span className="text-red-400">*</span></label>
                  <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Juan dela Cruz"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Client email <span className="text-red-400">*</span></label>
                  <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@email.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
              </div>

              {/* Intro message */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Intro message <span className="text-gray-400 font-normal">(optional — shown in the email)</span></label>
                <textarea value={introMsg} onChange={e => setIntroMsg(e.target.value)} rows={3}
                  placeholder="e.g. Hi! Thanks for getting in touch. Before we prepare your proposal, we'd love to understand your project better."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] resize-none" />
              </div>

              {/* Questions preview */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{questions.length} questions will be sent</p>
                <ol className="space-y-1.5">
                  {questions.map((q, i) => (
                    <li key={q.id} className="flex gap-2 text-xs text-gray-500">
                      <span className="text-gray-300 font-mono flex-shrink-0">{i + 1}.</span>
                      <span>{q.label}{q.required && <span className="text-red-300 ml-0.5">*</span>}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {createError && <p className="text-xs text-red-500">{createError}</p>}
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <button onClick={() => saveAndSend(false)} disabled={creating}
                className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer disabled:opacity-40">
                {creating ? 'Saving…' : 'Save as Draft'}
              </button>
              <button onClick={() => saveAndSend(true)} disabled={creating}
                className="flex-1 py-2 text-sm bg-[#FF6B35] text-white rounded-lg hover:bg-[#e55a27] cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5">
                {creating ? <><i className="ri-loader-4-line animate-spin"></i> Sending…</> : <><i className="ri-mail-send-line"></i> Send to Client</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
