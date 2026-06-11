INSERT INTO hub_admin_invites (email, token, used)
VALUES ('duterteabigaile@gmail.com', 'huna-admin-abigail-2026', false)
ON CONFLICT (token) DO NOTHING;
