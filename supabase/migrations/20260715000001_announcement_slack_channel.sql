-- Announcements now target exactly one Slack channel, chosen in the modal.
-- Persisted so the scheduled-publish cron posts to the chosen channel instead
-- of the previous hardcoded both-channels behavior.
alter table hub_announcements
  add column if not exists slack_channel text not null default 'announcements';
