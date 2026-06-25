import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Notif {
  id: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  body: string;
  link?: string;
  time: Date;
  unreadDot?: boolean;
}

function timeAgo(d: Date) {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationBell() {
  const { hubUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const lsKey = `hub_notif_seen_${hubUser?.id}`;
  const clearKey = `hub_notif_cleared_${hubUser?.id}`;
  const getLastSeen = (): Date => {
    const s = localStorage.getItem(lsKey);
    return s ? new Date(s) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  };
  const getClearedAt = (): Date | null => {
    const s = localStorage.getItem(clearKey);
    return s ? new Date(s) : null;
  };

  const fetchNotifs = useCallback(async () => {
    if (!hubUser) return;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // last 7 days
    const lastSeen = getLastSeen();
    const clearedAt = getClearedAt();
    const items: Notif[] = [];

    const isAdmin = hubUser.role === 'admin' || hubUser.role === 'owner';

    if (isAdmin) {
      // New comments on announcements
      const { data: comments } = await supabase
        .from('hub_announcement_comments')
        .select('id, body, created_at, hub_users(full_name)')
        .gte('created_at', since)
        .neq('user_id', hubUser.id)
        .order('created_at', { ascending: false })
        .limit(10);

      for (const c of comments || []) {
        const poster = (c as any).hub_users?.full_name?.split(' ')[0] ?? 'Someone';
        items.push({
          id: `comment-${c.id}`,
          icon: 'ri-chat-3-line',
          iconBg: 'bg-sky-50',
          iconColor: 'text-sky-500',
          title: `${poster} commented on an announcement`,
          body: (c.body as string).slice(0, 80),
          time: new Date(c.created_at),
        });
      }

      // New time off requests
      const { data: toReqs } = await supabase
        .from('hub_time_off')
        .select('id, type, created_at, hub_users!contractor_id(full_name)')
        .gte('created_at', since)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

      for (const r of toReqs || []) {
        const name = (r as any).hub_users?.full_name?.split(' ')[0] ?? 'Someone';
        items.push({
          id: `timeoff-${r.id}`,
          icon: 'ri-calendar-event-line',
          iconBg: 'bg-purple-50',
          iconColor: 'text-purple-500',
          title: `${name} requested time off`,
          body: `Type: ${r.type}`,
          time: new Date(r.created_at),
        });
      }

      // New requests
      const { data: reqs } = await supabase
        .from('hub_requests')
        .select('id, title, created_at, hub_users!contractor_id(full_name)')
        .gte('created_at', since)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(5);

      for (const r of reqs || []) {
        const name = (r as any).hub_users?.full_name?.split(' ')[0] ?? 'Someone';
        items.push({
          id: `req-${r.id}`,
          icon: 'ri-file-text-line',
          iconBg: 'bg-amber-50',
          iconColor: 'text-amber-500',
          title: `${name} submitted a request`,
          body: r.title,
          time: new Date(r.created_at),
        });
      }

      // Pending credential access requests
      const { data: credReqs } = await supabase
        .from('hub_credential_requests')
        .select('id, created_at, hub_users!contractor_id(full_name), hub_credentials!credential_id(platform, client_name)')
        .gte('created_at', since)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

      for (const r of credReqs || []) {
        const name = (r as any).hub_users?.full_name?.split(' ')[0] ?? 'Someone';
        const platform = (r as any).hub_credentials?.platform ?? 'a credential';
        const client = (r as any).hub_credentials?.client_name ?? '';
        items.push({
          id: `credreq-${r.id}`,
          icon: 'ri-key-line',
          iconBg: 'bg-amber-50',
          iconColor: 'text-amber-500',
          title: `${name} requested credential access`,
          body: `${platform}${client ? ` — ${client}` : ''}`,
          time: new Date(r.created_at),
        });
      }

      // Open payslip disputes
      const { data: disputes } = await supabase
        .from('hub_payslip_disputes')
        .select('id, created_at, reason, hub_users!contractor_id(full_name)')
        .gte('created_at', since)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(5);

      for (const d of disputes || []) {
        const name = (d as any).hub_users?.full_name?.split(' ')[0] ?? 'Someone';
        items.push({
          id: `dispute-${d.id}`,
          icon: 'ri-flag-line',
          iconBg: 'bg-rose-50',
          iconColor: 'text-rose-500',
          title: `${name} flagged a payslip`,
          body: (d.reason as string).slice(0, 80),
          time: new Date(d.created_at),
        });
      }

      // Pending overtime requests
      const { data: otReqs } = await supabase
        .from('hub_overtime_requests')
        .select('id, created_at, date, hours, hub_users!contractor_id(full_name)')
        .gte('created_at', since)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

      for (const r of otReqs || []) {
        const name = (r as any).hub_users?.full_name?.split(' ')[0] ?? 'Someone';
        items.push({
          id: `ot-${r.id}`,
          icon: 'ri-timer-flash-line',
          iconBg: 'bg-purple-50',
          iconColor: 'text-purple-500',
          title: `${name} requested overtime`,
          body: `${r.hours}h on ${new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          time: new Date(r.created_at),
        });
      }

      // Fund transfer batches pending owner approval
      const { data: batches } = await supabase
        .from('hub_payroll_batches')
        .select('id, period_label, total_amount, created_at')
        .gte('created_at', since)
        .eq('status', 'pending_owner')
        .order('created_at', { ascending: false })
        .limit(3);

      for (const b of batches || []) {
        items.push({
          id: `batch-${b.id}`,
          icon: 'ri-send-plane-line',
          iconBg: 'bg-emerald-50',
          iconColor: 'text-emerald-500',
          title: 'Fund transfer awaiting your approval',
          body: `${b.period_label} · ₱${Number(b.total_amount).toLocaleString()}`,
          time: new Date(b.created_at),
        });
      }

      // Payslips submitted by contractors (pending HR approval)
      const { data: submitted } = await supabase
        .from('hub_payouts')
        .select('id, cutoff_start, submitted_at, hub_users(full_name)')
        .gte('submitted_at', since)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })
        .limit(5);

      for (const p of submitted || []) {
        const name = (p as any).hub_users?.full_name?.split(' ')[0] ?? 'Someone';
        items.push({
          id: `submitted-${p.id}`,
          icon: 'ri-file-text-line',
          iconBg: 'bg-amber-50',
          iconColor: 'text-amber-500',
          title: `${name} submitted their payslip`,
          body: `Period starting ${new Date(p.cutoff_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          time: new Date(p.submitted_at),
        });
      }

    } else {
      // Contractor notifications

      // New announcements
      const { data: anns } = await supabase
        .from('hub_announcements')
        .select('id, title, created_at')
        .gte('created_at', since)
        .eq('published', true)
        .order('created_at', { ascending: false })
        .limit(5);

      for (const a of anns || []) {
        items.push({
          id: `ann-${a.id}`,
          icon: 'ri-megaphone-line',
          iconBg: 'bg-slate-50',
          iconColor: 'text-[#1c2b3a]',
          title: 'New announcement',
          body: a.title,
          time: new Date(a.created_at!),
        });
      }

      // Payout status updates
      const { data: payouts } = await supabase
        .from('hub_payouts')
        .select('id, status, cutoff_start, approved_at, paid_at, final_payout')
        .eq('contractor_id', hubUser.id)
        .gte('approved_at', since)
        .in('status', ['hr_approved', 'paid'])
        .order('approved_at', { ascending: false })
        .limit(5);

      for (const p of payouts || []) {
        const isPaid = p.status === 'paid';
        items.push({
          id: `payout-${p.id}`,
          icon: isPaid ? 'ri-bank-card-line' : 'ri-checkbox-circle-line',
          iconBg: isPaid ? 'bg-emerald-50' : 'bg-sky-50',
          iconColor: isPaid ? 'text-emerald-500' : 'text-sky-500',
          title: isPaid ? 'Payment sent' : 'Payslip approved — payment incoming',
          body: `Period starting ${new Date(p.cutoff_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          time: new Date(isPaid ? p.paid_at : p.approved_at),
        });
      }

      // Owner-approved batch notifications (payment approved, transfer in progress)
      const { data: approvedBatches } = await supabase
        .from('hub_payroll_batches')
        .select('id, period_label, approved_at, total_amount')
        .gte('approved_at', since)
        .eq('status', 'owner_approved')
        .order('approved_at', { ascending: false })
        .limit(5);

      if (approvedBatches?.length) {
        const batchIds = approvedBatches.map((b: any) => b.id);
        const { data: myBatchPayouts } = await supabase
          .from('hub_payouts')
          .select('id, batch_id, cutoff_start, final_payout')
          .eq('contractor_id', hubUser.id)
          .in('batch_id', batchIds)
          .neq('status', 'paid');

        for (const p of myBatchPayouts || []) {
          const batch = approvedBatches.find((b: any) => b.id === p.batch_id);
          if (!batch) continue;
          const pay = p.final_payout ? `· ₱${Number(p.final_payout).toLocaleString()}` : '';
          items.push({
            id: `batchapproved-${p.id}`,
            icon: 'ri-money-dollar-circle-line',
            iconBg: 'bg-emerald-50',
            iconColor: 'text-emerald-500',
            title: 'Payment approved — transfer in progress',
            body: `${batch.period_label} ${pay}`,
            time: new Date(batch.approved_at),
          });
        }
      }

      // Time off decisions
      const { data: toDecisions } = await supabase
        .from('hub_time_off')
        .select('id, type, status, updated_at')
        .eq('contractor_id', hubUser.id)
        .gte('updated_at', since)
        .in('status', ['approved', 'rejected'])
        .order('updated_at', { ascending: false })
        .limit(5);

      for (const t of toDecisions || []) {
        items.push({
          id: `to-${t.id}`,
          icon: t.status === 'approved' ? 'ri-checkbox-circle-line' : 'ri-close-circle-line',
          iconBg: t.status === 'approved' ? 'bg-emerald-50' : 'bg-rose-50',
          iconColor: t.status === 'approved' ? 'text-emerald-500' : 'text-rose-500',
          title: `Time off ${t.status}`,
          body: `Your ${t.type} leave request was ${t.status}`,
          time: new Date(t.updated_at),
        });
      }

      // Request updates
      const { data: reqUpdates } = await supabase
        .from('hub_requests')
        .select('id, title, status, updated_at')
        .eq('contractor_id', hubUser.id)
        .gte('updated_at', since)
        .in('status', ['resolved', 'in_review'])
        .order('updated_at', { ascending: false })
        .limit(5);

      for (const r of reqUpdates || []) {
        items.push({
          id: `requpd-${r.id}`,
          icon: 'ri-file-text-line',
          iconBg: 'bg-sky-50',
          iconColor: 'text-sky-500',
          title: `Request ${r.status === 'in_review' ? 'in review' : 'resolved'}`,
          body: r.title,
          time: new Date(r.updated_at),
        });
      }

      // OT request decisions
      const { data: otDecisions } = await supabase
        .from('hub_overtime_requests')
        .select('id, status, date, hours, updated_at')
        .eq('contractor_id', hubUser.id)
        .gte('updated_at', since)
        .in('status', ['approved', 'rejected'])
        .order('updated_at', { ascending: false })
        .limit(5);

      for (const r of otDecisions || []) {
        items.push({
          id: `otdec-${r.id}`,
          icon: r.status === 'approved' ? 'ri-timer-flash-line' : 'ri-close-circle-line',
          iconBg: r.status === 'approved' ? 'bg-emerald-50' : 'bg-rose-50',
          iconColor: r.status === 'approved' ? 'text-emerald-500' : 'text-rose-500',
          title: `Overtime request ${r.status}`,
          body: `${r.hours}h on ${new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          time: new Date(r.updated_at),
        });
      }

      // Comments on announcements you reacted to
      const { data: myReactions } = await supabase
        .from('hub_announcement_reactions')
        .select('announcement_id')
        .eq('user_id', hubUser.id);

      if (myReactions && myReactions.length > 0) {
        const annIds = myReactions.map((r: any) => r.announcement_id);
        const { data: newComments } = await supabase
          .from('hub_announcement_comments')
          .select('id, body, created_at, announcement_id, hub_users(full_name)')
          .gte('created_at', since)
          .in('announcement_id', annIds)
          .neq('user_id', hubUser.id)
          .order('created_at', { ascending: false })
          .limit(5);

        for (const c of newComments || []) {
          const name = (c as any).hub_users?.full_name?.split(' ')[0] ?? 'Someone';
          items.push({
            id: `cmt-${c.id}`,
            icon: 'ri-chat-3-line',
            iconBg: 'bg-sky-50',
            iconColor: 'text-sky-500',
            title: `${name} commented on an announcement`,
            body: (c.body as string).slice(0, 80),
            time: new Date(c.created_at),
          });
        }
      }

      // Pending contract signatures
      const { data: pendingDocs } = await supabase
        .from('hub_sign_assignments')
        .select('id, created_at, hub_sign_documents(title)')
        .eq('contractor_id', hubUser.id)
        .neq('status', 'signed')
        .order('created_at', { ascending: false })
        .limit(5);

      for (const a of pendingDocs || []) {
        const doc = (a as any).hub_sign_documents;
        items.push({
          id: `sign-${a.id}`,
          icon: 'ri-pen-nib-line',
          iconBg: 'bg-slate-50',
          iconColor: 'text-[#1c2b3a]/70',
          title: 'Document awaiting your signature',
          body: doc?.title ?? 'Contract',
          time: new Date(a.created_at),
        });
      }
    }

    // hub_notifications — only fetch unread so cleared ones never come back
    const { data: hubNotifs } = await supabase
      .from('hub_notifications')
      .select('id, type, title, body, link, read, created_at')
      .eq('user_id', hubUser.id)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(20);

    const typeIcon: Record<string, { icon: string; iconBg: string; iconColor: string }> = {
      task_assigned:         { icon: 'ri-task-line',              iconBg: 'bg-slate-50',  iconColor: 'text-[#1c2b3a]/70' },
      task_mention:          { icon: 'ri-at-line',                iconBg: 'bg-slate-50',  iconColor: 'text-[#1c2b3a]/70' },
      task_due:              { icon: 'ri-alarm-line',             iconBg: 'bg-amber-50',   iconColor: 'text-amber-500' },
      payroll_batch_approved:{ icon: 'ri-money-dollar-circle-line',iconBg: 'bg-emerald-50',iconColor: 'text-emerald-500' },
      timeoff_approved:      { icon: 'ri-checkbox-circle-line',   iconBg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
      timeoff_rejected:      { icon: 'ri-close-circle-line',      iconBg: 'bg-rose-50',    iconColor: 'text-rose-500' },
      payment_received:      { icon: 'ri-bank-card-line',         iconBg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
      project_assigned:      { icon: 'ri-folder-add-line',        iconBg: 'bg-sky-50',     iconColor: 'text-sky-500' },
      payroll_approved:      { icon: 'ri-money-dollar-circle-line',iconBg: 'bg-emerald-50',iconColor: 'text-emerald-500' },
      announcement:          { icon: 'ri-megaphone-line',          iconBg: 'bg-slate-50',  iconColor: 'text-[#1c2b3a]/70' },
      attendance:            { icon: 'ri-time-line',               iconBg: 'bg-sky-50',     iconColor: 'text-sky-600' },
      default:               { icon: 'ri-notification-3-line',    iconBg: 'bg-gray-50',    iconColor: 'text-gray-400' },
    };

    for (const n of hubNotifs ?? []) {
      const cfg = typeIcon[n.type] ?? typeIcon.default;
      items.push({
        id: `hub-${n.id}`,
        icon: cfg.icon,
        iconBg: cfg.iconBg,
        iconColor: cfg.iconColor,
        title: n.title,
        body: n.body,
        link: n.link ?? undefined,
        time: new Date(n.created_at),
        unreadDot: true, // only unread are fetched
      });
    }

    // Sort by newest
    items.sort((a, b) => b.time.getTime() - a.time.getTime());
    const visibleItems = clearedAt
      ? items.filter((n) => n.time > clearedAt)
      : items;
    setNotifs(visibleItems);
    setUnread(visibleItems.filter(n => n.time > lastSeen).length);
  }, [hubUser]);

  // Keep a stable ref to fetchNotifs so the realtime subscription never needs to recreate
  const fetchNotifsRef = useRef(fetchNotifs);
  useEffect(() => { fetchNotifsRef.current = fetchNotifs; }, [fetchNotifs]);

  useEffect(() => {
    if (!hubUser) return;
    fetchNotifs();
  }, [hubUser, fetchNotifs]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Realtime subscription — stable channel, never recreates unless user changes
  useEffect(() => {
    if (!hubUser) return;

    const isAdmin = hubUser.role === 'admin' || hubUser.role === 'owner';
    const adminTables = ['hub_announcement_comments', 'hub_time_off', 'hub_requests', 'hub_credential_requests', 'hub_payroll_batches', 'hub_payouts', 'hub_payslip_disputes', 'hub_overtime_requests', 'hub_notifications'];
    const contractorTables = ['hub_announcements', 'hub_payouts', 'hub_payroll_batches', 'hub_time_off', 'hub_requests', 'hub_overtime_requests', 'hub_notifications'];
    const tables = isAdmin ? adminTables : contractorTables;

    let debounce: ReturnType<typeof setTimeout>;
    const refetch = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => fetchNotifsRef.current(), 800);
    };

    const channel = supabase.channel(`hub-notifs-${hubUser.id}`);
    for (const table of tables) {
      channel.on('postgres_changes' as any, { event: '*', schema: 'public', table }, refetch);
    }
    channel.subscribe();

    return () => {
      clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [hubUser]); // stable — only recreates if user changes

  const handleOpen = () => {
    const opening = !open;
    setOpen(opening);
    if (opening) {
      localStorage.setItem(lsKey, new Date().toISOString());
      setUnread(0);
      // Mark all unread hub_notifications as read in DB when user opens the bell
      if (hubUser) {
        supabase.from('hub_notifications').update({ read: true })
          .eq('user_id', hubUser.id).eq('read', false).then(() => {});
      }
    }
  };

  const clearAll = async () => {
    const nowIso = new Date().toISOString();
    setNotifs([]);
    setUnread(0);
    localStorage.setItem(lsKey, nowIso);
    localStorage.setItem(clearKey, nowIso);
    if (hubUser) {
      await supabase
        .from('hub_notifications')
        .update({ read: true })
        .eq('user_id', hubUser.id)
        .eq('read', false);
    }
  };

  if (!hubUser) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
      >
        <i className="ri-notification-3-line text-base"></i>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#1c2b3a] rounded-full flex items-center justify-center">
            <span className="text-white text-[9px] font-bold">{unread > 9 ? '9+' : unread}</span>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-[#111827]">Notifications</h3>
            {notifs.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="py-10 text-center">
                <i className="ri-notification-off-line text-2xl text-gray-200 block mb-2"></i>
                <p className="text-sm text-gray-400">All caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {notifs.map((n) => {
                  const inner = (
                    <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors relative">
                      {n.unreadDot && <span className="absolute top-3.5 right-4 w-1.5 h-1.5 rounded-full bg-[#1c2b3a] flex-shrink-0" />}
                      <div className={`w-8 h-8 rounded-lg ${n.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <i className={`${n.icon} ${n.iconColor} text-sm`}></i>
                      </div>
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="text-xs font-medium text-[#111827] leading-snug">{n.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                        <p className="text-[10px] text-gray-300 mt-1">{timeAgo(n.time)}</p>
                      </div>
                    </div>
                  );
                  return n.link
                    ? <button key={n.id} onClick={() => { setOpen(false); navigate(n.link!); }} className="block w-full text-left cursor-pointer">{inner}</button>
                    : <div key={n.id}>{inner}</div>;
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
