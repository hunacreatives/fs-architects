import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { useHubAuth as useAuth } from '@/hooks/useHubAuth';
import { useDemo } from '@/contexts/DemoContext';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { getPeriods } from '@/lib/formatUtils';
import { supabase } from '@/lib/supabase';
import { HubAnnouncement, HubRequest, HubTimeOff } from '@/lib/types';
import { DEMO_ANNOUNCEMENTS, DEMO_REQUESTS, DEMO_TIME_OFF } from '@/lib/demoData';
import { computeFixedAccrual, computeSplitFixedAccrual, mergeLiveAttendanceIntoDailyHours } from '@/lib/payrollUtils';

const REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏'];

interface Reaction { emoji: string; user_id: string; }
interface Comment { id: string; body: string; user_id: string; created_at: string; hub_users: { full_name: string; avatar_url: string | null } | null; }

function AnnouncementCard({ a, currentUserId, canDelete, onDeleted }: {
  a: HubAnnouncement;
  currentUserId: string;
  canDelete: boolean;
  onDeleted: (id: number) => void;
}) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('hub_announcement_reactions').select('emoji, user_id').eq('announcement_id', a.id)
      .then(({ data }) => setReactions(data ?? []));
    supabase.from('hub_announcement_comments')
      .select('id, body, user_id, created_at, hub_users(full_name, avatar_url)')
      .eq('announcement_id', a.id).order('created_at', { ascending: true })
      .then(({ data }) => setComments((data as any) ?? []));
  }, [a.id]);

  const toggleReaction = async (emoji: string) => {
    const mine = reactions.find(r => r.user_id === currentUserId && r.emoji === emoji);
    if (mine) {
      await supabase.from('hub_announcement_reactions').delete()
        .eq('announcement_id', a.id).eq('user_id', currentUserId).eq('emoji', emoji);
      setReactions(prev => prev.filter(r => !(r.user_id === currentUserId && r.emoji === emoji)));
    } else {
      await supabase.from('hub_announcement_reactions').insert({ announcement_id: a.id, user_id: currentUserId, emoji });
      setReactions(prev => [...prev, { emoji, user_id: currentUserId }]);
    }
  };

  const postComment = async () => {
    if (!commentText.trim() || posting) return;
    setPosting(true);
    const { data, error } = await supabase.from('hub_announcement_comments')
      .insert({ announcement_id: a.id, user_id: currentUserId, body: commentText.trim() })
      .select('id, body, user_id, created_at, hub_users(full_name, avatar_url)')
      .single();
    if (!error && data) {
      setComments(prev => [...prev, data as any]);
      setCommentText('');
      const { data: admins } = await supabase
        .from('hub_users')
        .select('id')
        .in('role', ['owner', 'admin', 'hr'])
        .eq('status', 'active');

      await Promise.allSettled(
        (admins ?? []).map((admin) =>
          supabase.functions.invoke('send-push', {
            body: {
              user_id: admin.id,
              title: 'New announcement comment',
              body: `${(data as any).hub_users?.full_name ?? 'A contractor'} commented on "${a.title}"`,
              url: '/hub/admin/announcements',
            },
          })
        )
      );
    }
    setPosting(false);
  };

  const deleteComment = async (commentId: string) => {
    setDeletingComment(commentId);
    await supabase.from('hub_announcement_comments').delete().eq('id', commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    setDeletingComment(null);
  };

  const deleteAnnouncement = async () => {
    await supabase.from('hub_announcements').delete().eq('id', a.id);
    onDeleted(a.id);
  };

  const priorityDot: Record<string, string> = {
    urgent: 'bg-rose-500', important: 'bg-amber-400', normal: 'bg-gray-300',
  };

  const reactionCounts = REACTIONS.map(emoji => ({
    emoji,
    count: reactions.filter(r => r.emoji === emoji).length,
    mine: reactions.some(r => r.user_id === currentUserId && r.emoji === emoji),
  }));

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-[#1c2b3a]/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="ri-megaphone-line text-[#1c2b3a] text-sm"></i>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDot[a.priority]}`} />
              <p className="text-sm font-semibold text-[#111827] leading-snug">{a.title}</p>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {(() => {
                const poster = (a as any).hub_users;
                if (!poster) return <p className="text-xs text-gray-400">{new Date(a.created_at!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>;
                return (
                  <>
                    <HubAvatar fullName={poster.full_name} avatarUrl={poster.avatar_url} size="w-4 h-4" className="flex-shrink-0" />
                    <p className="text-xs text-gray-400">
                      <span className="text-gray-500 font-medium">{poster.full_name.split(' ')[0]}</span>
                      {' · '}{new Date(a.created_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
          {canDelete && (
            <button
              onClick={deleteAnnouncement}
              className="p-1.5 text-gray-300 hover:text-rose-400 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer flex-shrink-0"
              title="Delete announcement"
            >
              <i className="ri-delete-bin-line text-sm"></i>
            </button>
          )}
        </div>
        <p className="text-sm text-gray-600 mt-3 leading-relaxed whitespace-pre-wrap">{a.body}</p>
      </div>

      {/* Reactions */}
      <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
        {reactionCounts.filter(r => r.count > 0 || true).map(({ emoji, count, mine }) => (
          <button
            key={emoji}
            onClick={() => toggleReaction(emoji)}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-all cursor-pointer ${
              mine
                ? 'border-[#1c2b3a]/40 bg-[#1c2b3a]/8 text-[#1c2b3a]'
                : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200 hover:bg-gray-100'
            }`}
          >
            <span>{emoji}</span>
            {count > 0 && <span className="font-medium tabular-nums">{count}</span>}
          </button>
        ))}
      </div>

      {/* Comment toggle */}
      <div className="border-t border-gray-50 px-4 py-2 flex items-center gap-3">
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
        >
          <i className="ri-chat-3-line"></i>
          {comments.length > 0 ? `${comments.length} comment${comments.length !== 1 ? 's' : ''}` : 'Comment'}
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="border-t border-gray-50 px-4 py-3 space-y-3 bg-gray-50/50">
          {comments.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-1">No comments yet. Be the first!</p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2.5">
              <HubAvatar fullName={c.hub_users?.full_name ?? ''} avatarUrl={c.hub_users?.avatar_url} size="w-6 h-6" className="flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 relative group">
                  <p className="text-xs font-semibold text-gray-700">{c.hub_users?.full_name?.split(' ')[0] ?? 'Unknown'}</p>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{c.body}</p>
                  {c.user_id === currentUserId && (
                    <button
                      onClick={() => deleteComment(c.id)}
                      disabled={deletingComment === c.id}
                      className="absolute top-1.5 right-2 opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-rose-400 transition-all cursor-pointer rounded"
                      title="Delete comment"
                    >
                      <i className="ri-delete-bin-line text-xs"></i>
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-300 mt-1 ml-1">
                  {new Date(c.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} · {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
          ))}
          {/* Input */}
          <div className="flex items-center gap-2 pt-1">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }}
              placeholder="Write a comment..."
              className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/20 focus:border-[#1c2b3a] bg-white"
            />
            <button
              onClick={postComment}
              disabled={!commentText.trim() || posting}
              className="w-8 h-8 bg-[#1c2b3a] rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 cursor-pointer transition-opacity"
            >
              <i className="ri-send-plane-fill text-white text-xs"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const CLOCKS = [
  { label: 'Philippines', city: 'Cebu', tz: 'Asia/Manila', flag: '🇵🇭' },
  { label: 'US Pacific', city: 'Los Angeles', tz: 'America/Los_Angeles', flag: '🇺🇸' },
  { label: 'US Eastern', city: 'New York', tz: 'America/New_York', flag: '🇺🇸' },
  { label: 'London', city: 'London', tz: 'Europe/London', flag: '🇬🇧' },
  { label: 'Sydney', city: 'Sydney', tz: 'Australia/Sydney', flag: '🇦🇺' },
];

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function ClockFace({ tz, flag, label, city, isHome }: { tz: string; flag: string; label: string; city: string; isHome: boolean }) {
  const now = useClock();
  const time = now.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
  const date = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
  const [h, ms] = time.split(':');
  const minSec = ms.slice(0, 5);

  // Work hours indicator (9am–6pm local)
  const localHour = parseInt(now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }));
  const isWorkHours = localHour >= 9 && localHour < 18;

  return (
    <div className={`flex items-center justify-between py-3 border-b border-gray-50 last:border-0 ${isHome ? 'opacity-100' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="text-xl leading-none">{flag}</span>
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-gray-700">{label}</p>
            {isWorkHours && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" title="Business hours" />
            )}
          </div>
          <p className="text-xs text-gray-400">{city} · {date}</p>
        </div>
      </div>
      <div className="text-right tabular-nums">
        <p className="text-sm font-bold text-gray-800">
          {h}:{minSec}
        </p>
      </div>
    </div>
  );
}

interface SlackTeamRecord {
  full_name: string;
  avatar_url: string | null;
  status: 'on' | 'off' | 'absent';
  work_location: string | null;
  hours_today: number;
}

export default function ContractorDashboard() {
  const { user } = useAuth();
  const { isDemo } = useDemo();
  const navigate = useNavigate();
  const now = useClock();
  const [slackStatus, setSlackStatus] = useState<'on' | 'off' | 'absent' | null>(null);
  const [myWorkLocation, setMyWorkLocation] = useState<string | null>(null);
  const [hoursThisCutoff, setHoursThisCutoff] = useState(0);
  const [estimatedPayout, setEstimatedPayout] = useState(0);
  const [showPayout, setShowPayout] = useState(() => localStorage.getItem('hub_showPayout') === 'true');
  const [announcements, setAnnouncements] = useState<HubAnnouncement[]>([]);
  const [requests, setRequests] = useState<HubRequest[]>([]);
  const [timeOffs, setTimeOffs] = useState<HubTimeOff[]>([]);
  const [teamStatus, setTeamStatus] = useState<SlackTeamRecord[]>([]);
  const [payoutStatus, setPayoutStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeProjects, setActiveProjects] = useState<{ id: number; project_name: string; client_name: string; service: string | null; status: string; deadline: string | null; tasksDone: number; tasksTotal: number }[]>([]);

  const today = new Date();
  const currentPeriod = getPeriods().at(-1) ?? {
    label: '',
    start: today.toISOString().slice(0, 10),
    end: today.toISOString().slice(0, 10),
  };
  const cutoffStartStr = currentPeriod.start;
  const cutoffEndStr = currentPeriod.end;
  const cutoffStart = new Date(`${cutoffStartStr}T00:00:00`);
  const cutoffEnd = new Date(`${cutoffEndStr}T00:00:00`);

  const periodTotal = Math.round((cutoffEnd.getTime() - cutoffStart.getTime()) / 86400000) + 1;
  const daysElapsed = Math.min(Math.round((today.getTime() - cutoffStart.getTime()) / 86400000) + 1, periodTotal);
  const daysLeft = Math.max(periodTotal - daysElapsed, 0);
  const paydayLabel = cutoffEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  const isFixed = (user as any)?.payment_type === 'fixed';
  const maxHours = daysElapsed * 8;
  const hoursProgress = maxHours > 0 ? Math.min((hoursThisCutoff / maxHours) * 100, 100) : 0;

  const cutoffDeadlineDate = new Date(`${cutoffEndStr}T00:00:00`);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysUntilCutoff = Math.round((cutoffDeadlineDate.getTime() - todayMidnight.getTime()) / 86400000);
  const showPayslipBanner = daysUntilCutoff <= 3 && !['submitted','hr_approved','paid'].includes(payoutStatus ?? '');

  const fetchData = async () => {
    if (isDemo) {
      setHoursThisCutoff(62.5);
      setEstimatedPayout(28750);
      setAnnouncements(DEMO_ANNOUNCEMENTS as HubAnnouncement[]);
      setRequests(DEMO_REQUESTS.slice(0, 2) as HubRequest[]);
      setTimeOffs(DEMO_TIME_OFF.slice(0, 1) as HubTimeOff[]);
      setPayoutStatus('pending');
      setLoading(false);
      return;
    }
    if (!user) return;
    setLoading(true);

    const periodStartStr = cutoffStartStr;
    const periodEndStr   = cutoffEndStr;
    try {
      // Fetch active projects
      supabase
        .from('hub_project_contractors')
        .select('hub_projects(id, project_name, client_name, service, status, deadline)')
        .eq('contractor_id', user.id)
        .then(async ({ data }) => {
          const projects = ((data ?? []) as any[])
            .map((r: any) => Array.isArray(r.hub_projects) ? r.hub_projects[0] : r.hub_projects)
            .filter((p: any) => p && p.status === 'ongoing');
          if (projects.length === 0) { setActiveProjects([]); return; }
          const projectIds = projects.map((p: any) => p.id);
          const { data: tasks } = await supabase.from('hub_project_tasks').select('project_id, status').in('project_id', projectIds);
          setActiveProjects(projects.map((p: any) => {
            const pts = (tasks ?? []).filter((t: any) => t.project_id === p.id);
            return { id: p.id, project_name: p.project_name, client_name: p.client_name, service: p.service, status: p.status, deadline: p.deadline, tasksDone: pts.filter((t: any) => t.status === 'done').length, tasksTotal: pts.length };
          }));
        })
        .catch(() => setActiveProjects([]));

      const [attResult, annResult, reqResult, toResult, slackResult, rateRes, payoutRes] = await Promise.all([
        supabase
          .from('hub_daily_hours')
          .select('hours_capped, overtime_hours, date')
          .eq('user_id', user.id)
          .gte('date', periodStartStr)
          .lte('date', periodEndStr),
        supabase.from('hub_announcements').select('*, hub_users(full_name, avatar_url)').eq('published', true).order('created_at', { ascending: false }).limit(10),
        supabase.from('hub_requests').select('*').eq('contractor_id', user.id).order('created_at', { ascending: false }).limit(3),
        supabase.from('hub_time_off').select('*').eq('contractor_id', user.id).order('created_at', { ascending: false }).limit(3),
        supabase.functions.invoke('slack-attendance'),
        supabase.from('hub_rate_history')
          .select('effective_date, payment_type, hourly_rate, monthly_rate')
          .eq('contractor_id', user.id)
          .lte('effective_date', periodEndStr)
          .order('effective_date', { ascending: true }),
        supabase.from('hub_payouts')
          .select('status')
          .eq('contractor_id', user.id)
          .eq('cutoff_start', periodStartStr)
          .maybeSingle(),
      ]);

      const days = mergeLiveAttendanceIntoDailyHours(
        ((attResult.data ?? []) as any[]).map((d: any) => ({ ...d, user_id: user.id })),
        (slackResult.data as any)?.attendance || [],
        [user.id],
        today,
      ).map(({ user_id: _userId, ...rest }) => rest);
      const totalHours = days.reduce((s: number, r: any) => s + (r.hours_capped || 0), 0);
      const totalOT    = days.reduce((s: number, r: any) => s + (r.overtime_hours || 0), 0);
      setHoursThisCutoff(parseFloat(totalHours.toFixed(2)));

      const currentMonthly = (user as any).monthly_rate || 0;
      const currentHourly  = (user as any).hourly_rate  || 0;
      const history: any[] = rateRes.data ?? [];
      const changeInPeriod = history.find(r => r.effective_date >= periodStartStr && r.effective_date <= periodEndStr);
      const rateAtStart = [...history].filter(r => r.effective_date < periodStartStr).pop() || null;

      let estimated = 0;
      if (changeInPeriod) {
        const before = [...history].filter(r => r.effective_date < changeInPeriod.effective_date).pop();
        const oldMonthly = before?.monthly_rate ?? currentMonthly;
        const oldHourly  = before?.hourly_rate  ?? currentHourly;
        const newMonthly = changeInPeriod.monthly_rate || 0;
        const newHourly  = changeInPeriod.hourly_rate  || 0;
        if (isFixed) {
          let hrsAtOld = 0;
          let hrsAtNew = 0;
          for (const d of days as any[]) {
            if (d.date < changeInPeriod.effective_date) hrsAtOld += d.hours_capped || 0;
            else hrsAtNew += d.hours_capped || 0;
          }
          const base = computeSplitFixedAccrual({
            periodStart: periodStartStr,
            periodEnd: periodEndStr,
            changeDate: changeInPeriod.effective_date,
            workDays: (user as any)?.work_days || [],
            oldMonthlyRate: oldMonthly,
            newMonthlyRate: newMonthly,
            oldCappedHours: hrsAtOld,
            newCappedHours: hrsAtNew,
          }).accruedPay;
          const oldOT = oldHourly || oldMonthly / 176;
          const newOT = newHourly || newMonthly / 176;
          let otAtOld = 0;
          let otAtNew = 0;
          for (const d of days as any[]) {
            if (d.date < changeInPeriod.effective_date) otAtOld += d.overtime_hours || 0;
            else otAtNew += d.overtime_hours || 0;
          }
          estimated = base + otAtOld * oldOT + otAtNew * newOT;
        } else {
          estimated = totalHours * newHourly + totalOT * newHourly;
        }
      } else {
        const monthly = rateAtStart?.monthly_rate ?? currentMonthly;
        const hourly  = rateAtStart?.hourly_rate  ?? currentHourly;
        if (isFixed) {
          estimated = computeFixedAccrual({
            periodStart: periodStartStr,
            periodEnd: periodEndStr,
            monthlyRate: monthly,
            workDays: (user as any)?.work_days || [],
            cappedHours: totalHours,
          }).accruedPay + totalOT * (hourly || monthly / 176);
        } else {
          estimated = totalHours * hourly + totalOT * hourly;
        }
      }
      setEstimatedPayout(parseFloat(estimated.toFixed(2)));

      if (!slackResult.error && slackResult.data?.attendance) {
        const all: any[] = slackResult.data.attendance;
        const mine = all.find((r: any) => r.email === user.email || r.hub_user_id === user.id);
        setSlackStatus(mine?.status ?? 'absent');
        setMyWorkLocation(mine?.work_location ?? null);
        setTeamStatus(
          all
            .filter((r: any) => r.hub_user_id !== user.id && r.email !== user.email)
            .map((r: any) => ({
              full_name: r.full_name,
              avatar_url: r.avatar_url,
              status: r.status,
              work_location: r.work_location ?? null,
              hours_today: r.hours_today || 0,
            }))
        );
      } else {
        setSlackStatus('absent');
        setTeamStatus([]);
      }

      setAnnouncements((annResult.data as HubAnnouncement[]) ?? []);
      setRequests((reqResult.data as HubRequest[]) ?? []);
      setTimeOffs((toResult.data as HubTimeOff[]) ?? []);
      setPayoutStatus(payoutRes.data?.status ?? null);
    } catch (error) {
      console.error('Contractor dashboard load failed:', error);
      setActiveProjects([]);
      setAnnouncements([]);
      setRequests([]);
      setTimeOffs([]);
      setTeamStatus([]);
      setSlackStatus('absent');
      setPayoutStatus(null);
      setHoursThisCutoff(0);
      setEstimatedPayout(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user, isDemo]);

  const hour = now.getHours();
  const phTime = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true });
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const isNight = hour >= 20 || hour < 5;
  const isMorning = hour >= 5 && hour < 12;
  const isEvening = hour >= 17 && hour < 20;
  const currency = (user as any)?.currency || 'PHP';
  const isUSD = currency === 'USD';

  const statusColors: Record<string, string> = {
    open: 'bg-amber-100 text-amber-700', in_review: 'bg-sky-100 text-sky-700',
    resolved: 'bg-emerald-100 text-emerald-700', pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-700',
    forwarded: 'bg-purple-100 text-purple-700',
  };

  const onlineCount = teamStatus.filter(t => t.status === 'on').length;

  return (
    <ContractorLayout title="Dashboard">
      {loading ? (
        <div className="flex justify-center py-20"><i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i></div>
      ) : (
        <div className="space-y-4 w-full">

            {/* Payslip submission reminder */}
            {showPayslipBanner && (
              <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3">
                <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${daysUntilCutoff === 0 ? 'bg-rose-400' : 'bg-amber-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-700">
                    {daysUntilCutoff === 0 ? 'Payslip due today' : daysUntilCutoff === 1 ? 'Payslip due tomorrow' : `Payslip due in ${daysUntilCutoff} days`}
                  </p>
                  <p className="text-xs text-gray-400">
                    {daysUntilCutoff === 0
                      ? 'Confirm your hours are complete before submitting your payslip.'
                      : 'Review your hours and submit your payslip before the cutoff.'}
                  </p>
                </div>
                <button
                  onClick={() => navigate('/hub/employee/payouts')}
                  className="flex-shrink-0 text-xs font-medium text-[#1c2b3a] hover:text-[#0f1c28] transition-colors cursor-pointer"
                >
                  Submit →
                </button>
              </div>
            )}

            {/* Hero greeting — full width */}
            <div className="bg-[#111827] rounded-2xl p-5 text-white relative overflow-hidden">
              <style>{`
                @keyframes sun-pulse{0%,100%{box-shadow:0 0 24px 10px rgba(255,185,50,0.35)}50%{box-shadow:0 0 42px 20px rgba(255,185,50,0.6)}}
                @keyframes eve-pulse{0%,100%{box-shadow:0 0 24px 10px rgba(249,115,22,0.4)}50%{box-shadow:0 0 42px 20px rgba(249,115,22,0.65)}}
                @keyframes moon-pulse{0%,100%{box-shadow:0 0 18px 7px rgba(180,215,255,0.2)}50%{box-shadow:0 0 32px 14px rgba(180,215,255,0.42)}}
                @keyframes twinkle-a{0%,100%{opacity:.15}50%{opacity:.9}}
                @keyframes twinkle-b{0%,100%{opacity:.6}50%{opacity:.1}}
                @keyframes twinkle-c{0%,100%{opacity:.35}50%{opacity:.85}}
              `}</style>

              {/* Sky + celestial */}
              <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                <div className="absolute inset-0" style={{
                  background: isNight
                    ? 'radial-gradient(ellipse at 78% 18%, rgba(25,35,75,0.9) 0%, transparent 65%)'
                    : isEvening
                    ? 'radial-gradient(ellipse at 82% 28%, rgba(239,68,68,0.28) 0%, transparent 60%)'
                    : isMorning
                    ? 'radial-gradient(ellipse at 85% 20%, rgba(255,165,30,0.22) 0%, transparent 58%)'
                    : 'radial-gradient(ellipse at 85% 12%, rgba(255,210,50,0.18) 0%, transparent 56%)'
                }} />

                {isNight ? (
                  <>
                    {/* Moon */}
                    <div style={{
                      position:'absolute', right:'18%', top:'12%',
                      width:30, height:30, borderRadius:'50%',
                      background:'radial-gradient(circle at 38% 38%, #EEF4FF 0%, #C0D4F0 55%, #90B0D8 100%)',
                      animation:'moon-pulse 4s ease-in-out infinite',
                      overflow:'hidden'
                    }}>
                      <div style={{ position:'absolute', right:-5, top:-5, width:28, height:28, borderRadius:'50%', background:'#111827' }} />
                    </div>
                    {/* Stars */}
                    {([
                      [11,34,2,'twinkle-a',1.6,0],[18,52,1.5,'twinkle-b',2.3,0.3],[7,68,1,'twinkle-c',1.9,0.6],
                      [22,43,1.5,'twinkle-a',2.6,0.9],[14,24,1,'twinkle-b',1.3,1.2],[28,60,2,'twinkle-c',2.1,0.4],
                      [5,48,1,'twinkle-a',1.7,0.8],[20,30,1.5,'twinkle-b',2.4,1.5],[25,72,1,'twinkle-c',1.5,0.2],
                    ] as [number,number,number,string,number,number][]).map(([t,r,s,anim,dur,delay],i) => (
                      <div key={i} style={{
                        position:'absolute', top:`${t}%`, right:`${r}%`,
                        width:s, height:s, borderRadius:'50%', background:'white',
                        animation:`${anim} ${dur}s ease-in-out infinite`,
                        animationDelay:`${delay}s`
                      }} />
                    ))}
                  </>
                ) : (
                  /* Sun */
                  <div style={{
                    position:'absolute',
                    right:'7%',
                    top: isMorning ? '18%' : isEvening ? '30%' : '8%',
                    width:38, height:38, borderRadius:'50%',
                    background: isEvening
                      ? 'radial-gradient(circle, #fbbf24 0%, #f97316 50%, #ef4444 100%)'
                      : isMorning
                      ? 'radial-gradient(circle, #FFE566 0%, #FFBB30 55%, #FF9500 100%)'
                      : 'radial-gradient(circle, #FFF176 0%, #FFD740 55%, #FFA000 100%)',
                    animation: isEvening ? 'eve-pulse 3s ease-in-out infinite' : 'sun-pulse 3s ease-in-out infinite',
                    transition:'top 2s ease'
                  }} />
                )}
              </div>

              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-white/50 text-xs flex items-center gap-1.5">
                      {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      <span className="text-white/30">·</span>
                      <i className="ri-time-line text-white/40 text-xs"></i>
                      <span className="font-mono text-white/60">{phTime}</span>
                      <span className="text-white/30 text-[10px]">PH</span>
                    </p>
                    <h2 className="text-xl font-bold mt-0.5">{greeting}, {user?.full_name?.split(' ')[0]}.</h2>
                  </div>
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 ${
                    slackStatus === 'on' ? 'bg-emerald-500/20 text-emerald-300' :
                    slackStatus === 'off' ? 'bg-white/10 text-white/60' :
                    'bg-amber-500/20 text-amber-300'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      slackStatus === 'on' ? 'bg-emerald-400 animate-pulse' :
                      slackStatus === 'off' ? 'bg-white/40' : 'bg-amber-400'
                    }`} />
                    {slackStatus === 'on'
                      ? (myWorkLocation === 'on_site' ? 'On Site' : myWorkLocation === 'wfh' ? 'WFH' : 'In Office')
                      : slackStatus === 'off' ? 'Logged Off' : 'Not clocked in'}
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-white/50 text-xs">
                      Pay period · {currentPeriod.label}
                    </p>
                    <p className="text-white/50 text-xs">
                      {daysLeft === 0 ? `Payday: ${paydayLabel}` : `${daysLeft}d until ${paydayLabel}`}
                    </p>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-[#1c2b3a] rounded-full" style={{ width: `${(daysElapsed / periodTotal) * 100}%` }} />
                  </div>
                </div>
                <p className="text-white/30 text-xs mt-3 flex items-center gap-1">
                  <i className="ri-slack-line"></i>
                  Type <span className="font-mono bg-white/10 px-1 rounded mx-0.5">On</span>, <span className="font-mono bg-white/10 px-1 rounded mx-0.5">On/Site</span>, or <span className="font-mono bg-white/10 px-1 rounded mx-0.5">On/WFH</span> · <span className="font-mono bg-white/10 px-1 rounded mx-0.5">Off</span> in Slack
                </p>
              </div>
            </div>

          {/* ── TWO-COLUMN GRID ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── LEFT COLUMN (2/3) ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">Hours This Cutoff</span>
                  <div className="w-7 h-7 bg-sky-50 rounded-lg flex items-center justify-center">
                    <i className="ri-time-line text-sky-600 text-sm"></i>
                  </div>
                </div>
                <p className="text-2xl font-bold text-[#111827]">{hoursThisCutoff.toFixed(1)}<span className="text-base text-gray-400 font-normal">h</span></p>
                {!isFixed && (
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: `${hoursProgress}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{maxHours}h possible so far</p>
                  </div>
                )}
              </div>

              <div className="bg-[#1c2b3a] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/70">Est. Payout</span>
                  <button
                    onClick={() => setShowPayout(v => { const next = !v; localStorage.setItem('hub_showPayout', String(next)); return next; })}
                    className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors cursor-pointer"
                  >
                    <i className={`${showPayout ? 'ri-eye-line' : 'ri-eye-off-line'} text-white text-sm`}></i>
                  </button>
                </div>
                <p className="text-xl font-bold text-white tracking-wider">
                  {showPayout
                    ? `${isUSD ? '$' : '₱'}${estimatedPayout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '••••••'}
                </p>
                <p className="text-xs text-white/60 mt-1">{isFixed ? 'Fixed cutoff rate' : 'Based on hours logged'}</p>
              </div>
            </div>

            {/* Active Projects */}
            {activeProjects.length > 0 && (() => {
              const PALETTE = [
                { from: '#6366f1', to: '#8b5cf6', light: 'rgba(99,102,241,0.08)', bar: '#6366f1' },
                { from: '#0ea5e9', to: '#6366f1', light: 'rgba(14,165,233,0.08)', bar: '#0ea5e9' },
                { from: '#10b981', to: '#0ea5e9', light: 'rgba(16,185,129,0.08)', bar: '#10b981' },
                { from: '#f59e0b', to: '#ef4444', light: 'rgba(245,158,11,0.08)', bar: '#f59e0b' },
                { from: '#ec4899', to: '#8b5cf6', light: 'rgba(236,72,153,0.08)', bar: '#ec4899' },
                { from: '#14b8a6', to: '#6366f1', light: 'rgba(20,184,166,0.08)', bar: '#14b8a6' },
              ];
              return (
                <div className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-[#111827]">Active Projects</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeProjects.map((p, idx) => {
                      const pal = PALETTE[idx % PALETTE.length];
                      const pct = p.tasksTotal > 0 ? Math.round((p.tasksDone / p.tasksTotal) * 100) : 0;
                      const daysLeft = p.deadline ? Math.ceil((new Date(p.deadline + 'T00:00:00').getTime() - new Date().getTime()) / 86400000) : null;
                      const isOverdue = daysLeft !== null && daysLeft < 0;
                      const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
                      return (
                        <button key={p.id} onClick={() => navigate('/hub/employee/projects')}
                          className="text-left rounded-2xl p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer space-y-3 overflow-hidden"
                          style={{ background: `linear-gradient(135deg, ${pal.light} 0%, rgba(255,255,255,0.9) 100%)`, border: `1px solid rgba(255,255,255,0.8)`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              {p.service && (
                                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: pal.from }}>{p.service}</p>
                              )}
                              <p className="font-bold text-gray-900 text-sm leading-snug truncate">{p.project_name}</p>
                              <p className="text-xs text-gray-400 truncate mt-0.5">{p.client_name}</p>
                            </div>
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${pal.from}, ${pal.to})` }}>
                              <i className="ri-folder-line text-white text-sm"></i>
                            </div>
                          </div>
                          {p.tasksTotal > 0 ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-gray-500">{p.tasksDone}/{p.tasksTotal} tasks</span>
                                <span className="font-bold" style={{ color: pct === 100 ? '#10b981' : pal.from }}>{pct}%</span>
                              </div>
                              <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#10b981' : `linear-gradient(90deg, ${pal.from}, ${pal.to})` }} />
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-gray-400 italic">No tasks yet</p>
                          )}
                          {daysLeft !== null && (
                            <p className={`text-[11px] font-semibold ${isOverdue ? 'text-rose-500' : isDueSoon ? 'text-amber-600' : 'text-gray-400'}`}>
                              {isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
                              {p.deadline && !isOverdue && ` · ${new Date(p.deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Announcements */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-[#111827]">Announcements</h3>
              {announcements.length > 0 ? announcements.map((a) => (
                <AnnouncementCard
                  key={a.id}
                  a={a}
                  currentUserId={user!.id}
                  canDelete={user?.role === 'admin' || user?.role === 'owner'}
                  onDeleted={(id) => setAnnouncements(prev => prev.filter(x => x.id !== id))}
                />
              )) : (
                <div className="bg-white border border-gray-100 rounded-xl p-5 text-center">
                  <i className="ri-megaphone-line text-2xl text-gray-200 mb-2 block"></i>
                  <p className="text-sm text-gray-400">No announcements yet</p>
                </div>
              )}
            </div>

            {/* Requests + Time-off */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#111827]">My Requests</h3>
                  <button onClick={() => navigate('/hub/employee/requests')} className="text-xs text-[#1c2b3a] hover:underline cursor-pointer">View all</button>
                </div>
                {requests.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">No requests yet</p>
                ) : (
                  <div className="space-y-2">
                    {requests.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2">
                        <p className="text-sm text-gray-700 truncate flex-1">{r.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium capitalize ${statusColors[r.status] || 'bg-gray-100 text-gray-600'}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#111827]">Time-Off</h3>
                  <button onClick={() => navigate('/hub/employee/timeoff')} className="text-xs text-[#1c2b3a] hover:underline cursor-pointer">Request</button>
                </div>
                {timeOffs.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">No time-off requests</p>
                ) : (
                  <div className="space-y-2">
                    {timeOffs.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2">
                        <p className="text-sm text-gray-700 capitalize">{t.type} leave</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium capitalize ${statusColors[t.status] || 'bg-gray-100 text-gray-600'}`}>
                          {t.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick links */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Attendance', icon: 'ri-time-line', path: '/hub/employee/attendance' },
                { label: 'Payslips', icon: 'ri-file-list-3-line', path: '/hub/employee/payouts' },
                { label: 'SOPs', icon: 'ri-book-open-line', path: '/hub/employee/sop' },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => navigate(a.path)}
                  className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-100 hover:border-[#1c2b3a]/30 hover:bg-[#1c2b3a]/5 rounded-xl transition-all cursor-pointer"
                >
                  <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center">
                    <i className={`${a.icon} text-[#1c2b3a] text-base`}></i>
                  </div>
                  <span className="text-xs text-gray-600 font-medium">{a.label}</span>
                </button>
              ))}
            </div>
          </div>{/* end left col */}

          {/* ── RIGHT COLUMN (1/3) ── */}
          <div className="space-y-4">

            {/* Team Status */}
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-emerald-50 rounded-md flex items-center justify-center flex-shrink-0">
                    <i className="ri-team-line text-emerald-600 text-xs"></i>
                  </div>
                  <h3 className="text-sm font-semibold text-[#111827]">Team</h3>
                </div>
                {onlineCount > 0 && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    {onlineCount} working
                  </span>
                )}
              </div>
              <div className="space-y-2.5">
                {teamStatus.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2 text-center">No team data</p>
                ) : teamStatus.map((t) => (
                  <div key={t.full_name} className="flex items-center gap-2.5">
                    <div className="relative flex-shrink-0">
                      <HubAvatar fullName={t.full_name} avatarUrl={t.avatar_url} size="w-7 h-7" />
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                        t.status === 'on' ? 'bg-emerald-500' : t.status === 'off' ? 'bg-gray-400' : 'bg-amber-400'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{t.full_name.split(' ')[0]}</p>
                    </div>
                    <span className={`text-xs flex-shrink-0 ${
                      t.status === 'on' ? 'text-emerald-600 font-medium' :
                      t.status === 'off' ? 'text-gray-400' : 'text-amber-500'
                    }`}>
                      {t.status === 'on'
                        ? (t.hours_today > 0 ? t.hours_today.toFixed(1) + 'h' : (t.work_location === 'on_site' ? 'On Site' : t.work_location === 'wfh' ? 'WFH' : 'In Office'))
                        : t.status === 'off' ? 'Off' : 'Away'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
          </div>
        </div>
      )}
    </ContractorLayout>
  );
}
