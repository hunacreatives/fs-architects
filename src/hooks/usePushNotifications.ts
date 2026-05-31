import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const VAPID_PUBLIC_KEY = 'BKL48eRRLCSCXdFN3_DieXUHlDIwpPbBhmgPF2t5zi0fFGrTboBYx9KG4WlcmaSjS0_x7BmCUTwXqZTleN3nt3c';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const { hubUser } = useAuth();
  const attempted = useRef(false);

  useEffect(() => {
    if (!hubUser || attempted.current) return;
    if (!VAPID_PUBLIC_KEY) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    attempted.current = true;

    (async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        const sub = existing ?? await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };

        await supabase.from('hub_push_subscriptions').upsert(
          { user_id: hubUser.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
          { onConflict: 'user_id,endpoint' },
        );
      } catch (err) {
        console.error('Push subscription failed:', err);
      }
    })();
  }, [hubUser]);
}
