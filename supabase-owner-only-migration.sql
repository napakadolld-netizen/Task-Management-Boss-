-- Apply only after the owner Google sign-in and authenticated workspace API are ready.
-- Browser clients become read-only. Owner writes use the verified server endpoint.
begin;
revoke insert,update,delete on public.tasks from public,anon,authenticated;
grant select on public.tasks to authenticated;
-- service_role retains the existing server-only grants; RLS stays enabled.
alter table public.tasks enable row level security;
commit;
