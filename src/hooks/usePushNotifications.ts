import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const VAPID_PUBLIC_KEY = 'BDB1ZcysFiAgKiAQQrVFjpO_eJOD0t2KuqpRFZCWI6lGBe1Re5M1T18zByTyfGSDKG5Z768ul14fOOv3O5XtALM';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const { hubUser } = useAuth();
  const attempted = useRef(false);
  const [permission, setPermission] = useState<NotificationPermission>(() => (
    typeof Notification === 'undefined' ? 'default' : Notification.permission
  ));
  const [supported, setSupported] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveSubscription = useCallback(async () => {
    if (!hubUser) return false;
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new Error('Push subscription is missing encryption keys');
    }

    const { error: upsertError } = await supabase.from('hub_push_subscriptions').upsert(
      { user_id: hubUser.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'user_id,endpoint' },
    );

    if (upsertError) throw upsertError;
    return true;
  }, [hubUser]);

  const enableNotifications = useCallback(async () => {
    if (!hubUser || !supported || !VAPID_PUBLIC_KEY) return false;
    setSubscribing(true);
    setError(null);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== 'granted') return false;
      await saveSubscription();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Push subscription failed';
      setError(msg);
      console.error('Push subscription failed:', err);
      return false;
    } finally {
      setSubscribing(false);
    }
  }, [hubUser, saveSubscription, supported]);

  useEffect(() => {
    if (!hubUser) return;
    if (!VAPID_PUBLIC_KEY) {
      setError('Missing push public key');
      return;
    }
    const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
    setSupported(isSupported);
    if (!isSupported || attempted.current) return;
    attempted.current = true;

    (async () => {
      try {
        setPermission(Notification.permission);
        if (Notification.permission !== 'granted') return;
        await saveSubscription();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Push subscription failed';
        setError(msg);
        console.error('Push subscription failed:', err);
      }
    })();
  }, [hubUser, saveSubscription]);

  return {
    supported,
    permission,
    subscribing,
    error,
    canPrompt: supported && permission === 'default',
    needsSettings: supported && permission === 'denied',
    isEnabled: supported && permission === 'granted',
    enableNotifications,
  };
}
