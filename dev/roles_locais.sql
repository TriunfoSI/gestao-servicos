-- Simula os papéis do Supabase num Postgres local (apenas para testes)
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'dev';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login createrole password 'dev';
create schema auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;
alter role supabase_auth_admin set search_path = auth;
