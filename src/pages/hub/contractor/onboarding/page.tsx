import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const STEPS = ['Welcome', 'Personal Info', 'Emergency Contact', 'Bank Details', 'Done'];

export default function ContractorOnboardingPage() {
  const { hubUser, refreshHubUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1: Personal info
  const [phone, setPhone] = useState(hubUser?.phone || '');
  const [birthday, setBirthday] = useState((hubUser as any)?.birthday || '');
  const [address, setAddress] = useState(hubUser?.address || '');

  // Step 2: Emergency contact
  const [emergencyName, setEmergencyName] = useState(hubUser?.emergency_contact_name || '');
  const [emergencyRel, setEmergencyRel] = useState(hubUser?.emergency_contact_relationship || '');
  const [emergencyPhone, setEmergencyPhone] = useState(hubUser?.emergency_contact_phone || '');

  // Step 3: Bank details
  const [bankName, setBankName] = useState((hubUser as any)?.bank_name || '');
  const [bankAccountName, setBankAccountName] = useState((hubUser as any)?.bank_account_name || '');
  const [bankAccountNumber, setBankAccountNumber] = useState((hubUser as any)?.bank_account_number || '');

  const saveStep = async () => {
    if (!hubUser) return;
    setSaving(true);

    if (step === 1) {
      await supabase.from('hub_users').update({ phone, birthday: birthday || null, address }).eq('id', hubUser.id);
    } else if (step === 2) {
      await supabase.from('hub_users').update({
        emergency_contact_name: emergencyName,
        emergency_contact_relationship: emergencyRel,
        emergency_contact_phone: emergencyPhone,
      }).eq('id', hubUser.id);
    } else if (step === 3) {
      await supabase.from('hub_users').update({
        bank_name: bankName,
        bank_account_name: bankAccountName,
        bank_account_number: bankAccountNumber,
      }).eq('id', hubUser.id);
    }

    setSaving(false);
    setStep(s => s + 1);
  };

  const finish = async () => {
    if (!hubUser) return;
    setSaving(true);
    await supabase.from('hub_users').update({ onboarding_completed: true }).eq('id', hubUser.id);
    await refreshHubUser();
    setSaving(false);
    navigate('/hub/contractor/dashboard', { replace: true });
  };

  const firstName = hubUser?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">

        {/* Logo */}
        <div className="flex items-center justify-center">
          <img src="/images/fc04818c74ad69bdfb22b93a6a0c6a72.png" alt="FS Architects" className="h-9 w-auto" />
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1.5">
          {STEPS.slice(0, -1).map((s, i) => (
            <div key={s} className="flex-1 flex items-center gap-1.5">
              <div className={`h-1.5 flex-1 rounded-full transition-all ${i <= step - 1 ? 'bg-[#FF6B35]' : i === step ? 'bg-[#FF6B35]/40' : 'bg-gray-200'}`} />
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="p-8 text-center space-y-5">
              <div className="w-16 h-16 bg-[#FF6B35]/10 rounded-2xl flex items-center justify-center mx-auto">
                <i className="ri-hand-heart-line text-3xl text-[#FF6B35]"></i>
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#111827]">Welcome to the FS Architects Hub, {firstName}!</h1>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                  Let's get your profile set up. This takes about 2 minutes. You can update any of these details later from your profile.
                </p>
              </div>
              <div className="space-y-2 text-left bg-gray-50 rounded-xl p-4">
                {['Personal info — phone, birthday, address', 'Emergency contact', 'Bank details for payroll'].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm text-gray-600">
                    <div className="w-5 h-5 rounded-full bg-[#FF6B35] flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-[10px] font-bold">{i + 1}</span>
                    </div>
                    {item}
                  </div>
                ))}
              </div>
              <button onClick={() => setStep(1)}
                className="w-full py-3 bg-[#FF6B35] text-white rounded-xl font-medium hover:bg-[#e55a27] transition-colors cursor-pointer">
                Let's go →
              </button>
            </div>
          )}

          {/* Step 1: Personal info */}
          {step === 1 && (
            <div>
              <div className="px-6 pt-6 pb-4 border-b border-gray-50">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Step 1 of 3</p>
                <h2 className="text-lg font-bold text-[#111827] mt-1">Personal Information</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Phone Number</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="+63 912 345 6789"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Birthday</label>
                  <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Home Address</label>
                  <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2}
                    placeholder="Street, City, Province"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] resize-none" />
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-2">
                <button onClick={() => setStep(s => s + 1)} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer px-3 py-2 whitespace-nowrap">
                  Skip for now
                </button>
                <button onClick={saveStep} disabled={saving}
                  className="flex-1 py-2.5 bg-[#111827] text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                  {saving ? 'Saving...' : 'Save & Continue'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Emergency contact */}
          {step === 2 && (
            <div>
              <div className="px-6 pt-6 pb-4 border-b border-gray-50">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Step 2 of 3</p>
                <h2 className="text-lg font-bold text-[#111827] mt-1">Emergency Contact</h2>
                <p className="text-xs text-gray-400 mt-1">Who should HR contact in case of emergency?</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Full Name</label>
                  <input type="text" value={emergencyName} onChange={e => setEmergencyName(e.target.value)}
                    placeholder="e.g. Maria Santos"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">Relationship</label>
                    <input type="text" value={emergencyRel} onChange={e => setEmergencyRel(e.target.value)}
                      placeholder="e.g. Mother"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">Phone Number</label>
                    <input type="tel" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)}
                      placeholder="+63 912 345 6789"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                  </div>
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-2">
                <button onClick={() => setStep(s => s + 1)} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer px-3 py-2 whitespace-nowrap">
                  Skip for now
                </button>
                <button onClick={saveStep} disabled={saving}
                  className="flex-1 py-2.5 bg-[#111827] text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                  {saving ? 'Saving...' : 'Save & Continue'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Bank details */}
          {step === 3 && (
            <div>
              <div className="px-6 pt-6 pb-4 border-b border-gray-50">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Step 3 of 3</p>
                <h2 className="text-lg font-bold text-[#111827] mt-1">Bank Details</h2>
                <p className="text-xs text-gray-400 mt-1">Used by HR to process your payroll payments.</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Bank Name</label>
                  <input type="text" value={bankName} onChange={e => setBankName(e.target.value)}
                    placeholder="e.g. BDO, BPI, GCash, Maya"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Account Name</label>
                  <input type="text" value={bankAccountName} onChange={e => setBankAccountName(e.target.value)}
                    placeholder="Name as it appears on the account"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Account Number / GCash Number</label>
                  <input type="text" value={bankAccountNumber} onChange={e => setBankAccountNumber(e.target.value)}
                    placeholder="e.g. 0917 123 4567"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <i className="ri-lock-line text-amber-500 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-amber-700">Your bank details are only visible to HR and the owner for payroll processing.</p>
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-2">
                <button onClick={() => setStep(s => s + 1)} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer px-3 py-2 whitespace-nowrap">
                  Skip for now
                </button>
                <button onClick={saveStep} disabled={saving}
                  className="flex-1 py-2.5 bg-[#111827] text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                  {saving ? 'Saving...' : 'Save & Continue'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 4 && (
            <div className="p-8 text-center space-y-5">
              <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
                <i className="ri-checkbox-circle-fill text-3xl text-emerald-500"></i>
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#111827]">You're all set, {firstName}!</h2>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                  Your profile is set up. You can update your details anytime from the My Profile page.
                </p>
              </div>
              <button onClick={finish} disabled={saving}
                className="w-full py-3 bg-[#FF6B35] text-white rounded-xl font-medium hover:bg-[#e55a27] transition-colors cursor-pointer disabled:opacity-40">
                {saving ? 'Loading...' : 'Go to My Dashboard →'}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          Private portal — FS Architects team only
        </p>
      </div>
    </div>
  );
}
