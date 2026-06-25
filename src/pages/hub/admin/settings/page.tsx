import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import AvatarCropModal from '@/pages/hub/components/AvatarCropModal';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { supabase } from '@/lib/supabase';


export default function SettingsPage() {
  const { isDemo } = useDemo();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const { hubUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'system'>('profile');
  const [devToolbarHidden, setDevToolbarHidden] = useState(() => localStorage.getItem('hub_dev_toolbar_hidden') === 'true');

  // Sync from Supabase on mount
  useEffect(() => {
    if ((hubUser as any)?.is_developer && hubUser?.id) {
      supabase.from('hub_users').select('dev_toolbar_hidden').eq('id', hubUser.id).single()
        .then(({ data }) => {
          const v = !!(data as any)?.dev_toolbar_hidden;
          setDevToolbarHidden(v);
          localStorage.setItem('hub_dev_toolbar_hidden', String(v));
        });
    }
  }, [hubUser?.id]);
  const [profileForm, setProfileForm] = useState({ full_name: user?.full_name || '', email: user?.email || '', phone: user?.phone || '', slack_username: user?.slack_username || '' });
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const handlePhotoUpload = async (file: Blob) => {
    if (!user) return;
    setUploadingPhoto(true);
    try {
      const path = `${user.id}/avatar.jpg`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const bustUrl = `${publicUrl}?t=${Date.now()}`;
      const { error: dbErr } = await supabase.from('hub_users').update({ avatar_url: bustUrl, updated_at: new Date().toISOString() }).eq('id', user.id);
      if (dbErr) throw dbErr;
      showMessage('success', 'Photo updated!');
    } catch (e: any) {
      showMessage('error', e.message || 'Photo upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  };
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const saveProfile = async () => {
    if (!profileForm.full_name.trim()) return;
    setProfileSaving(true);
    if (user?.id) {
      const { error } = await supabase.from('hub_users').update({ full_name: profileForm.full_name, phone: profileForm.phone, slack_username: profileForm.slack_username, updated_at: new Date().toISOString() }).eq('id', user.id);
      if (error) showMessage('error', 'Failed to update profile.');
      else showMessage('success', 'Profile updated successfully!');
    }
    setProfileSaving(false);
  };

  const savePassword = async () => {
    if (!passwordForm.current) { showMessage('error', 'Enter your current password.'); return; }
    if (passwordForm.newPass !== passwordForm.confirm) { showMessage('error', 'Passwords do not match.'); return; }
    if (passwordForm.newPass.length < 8) { showMessage('error', 'Password must be at least 8 characters.'); return; }
    setPasswordSaving(true);
    try {
      // Re-authenticate with the current password so a lingering session can't
      // silently change credentials.
      const email = user?.email;
      if (!email) { showMessage('error', 'No email on file for this account.'); setPasswordSaving(false); return; }
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: passwordForm.current });
      if (reauthErr) { showMessage('error', 'Current password is incorrect.'); setPasswordSaving(false); return; }

      const timeout = new Promise<{ error: Error }>(resolve => setTimeout(() => resolve({ error: new Error('Request timed out. Please try again.') }), 10000));
      const result = await Promise.race([supabase.auth.updateUser({ password: passwordForm.newPass }), timeout]);
      if (result.error) showMessage('error', result.error.message);
      else { showMessage('success', 'Password updated!'); setPasswordForm({ current: '', newPass: '', confirm: '' }); }
    } catch (e: any) {
      showMessage('error', e?.message ?? 'Something went wrong.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: 'ri-user-line' },
    { id: 'password' as const, label: 'Password', icon: 'ri-lock-line' },
    { id: 'system' as const, label: 'System', icon: 'ri-settings-3-line' },
  ];

  if (isDemo) return (
    <AdminLayout>
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <i className="ri-lock-2-line text-3xl opacity-40"></i>
        <p className="text-sm font-medium">Not available in demo</p>
        <p className="text-xs text-gray-300">This section requires a live account.</p>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout title="Settings">
      <div className="max-w-2xl space-y-6">
        {message && (
          <div className={`px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            {message.text}
          </div>
        )}

        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${activeTab === t.id ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <i className={t.icon}></i> {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'profile' && (
          <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-5">
            <h3 className="font-semibold text-[#111827]">Profile Information</h3>
            <div className="flex items-center gap-4">
              <label className="relative cursor-pointer group">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover object-top" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-xl font-bold text-gray-400">{user?.full_name?.charAt(0)}</span>
                  </div>
                )}
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploadingPhoto ? <i className="ri-loader-4-line animate-spin text-white text-sm" /> : <i className="ri-camera-line text-white text-sm" />}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) setCropSrc(URL.createObjectURL(f));
                  e.target.value = '';
                }} disabled={uploadingPhoto} />
              </label>
              <div>
                <p className="text-sm font-medium text-[#111827]">{user?.full_name}</p>
                <p className="text-xs text-gray-400 capitalize">{user?.role} · {user?.department}</p>
                <p className="text-xs text-gray-400 mt-0.5">Click photo to change</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Full Name</label>
                <input value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Email</label>
                <input value={profileForm.email} disabled
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-400" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Phone</label>
                <input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder="+63 9XX XXX XXXX"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Slack Username</label>
                <input value={profileForm.slack_username} onChange={(e) => setProfileForm({ ...profileForm, slack_username: e.target.value })}
                  placeholder="@username"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
            </div>
            <button onClick={saveProfile} disabled={profileSaving}
              className="px-5 py-2.5 text-sm bg-[#111827] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
              {profileSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        )}

        {activeTab === 'password' && (
          <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-5">
            <h3 className="font-semibold text-[#111827]">Change Password</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Current Password</label>
                <input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                  placeholder="Enter your current password"
                  autoComplete="current-password"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">New Password</label>
                <input type="password" value={passwordForm.newPass} onChange={(e) => setPasswordForm({ ...passwordForm, newPass: e.target.value })}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Confirm New Password</label>
                <input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                  placeholder="Repeat new password"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
            </div>
            <button onClick={savePassword} disabled={passwordSaving || !passwordForm.current || !passwordForm.newPass || !passwordForm.confirm}
              className="px-5 py-2.5 text-sm bg-[#111827] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
              {passwordSaving ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-5">
              <h3 className="font-semibold text-[#111827]">System Info</h3>
              <div className="space-y-3">
                {[
                  { label: 'Platform', value: 'Sentro Hub' },
                  { label: 'Version', value: '1.0.0' },
                  { label: 'Agency', value: 'FS Architects' },
                  { label: 'Timezone', value: 'Asia/Manila (PHT)' },
                  { label: 'Cutoff Period', value: '1st–15th / 16th–EOM' },
                  { label: 'Default Currency', value: 'PHP' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-500">{item.label}</span>
                    <span className="text-sm font-medium text-[#111827]">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Developer tools — only visible to is_developer users */}
            {(hubUser as any)?.is_developer && (
              <div className="bg-[#111827] border border-white/10 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-gray-400 bg-white/10 px-2 py-0.5 rounded">DEV</span>
                  <h3 className="font-semibold text-white text-sm">Developer Tools</h3>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-white/10">
                  <div>
                    <p className="text-sm font-medium text-white">Role switcher toolbar</p>
                    <p className="text-xs text-gray-400 mt-0.5">The floating bar at the bottom that switches between Owner / Admin / Employee views</p>
                  </div>
                  <button
                    onClick={async () => {
                      const next = !devToolbarHidden;
                      setDevToolbarHidden(next);
                      localStorage.setItem('hub_dev_toolbar_hidden', String(next));
                      await supabase.from('hub_users').update({ dev_toolbar_hidden: next } as any).eq('id', hubUser!.id);
                    }}
                    className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${devToolbarHidden ? 'bg-gray-600' : 'bg-[#1c2b3a]'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${devToolbarHidden ? '' : 'translate-x-5'}`} />
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  {devToolbarHidden ? 'Toolbar hidden on all devices. Toggle on to show it again.' : 'Toolbar visible. Use the 👁 button on the toolbar itself to hide it from any device.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="max-w-2xl mt-6">
        <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">Sign out</p>
            <p className="text-xs text-gray-400 mt-0.5">You'll need to sign in again to access Sentro.</p>
          </div>
          <button
            onClick={async () => { await signOut(); navigate('/hub/login'); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-logout-box-r-line"></i> Sign out
          </button>
        </div>
      </div>

      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
          onCropped={(blob) => { URL.revokeObjectURL(cropSrc); setCropSrc(null); handlePhotoUpload(blob); }}
        />
      )}
    </AdminLayout>
  );
}