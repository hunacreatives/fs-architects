import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { HubAsset, HubUser } from '@/lib/types';
import { useDemo } from '@/contexts/DemoContext';
import HubAvatar from '@/pages/hub/components/HubAvatar';

const platformIcons: Record<string, string> = {
  canva: 'ri-pencil-ruler-2-line',
  meta: 'ri-facebook-box-line',
  google_drive: 'ri-google-line',
  client_account: 'ri-building-line',
  email: 'ri-mail-line',
  slack: 'ri-slack-line',
  other: 'ri-key-line',
};
const platformColors: Record<string, string> = {
  canva: 'bg-purple-100 text-purple-700',
  meta: 'bg-sky-100 text-sky-700',
  google_drive: 'bg-amber-100 text-amber-700',
  client_account: 'bg-slate-100 text-[#1c2b3a]',
  email: 'bg-rose-100 text-rose-700',
  slack: 'bg-emerald-100 text-emerald-700',
  other: 'bg-gray-100 text-gray-600',
};
const accessColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  revoked: 'bg-rose-100 text-rose-700',
  pending: 'bg-amber-100 text-amber-700',
};

const emptyForm = { contractor_id: '', platform: 'canva', account_name: '', access_level: 'editor', status: 'active', notes: '' };

export default function AssetsPage() {
  const { isDemo } = useDemo();

  if (isDemo) return (
    <AdminLayout>
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <i className="ri-lock-2-line text-3xl opacity-40"></i>
        <p className="text-sm font-medium">Not available in demo</p>
        <p className="text-xs text-gray-300">This section requires a live account.</p>
      </div>
    </AdminLayout>
  );

  const [assets, setAssets] = useState<HubAsset[]>([]);
  const [contractors, setContractors] = useState<HubUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<HubAsset | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: a }, { data: u }] = await Promise.all([
      supabase.from('hub_assets').select('*, hub_users(full_name, avatar_url)').order('platform').order('account_name'),
      supabase.from('hub_users').select('id, full_name, avatar_url').eq('status', 'active').neq('is_developer', true).order('full_name'),
    ]);
    setAssets((a as HubAsset[]) ?? []);
    setContractors((u as HubUser[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const platforms = ['all', ...Array.from(new Set(assets.map((a) => a.platform)))];

  const filtered = assets.filter((a) => {
    const matchSearch = !search || a.account_name.toLowerCase().includes(search.toLowerCase()) || (a.hub_users as HubUser)?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchPlatform = platformFilter === 'all' || a.platform === platformFilter;
    return matchSearch && matchPlatform;
  });

  const openNew = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (a: HubAsset) => {
    setEditing(a);
    setForm({ contractor_id: String(a.contractor_id || ''), platform: a.platform, account_name: a.account_name, access_level: a.access_level || 'editor', status: a.status, notes: a.notes || '' });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.account_name.trim() || !form.contractor_id) return;
    setSaving(true);
    const payload = { ...form, contractor_id: Number(form.contractor_id) };
    if (editing) {
      await supabase.from('hub_assets').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
    } else {
      await supabase.from('hub_assets').insert({ ...payload });
    }
    setSaving(false);
    setShowModal(false);
    fetchData();
  };

  return (
    <AdminLayout title="Asset Access">
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg flex-wrap">
            {platforms.slice(0, 5).map((p) => (
              <button key={p} onClick={() => setPlatformFilter(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap capitalize ${platformFilter === p ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {p === 'all' ? 'All' : p.replace('_', ' ')}
              </button>
            ))}
          </div>
          <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-[#111827] text-white text-sm rounded-lg hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap">
            <i className="ri-add-line"></i> Add Access
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Platform</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Account</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Employee</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Access Level</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">No asset records found</td></tr>
                ) : filtered.map((a) => {
                  const user = a.hub_users as HubUser;
                  return (
                    <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${platformColors[a.platform] || 'bg-gray-100 text-gray-500'}`}>
                          <i className={`${platformIcons[a.platform] || 'ri-key-line'} text-sm`}></i>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium text-[#111827]">{a.account_name}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <HubAvatar fullName={user?.full_name ?? ''} avatarUrl={user?.avatar_url} size="w-6 h-6" />
                          <span className="text-sm text-gray-700">{user?.full_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 capitalize">{a.access_level}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${accessColors[a.status]}`}>{a.status}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <button onClick={() => openEdit(a)} className="text-xs text-gray-500 hover:text-[#1c2b3a] cursor-pointer font-medium transition-colors">Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827]">{editing ? 'Edit Asset Access' : 'Add Asset Access'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Employee *</label>
                <select value={form.contractor_id} onChange={(e) => setForm({ ...form, contractor_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                  <option value="">Select employee...</option>
                  {contractors.map((u) => <option key={u.id} value={String(u.id)}>{u.full_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Platform</label>
                  <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                    {['canva', 'meta', 'google_drive', 'client_account', 'email', 'slack', 'other'].map((p) => (
                      <option key={p} value={p}>{p.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Access Level</label>
                  <select value={form.access_level} onChange={(e) => setForm({ ...form, access_level: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                    {['viewer', 'editor', 'admin', 'owner'].map((l) => (
                      <option key={l} value={l} className="capitalize">{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Account Name *</label>
                <input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                  placeholder="e.g. Huna Creatives Canva Team" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="revoked">Revoked</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  placeholder="Any notes..." maxLength={500}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex gap-2 p-5 pt-0">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors whitespace-nowrap">Cancel</button>
              <button onClick={save} disabled={saving || !form.account_name.trim() || !form.contractor_id}
                className="flex-1 py-2.5 text-sm bg-[#111827] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Access'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}