import { supabase } from '@/lib/supabase';

export interface HubNotificationInput {
  user_id: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  read?: boolean;
}

export async function createHubNotifications(notifications: HubNotificationInput[]) {
  if (!notifications.length) return;

  const rows = notifications.map((notification) => ({
    ...notification,
    read: notification.read ?? false,
  }));

  const { error } = await supabase.from('hub_notifications').insert(rows);
  if (error) throw error;

  await Promise.allSettled(
    rows.map((notification) =>
      supabase.functions.invoke('send-push', {
        body: {
          user_id: notification.user_id,
          title: notification.title,
          body: notification.body,
          url: notification.link ?? undefined,
        },
      })
    )
  );
}
