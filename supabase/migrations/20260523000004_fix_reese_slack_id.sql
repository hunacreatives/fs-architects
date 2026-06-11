-- Fix Reese's slack_id using her correct email
update hub_users set slack_id = 'U08SRTTLLF9' where email = 'janreesepj@gmail.com';
