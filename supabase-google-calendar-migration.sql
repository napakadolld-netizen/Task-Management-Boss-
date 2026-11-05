-- Apply once using Supabase SQL Editor. No existing tasks are changed.
begin;
create table if not exists public.dayflow_google_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 encrypted_tokens text, google_sub text, google_email text,
 calendar_id text, sync_token text, last_synced_at timestamptz,
 last_attempt_at timestamptz, last_error text,
 lock_token text, lock_until timestamptz
);
create table if not exists public.dayflow_google_oauth_states (
 state_hash text primary key, user_id uuid not null references auth.users(id) on delete cascade,
 verifier_encrypted text not null, expires_at timestamptz not null
);
create table if not exists public.dayflow_google_links (
 user_id uuid not null references public.dayflow_google_connections(user_id) on delete cascade,
 appointment_id text not null, google_event_id text not null,
 google_etag text, local_hash text, remote_hash text,
 conflict jsonb,
 primary key(user_id,appointment_id),unique(user_id,google_event_id)
);
alter table public.dayflow_google_connections enable row level security;
alter table public.dayflow_google_oauth_states enable row level security;
alter table public.dayflow_google_links enable row level security;
revoke all on public.dayflow_google_connections,public.dayflow_google_oauth_states,public.dayflow_google_links from public,anon,authenticated;
grant all on public.dayflow_google_connections,public.dayflow_google_oauth_states,public.dayflow_google_links to service_role;
create or replace function public.dayflow_gcal_lock(p_user uuid,p_token text) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 update dayflow_google_connections set lock_token=p_token,lock_until=now()+interval '3 minutes',last_attempt_at=now()
 where user_id=p_user and (lock_until is null or lock_until<now());
 return found;
end;$$;
create or replace function public.dayflow_gcal_unlock(p_user uuid,p_token text) returns void
language sql security definer set search_path=public as $$
 update dayflow_google_connections set lock_token=null,lock_until=null where user_id=p_user and lock_token=p_token;
$$;
create or replace function public.dayflow_gcal_replace(p_user uuid,p_id text,p_expected text,p_row jsonb) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if p_expected is null then
  insert into tasks(id,user_id,title,notes,requested_by,project,task_date,status,priority,completed)
  values(p_id,p_user,p_row->>'title',p_row->>'notes',p_row->>'requested_by',p_row->>'project',(p_row->>'task_date')::date,p_row->>'status',p_row->>'priority',null)
  on conflict(id) do nothing;
 else
  update tasks set title=p_row->>'title',notes=p_row->>'notes',project=p_row->>'project',task_date=(p_row->>'task_date')::date
  where id=p_id and user_id=p_user and notes=p_expected and requested_by='__dayflow_calendar_event_v1__';
 end if;
 return found;
end;$$;
revoke all on function public.dayflow_gcal_lock(uuid,text),public.dayflow_gcal_unlock(uuid,text),public.dayflow_gcal_replace(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.dayflow_gcal_lock(uuid,text),public.dayflow_gcal_unlock(uuid,text),public.dayflow_gcal_replace(uuid,text,text,jsonb) to service_role;
commit;
