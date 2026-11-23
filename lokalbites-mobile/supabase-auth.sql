begin;

create table if not exists public.lokalbites_credentials (
  email text primary key references public.users(email) on delete cascade,
  password_salt text not null check (password_salt ~ '^[0-9a-f]{32}$'),
  password_hash text not null check (password_hash ~ '^[0-9a-f]{128}$')
);

alter table public.lokalbites_credentials enable row level security;
revoke all on public.lokalbites_credentials from public, anon, authenticated;
grant select, insert on public.lokalbites_credentials to service_role;

create or replace function public.register_lokalbites_user(
  p_legacy_id uuid,
  p_name text,
  p_email text,
  p_password_salt text,
  p_password_hash text
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile public.users%rowtype;
begin
  profile.legacy_id := p_legacy_id;
  insert into public.users (legacy_id, name, email, role)
    values (profile.legacy_id, p_name, p_email, 'customer');

  insert into public.lokalbites_credentials (email, password_salt, password_hash)
    values (p_email, p_password_salt, p_password_hash);
end;
$$;

revoke all on function public.register_lokalbites_user(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_lokalbites_user(uuid, text, text, text, text)
  to service_role;

commit;
