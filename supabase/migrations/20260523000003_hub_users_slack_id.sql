-- Add slack_id column to hub_users for direct Slack user ID storage
alter table hub_users add column if not exists slack_id text;

-- Seed known Slack IDs for active contractors
update hub_users set slack_id = 'U09NUQFTZL6' where email = 'angelalouiseando@gmail.com';
update hub_users set slack_id = 'U083FB0N0PL' where email = 'nellaskatleen@gmail.com';
update hub_users set slack_id = 'U091BL9PQ77' where email = 'duterteabigaile@gmail.com';
update hub_users set slack_id = 'U0ADHQPTR25' where email = 'claudettemaytahil@gmail.com';
update hub_users set slack_id = 'U08SRTTLLF9' where email = 'janreesepj@gmail.com';
update hub_users set slack_id = 'U0838LWSY4E' where email = 'ffroble@icloud.com';
