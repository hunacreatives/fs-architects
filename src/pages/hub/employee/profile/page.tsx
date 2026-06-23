import { useState, useRef, FormEvent } from 'react';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import AvatarCropModal from '@/pages/hub/components/AvatarCropModal';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export default function ContractorProfilePage() {
  const { user, refreshHubUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'info' | 'password'>('info');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordForm, setPasswordForm] = useState({ newPass: '', confirm: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const u = user as any;

  const blankForm = () => ({
    full_name: u?.full_name || '',
    phone: u?.phone || '',
    address: u?.address || '',
    slack_username: u?.slack_username || '',
    emergency_contact_name: u?.emergency_contact_name || '',
    emergency_contact_relationship: u?.emergency_contact_relationship || '',
    emergency_contact_phone: u?.emergency_contact_phone || '',
  });

  const [form, setForm] = useState(blankForm);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const startEdit = () => { setForm(blankForm()); setEditing(true); };

  const saveInfo = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('hub_users').update({
      full_name: form.full_name,
      phone: form.phone || null,
      address: form.address || null,
      slack_username: form.slack_username || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_relationship: form.emergency_contact_relationship || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);
    setSaving(false);
    if (error) { showMessage('error', error.message); return; }
    await refreshHubUser();
    setEditing(false);
    showMessage('success', 'Profile updated!');
  };

  const handlePhotoUpload = async (file: Blob) => {
    if (!user) return;
    setUploadingPhoto(true);
    try {
      const path = `${user.id}/avatar.jpg`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const bustUrl = `${publicUrl}?t=${Date.now()}`;
      const { error: dbErr } = await supabase.from('hub_users')
        .update({ avatar_url: bustUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (dbErr) throw dbErr;
      await refreshHubUser();
      showMessage('success', 'Photo updated!');
    } catch (e: any) {
      showMessage('error', e.message || 'Photo upload failed');
    }
    setUploadingPhoto(false);
  };

  const savePassword = async () => {
    if (passwordForm.newPass !== passwordForm.confirm) { showMessage('error', 'Passwords do not match.'); return; }
    if (passwordForm.newPass.length < 8) { showMessage('error', 'Password must be at least 8 characters.'); return; }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPass });
    if (error) showMessage('error', error.message);
    else { showMessage('success', 'Password updated!'); setPasswordForm({ newPass: '', confirm: '' }); }
    setPasswordSaving(false);
  };

  if (!user) return null;

  const payType = u.payment_type || 'hourly';
  const rateLabel = payType === 'fixed'
    ? `PHP ${(u.monthly_rate || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}/month (fixed)`
    : u.hourly_rate ? `PHP ${u.hourly_rate}/hr` : '—';

  const ecName = u.emergency_contact_name;
  const ecRel = u.emergency_contact_relationship;
  const ecPhone = u.emergency_contact_phone;
  const ecDisplay = [ecName, ecRel, ecPhone].filter(Boolean).join(' · ') || '—';

  const inputCls = 'w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]';

  return (
    <ContractorLayout title="My Profile">
      <div className="max-w-2xl space-y-5">
        {message && (
          <div className={`px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            {message.text}
          </div>
        )}

        {/* Avatar card */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.full_name} className="w-20 h-20 rounded-2xl object-cover object-top" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-[#1c2b3a] flex items-center justify-center">
                  <span className="text-white text-2xl font-bold">{user.full_name.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-[#111827] text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-700 transition-colors"
              >
                {uploadingPhoto
                  ? <i className="ri-loader-4-line animate-spin text-xs"></i>
                  : <i className="ri-camera-line text-xs"></i>}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setCropSrc(URL.createObjectURL(f));
                  e.target.value = '';
                }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#111827]">{user.full_name}</h2>
              <p className="text-sm text-gray-500 capitalize">{user.role?.replace('_', ' ')} · {user.department || 'No department'}</p>
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-1 capitalize ${user.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{user.status}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {[{ id: 'info', label: 'Info', icon: 'ri-user-line' }, { id: 'password', label: 'Password', icon: 'ri-lock-line' }].map((t) => (
            <button key={t.id} onClick={() => { setActiveTab(t.id as any); setEditing(false); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${activeTab === t.id ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <i className={t.icon}></i> {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'info' && !editing && (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#111827]">Personal Information</h3>
                <p className="text-xs text-gray-400 mt-0.5">Contact HR to update department, rate, or start date.</p>
              </div>
              <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                <i className="ri-edit-line"></i> Edit
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                { label: 'Contractor ID', value: u.employee_id || '—' },
                { label: 'Full Name', value: user.full_name },
                { label: 'Email', value: user.email },
                { label: 'Phone', value: user.phone || '—' },
                { label: 'Address', value: user.address || '—' },
                { label: 'Emergency Contact', value: ecDisplay },
                { label: 'Slack Display Name', value: user.slack_username || '—' },
                { label: 'Department', value: user.department || '—' },
                { label: 'Birthday', value: u.birthday ? new Date(u.birthday).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
                { label: 'Start Date', value: user.start_date ? new Date(user.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
                { label: 'Rate', value: rateLabel },
                { label: 'Payment Method', value: user.payment_method || '—' },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between px-5 py-3.5 gap-4">
                  <span className="text-sm text-gray-500 flex-shrink-0">{row.label}</span>
                  <span className="text-sm font-medium text-[#111827] text-right">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'info' && editing && (
          <form onSubmit={saveInfo} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#111827]">Edit Details</h3>
              <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Cancel</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Full Name *</label>
                <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+63 9XX XXX XXXX" className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Address</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="City, Province" className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Slack Display Name</label>
                <input value={form.slack_username} onChange={(e) => setForm({ ...form, slack_username: e.target.value })} placeholder="Your name as it appears in Slack" className={inputCls} />
              </div>

              {/* Emergency Contact */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Emergency Contact</label>
                <input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} placeholder="Full name" className={inputCls} />
                <input value={form.emergency_contact_relationship} onChange={(e) => setForm({ ...form, emergency_contact_relationship: e.target.value })} placeholder="Relationship (e.g. Mother, Spouse)" className={inputCls} />
                <input value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} placeholder="Contact number" className={inputCls} />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditing(false)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 cursor-pointer whitespace-nowrap">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-60 cursor-pointer whitespace-nowrap">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        )}

        {activeTab === 'password' && (
          <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-5">
            <h3 className="font-semibold text-[#111827]">Change Password</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">New Password</label>
                <input type="password" value={passwordForm.newPass} onChange={(e) => setPasswordForm({ ...passwordForm, newPass: e.target.value })}
                  placeholder="At least 8 characters" className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Confirm New Password</label>
                <input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                  placeholder="Repeat new password" className={inputCls} />
              </div>
            </div>
            <button onClick={savePassword} disabled={passwordSaving || !passwordForm.newPass || !passwordForm.confirm}
              className="px-5 py-2.5 text-sm bg-[#111827] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
              {passwordSaving ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        )}
      </div>

      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
          onCropped={(blob) => { URL.revokeObjectURL(cropSrc); setCropSrc(null); handlePhotoUpload(blob); }}
        />
      )}
    </ContractorLayout>
  );
}
