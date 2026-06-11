import { useEffect, useState } from 'react';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface ClientEntry {
  id: string;
  name: string;
  type: 'retainer' | 'assignment';
  status: string;
  // retainer fields
  service?: string | null;
  monthly_rate?: number | null;
  months_paid?: number;
  // assignment fields
  platform?: string | null;
  role?: string | null;
  notes?: string | null;
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  ongoing: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  ended: 'bg-gray-100 text-gray-500',
  completed: 'bg-gray-100 text-gray-500',
};

const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function ContractorClientsPage() {
  const { hubUser } = useAuth();
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hubUser) return;
    (async () => {
      const [{ data: pcData }, { data: assignData }] = await Promise.all([
        // Local retainer projects
        supabase
          .from('hub_project_contractors')
          .select('id, payout_type, fixed_amount, percentage, hub_project_contractor_payouts(amount), hub_projects(id, project_name, client_name, service, status, project_type, contract_price, monthly_rate)')
          .eq('contractor_id', hubUser.id),
        // International client assignments
        supabase
          .from('hub_client_assignments')
          .select('id, role, hub_clients(id, client_name, platform, status, notes)')
          .eq('contractor_id', hubUser.id),
      ]);

      const retainers: ClientEntry[] = (pcData ?? [])
        .filter((r: any) => {
          const p = Array.isArray(r.hub_projects) ? r.hub_projects[0] : r.hub_projects;
          return p?.project_type === 'retainer';
        })
        .map((r: any) => {
          const p = Array.isArray(r.hub_projects) ? r.hub_projects[0] : r.hub_projects;
          const payouts: any[] = r.hub_project_contractor_payouts ?? [];
          const totalPaid = payouts.reduce((s: number, x: any) => s + x.amount, 0);
          const monthlyRate = p?.monthly_rate ?? 0;
          const monthsPaid = monthlyRate > 0 ? Math.round(totalPaid / monthlyRate) : 0;
          return {
            id: `retainer-${r.id}`,
            name: p?.client_name ?? p?.project_name ?? 'Retainer Client',
            type: 'retainer' as const,
            status: p?.status ?? 'ongoing',
            service: p?.service,
            monthly_rate: monthlyRate,
            months_paid: monthsPaid,
          };
        });

      const assignments: ClientEntry[] = (assignData ?? [])
        .map((a: any) => {
          const c = Array.isArray(a.hub_clients) ? a.hub_clients[0] : a.hub_clients;
          return {
            id: `assign-${a.id}`,
            name: c?.client_name ?? 'Client',
            type: 'assignment' as const,
            status: c?.status ?? 'active',
            platform: c?.platform,
            role: a.role,
            notes: c?.notes,
          };
        });

      setClients([...retainers, ...assignments]);
      setLoading(false);
    })();
  }, [hubUser]);

  const active = clients.filter(c => ['active', 'ongoing'].includes(c.status));
  const inactive = clients.filter(c => !['active', 'ongoing'].includes(c.status));

  return (
    <ContractorLayout title="My Projects">
      <div className="max-w-2xl space-y-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i>
          </div>
        ) : clients.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <i className="ri-building-line text-gray-400 text-xl"></i>
            </div>
            <p className="text-sm font-medium text-gray-500">No clients assigned yet</p>
            <p className="text-xs text-gray-400 mt-1">Your admin will assign you to clients when needed.</p>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Active ({active.length})</p>
                {active.map(c => <ClientCard key={c.id} client={c} />)}
              </div>
            )}
            {inactive.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Inactive ({inactive.length})</p>
                {inactive.map(c => <ClientCard key={c.id} client={c} />)}
              </div>
            )}
          </>
        )}
      </div>
    </ContractorLayout>
  );
}

function ClientCard({ client: c }: { client: ClientEntry }) {
  const statusLabel = c.status === 'ongoing' ? 'Active' : c.status.charAt(0).toUpperCase() + c.status.slice(1);
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${c.type === 'retainer' ? 'bg-indigo-50' : 'bg-[#FF6B35]/10'}`}>
        <i className={`text-base ${c.type === 'retainer' ? 'ri-repeat-line text-indigo-500' : 'ri-building-line text-[#FF6B35]'}`}></i>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-[#111827] text-sm">{c.name}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[c.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {statusLabel}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.type === 'retainer' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'}`}>
            {c.type === 'retainer' ? 'Local Retainer' : 'International'}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {c.service && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <i className="ri-briefcase-line text-xs"></i>{c.service}
            </span>
          )}
          {c.role && (
            <span className="inline-flex items-center gap-1 text-xs text-[#FF6B35] font-medium">
              <i className="ri-user-line text-xs"></i>{c.role}
            </span>
          )}
          {c.platform && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
              <i className="ri-global-line text-xs"></i>{c.platform}
            </span>
          )}
          {c.type === 'retainer' && c.monthly_rate ? (
            <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium">
              <i className="ri-money-dollar-circle-line text-xs"></i>{fmt(c.monthly_rate)}/mo · {c.months_paid} month{c.months_paid !== 1 ? 's' : ''} paid
            </span>
          ) : null}
        </div>
        {c.notes && <p className="text-xs text-gray-400 mt-1.5 italic">{c.notes}</p>}
      </div>
    </div>
  );
}
