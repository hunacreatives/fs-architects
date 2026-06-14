import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

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
  token: string;
  status: 'draft' | 'sent' | 'submitted';
  questions: Question[];
  intro_message: string | null;
}

export default function PublicQuestionnairePage() {
  const { token } = useParams<{ token: string }>();
  const [q, setQ] = useState<Questionnaire | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    supabase
      .from('hub_questionnaires')
      .select('id, service_type, client_name, token, status, questions, intro_message')
      .eq('token', token)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); }
        else if (data.status === 'submitted') { setSubmitted(true); setQ(data as Questionnaire); }
        else if (data.status === 'draft') { setNotFound(true); }
        else { setQ(data as Questionnaire); }
        setLoading(false);
      });
  }, [token]);

  const setAnswer = (id: string, value: string | string[]) =>
    setAnswers(prev => ({ ...prev, [id]: value }));

  const toggleMulti = (id: string, option: string) => {
    const curr = (answers[id] as string[]) ?? [];
    setAnswer(id, curr.includes(option) ? curr.filter(x => x !== option) : [...curr, option]);
  };

  const validate = () => {
    if (!q) return false;
    const errs: Record<string, string> = {};
    q.questions.forEach(question => {
      if (!question.required) return;
      const a = answers[question.id];
      if (!a || (Array.isArray(a) ? a.length === 0 : a.trim() === '')) {
        errs[question.id] = 'This question is required.';
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async () => {
    if (!validate() || !q) return;
    setSubmitting(true);
    const { error } = await supabase
      .from('hub_questionnaires')
      .update({ answers, status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('token', token!)
      .eq('status', 'sent');
    setSubmitting(false);
    if (error) { setErrors({ _form: 'Something went wrong. Please try again.' }); return; }
    await supabase.functions.invoke('notify-questionnaire-submitted', {
      body: { client_name: q!.client_name, service_type: q!.service_type },
    });
    setSubmitted(true);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <i className="ri-error-warning-line text-2xl text-gray-400"></i>
        </div>
        <h1 className="text-lg font-bold text-gray-800 mb-2">Link not found</h1>
        <p className="text-sm text-gray-500">This questionnaire link is invalid or has expired.</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <i className="ri-check-line text-2xl text-emerald-600"></i>
        </div>
        <h1 className="text-lg font-bold text-gray-800 mb-2">Thank you{q?.client_name ? `, ${q.client_name.split(' ')[0]}` : ''}!</h1>
        <p className="text-sm text-gray-500 mb-4">We've received your answers and will get back to you with a proposal soon.</p>
        <a href="https://www.hunacreatives.com" className="text-sm text-[#FF6B35] font-medium hover:underline">
          Visit hunacreatives.com →
        </a>
      </div>
    </div>
  );

  if (!q) return null;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <div className="bg-[#111827] px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <img src="https://www.hunacreatives.com/images/fc04818c74ad69bdfb22b93a6a0c6a72.png"
            alt="Huna Creatives" className="h-7" />
        </div>
      </div>

      {/* Hero */}
      <div className="bg-white border-b border-gray-100 px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <span className="text-xs font-semibold text-[#FF6B35] uppercase tracking-wider">{q.service_type}</span>
          <h1 className="text-2xl font-bold text-[#111827] mt-1 mb-2">
            Hi {q.client_name.split(' ')[0]}, tell us about your project
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            {q.intro_message || `We'd love to understand your ${q.service_type.toLowerCase()} needs before putting together your proposal. This takes about 5 minutes.`}
          </p>
        </div>
      </div>

      {/* Questions */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {q.questions.map((question, i) => (
          <div key={question.id} className="bg-white border border-gray-100 rounded-2xl p-5">
            <label className="block text-sm font-semibold text-[#111827] mb-3">
              <span className="text-gray-300 font-mono text-xs mr-2">{String(i + 1).padStart(2, '0')}</span>
              {question.label}
              {question.required && <span className="text-red-400 ml-1">*</span>}
            </label>

            {question.type === 'short_text' && (
              <input
                type="text"
                value={(answers[question.id] as string) ?? ''}
                onChange={e => setAnswer(question.id, e.target.value)}
                placeholder={question.placeholder ?? ''}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]"
              />
            )}

            {question.type === 'paragraph' && (
              <textarea
                value={(answers[question.id] as string) ?? ''}
                onChange={e => setAnswer(question.id, e.target.value)}
                placeholder={question.placeholder ?? ''}
                rows={4}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] resize-none"
              />
            )}

            {question.type === 'single_choice' && question.options && (
              <div className="space-y-2">
                {question.options.map(opt => (
                  <label key={opt} className="flex items-center gap-3 cursor-pointer group">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      answers[question.id] === opt ? 'border-[#FF6B35] bg-[#FF6B35]' : 'border-gray-300 group-hover:border-gray-400'
                    }`} onClick={() => setAnswer(question.id, opt)}>
                      {answers[question.id] === opt && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                    <span className="text-sm text-gray-700" onClick={() => setAnswer(question.id, opt)}>{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {question.type === 'multi_choice' && question.options && (
              <div className="space-y-2">
                {question.options.map(opt => {
                  const selected = ((answers[question.id] as string[]) ?? []).includes(opt);
                  return (
                    <label key={opt} className="flex items-center gap-3 cursor-pointer group" onClick={() => toggleMulti(question.id, opt)}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        selected ? 'border-[#FF6B35] bg-[#FF6B35]' : 'border-gray-300 group-hover:border-gray-400'
                      }`}>
                        {selected && <i className="ri-check-line text-white text-[10px]"></i>}
                      </div>
                      <span className="text-sm text-gray-700">{opt}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {errors[question.id] && (
              <p className="text-xs text-red-500 mt-2">{errors[question.id]}</p>
            )}
          </div>
        ))}

        {errors._form && <p className="text-sm text-red-500 text-center">{errors._form}</p>}

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full py-3.5 bg-[#FF6B35] text-white font-semibold rounded-xl hover:bg-[#e55a27] transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
        >
          {submitting ? <><i className="ri-loader-4-line animate-spin"></i> Submitting…</> : 'Submit Questionnaire →'}
        </button>

        <p className="text-center text-xs text-gray-400 pb-8">
          © {new Date().getFullYear()} Huna Creatives · Your answers are shared only with the Huna Creatives team.
        </p>
      </div>
    </div>
  );
}
