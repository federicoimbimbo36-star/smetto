-- ------------------------------------------------------------------
-- GRUPPI
-- Se chi ha creato il gruppo cancella l'account, il gruppo NON muore:
-- owner_id diventa null e la proprietà passa al membro più anziano.
-- ------------------------------------------------------------------
create table if not exists public.groups (
  code       text primary key,
  name       text not null,
  owner_id   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- MEMBRI: una riga per persona per gruppo.
-- È qui che sta la vera atomicità che mancava al vecchio KV: entrare,
-- uscire e pubblicare i propri numeri toccano solo la PROPRIA riga,
-- quindi due persone non possono più sovrascriversi a vicenda.
-- ------------------------------------------------------------------
create table if not exists public.group_members (
  code          text not null references public.groups (code) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  name          text not null default 'Tu',
  color         text not null default '#E24A17',
  joined_at     timestamptz not null default now(),
  days          jsonb not null default '{}'::jsonb,   -- { "2026-08-24": 7 }
  resists       jsonb not null default '{}'::jsonb,
  checkins      jsonb not null default '{}'::jsonb,
  total         integer not null default 0,
  last_event    bigint,                                -- epoch ms
  last_resist   bigint,
  last_attivita bigint,
  updated_at    timestamptz not null default now(),
  primary key (code, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id);

-- ------------------------------------------------------------------
-- KV PRIVATO: il registro personale e i "già visti", sincronizzati fra
-- telefono e browser. Nessuno può leggerlo tranne il proprietario.
-- ------------------------------------------------------------------
create table if not exists public.user_kv (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

drop trigger if exists group_members_touch on public.group_members;
create trigger group_members_touch before update on public.group_members
  for each row execute function public.tocca_updated_at();

drop trigger if exists user_kv_touch on public.user_kv;
create trigger user_kv_touch before update on public.user_kv
  for each row execute function public.tocca_updated_at();

-- Quando l'ultimo membro esce, il gruppo sparisce. Se esce il proprietario
-- ma restano altri, la proprietà passa a chi è entrato per primo.
create or replace function public.pulisci_gruppo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_rimasti integer;
  v_nuovo   uuid;
begin
  select count(*) into v_rimasti from public.group_members where code = old.code;
  if v_rimasti = 0 then
    delete from public.groups where code = old.code;
    return old;
  end if;
  select user_id into v_nuovo from public.group_members
    where code = old.code order by joined_at asc limit 1;
  update public.groups set owner_id = v_nuovo
    where code = old.code and (owner_id is null or owner_id = old.user_id);
  return old;
end;
$$;

drop trigger if exists group_members_cleanup on public.group_members;
create trigger group_members_cleanup after delete on public.group_members
  for each row execute function public.pulisci_gruppo();

-- ------------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------------
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.user_kv       enable row level security;

-- security definer: legge group_members scavalcando la sua stessa RLS,
-- altrimenti la policy si chiamerebbe da sola all'infinito.
create or replace function public.is_member(p_code text)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.group_members
    where code = p_code and user_id = (select auth.uid())
  );
$$;

drop policy if exists groups_select_member on public.groups;
create policy groups_select_member on public.groups
  for select to authenticated using (public.is_member(code));

drop policy if exists groups_update_owner on public.groups;
create policy groups_update_owner on public.groups
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists groups_delete_owner on public.groups;
create policy groups_delete_owner on public.groups
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Le schede degli altri si vedono solo se si è nello stesso gruppo.
drop policy if exists members_select_same_group on public.group_members;
create policy members_select_same_group on public.group_members
  for select to authenticated using (public.is_member(code));

-- Si scrive soltanto la propria riga: qui sta tutta la sicurezza dei numeri.
drop policy if exists members_insert_self on public.group_members;
create policy members_insert_self on public.group_members
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists members_update_self on public.group_members;
create policy members_update_self on public.group_members
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Ognuno può uscire da sé; il proprietario può rimuovere un membro.
drop policy if exists members_delete_self_or_owner on public.group_members;
create policy members_delete_self_or_owner on public.group_members
  for delete to authenticated using (
    user_id = (select auth.uid())
    or exists (select 1 from public.groups g where g.code = code and g.owner_id = (select auth.uid()))
  );

drop policy if exists kv_all_own on public.user_kv;
create policy kv_all_own on public.user_kv
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
