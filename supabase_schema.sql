-- Fix permissions for all roles (anon, authenticated, service_role)
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Disable RLS on all tables so anon client requests never get 'permission denied'
alter table if exists public_users disable row level security;
alter table if exists usernames_claim disable row level security;
alter table if exists friend_requests disable row level security;
alter table if exists rooms disable row level security;
alter table if exists messages disable row level security;
alter table if exists stories disable row level security;
alter table if exists calls disable row level security;
alter table if exists groups disable row level security;
alter table if exists group_messages disable row level security;
