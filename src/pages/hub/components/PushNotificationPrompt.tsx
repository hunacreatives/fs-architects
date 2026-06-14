import { useEffect, useMemo, useState } from 'react';

interface Props {
  supported: boolean;
  canPrompt: boolean;
  needsSettings: boolean;
  subscribing: boolean;
  error: string | null;
  onEnable: () => void | Promise<void>;
}

export default function PushNotificationPrompt({
  supported,
  canPrompt,
  needsSettings,
  subscribing,
  error,
  onEnable,
}: Props) {
  const storageKey = useMemo(() => {
    if (typeof window === 'undefined') return 'hub_push_prompt_dismissed';
    return `hub_push_prompt_dismissed:${window.location.pathname.startsWith('/hub/admin') ? 'admin' : 'contractor'}`;
  }, []);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(window.localStorage.getItem(storageKey) === '1');
  }, [storageKey]);

  if (!supported) return null;
  if (dismissed) return null;
  if (!canPrompt && !error) return null;
  const showAction = canPrompt || Boolean(error);

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, '1');
    }
  };

  return (
    <div className="mx-4 mt-4 md:mx-6">
      <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 to-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Phone notifications are not fully enabled</p>
            <p className="text-xs text-gray-600 mt-1">
              {canPrompt
                ? 'Tap enable once on this device so Hub can register push notifications for your phone.'
                : error
                ? 'Hub could not finish registering this device for push notifications. Retry below.'
                : 'Notifications were previously blocked on this device. Re-enable them in browser or app settings, then reopen Hub.'}
            </p>
            {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
          </div>
          <div className="flex items-center gap-2 md:flex-shrink-0">
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-white/70 hover:text-gray-700 cursor-pointer"
            >
              Dismiss
            </button>
            {showAction && (
              <button
                type="button"
                onClick={() => { void onEnable(); }}
                disabled={subscribing}
                className="inline-flex items-center justify-center rounded-xl bg-[#111827] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
              >
                {subscribing ? 'Enabling…' : error ? 'Retry notifications' : 'Enable notifications'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
