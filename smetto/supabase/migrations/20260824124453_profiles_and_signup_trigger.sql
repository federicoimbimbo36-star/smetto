-- ------------------------------------------------------------------
-- Profili utente: una riga per ogni account, popolata automaticamente
-- alla registrazione leggendo i metadati passati a signUp().
-- ------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Tu',
  nickname     text,
  email        text,
  phone        text,
  avatar_color text not null default '#E24A17',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Il nickname è il nome che si vede in classifica: deve essere unico,
-- senza distinzione fra maiuscole e minuscole. NULL o stringa vuota
-- significa "nessun nickname" e non partecipa all'unicità.
create unique index if not exists profiles_nickname_unique
  on public.profiles (lower(nickname))
  where nickname is not null and nickname <> '';

alter table public.profiles enable row level security;

-- Ognuno vede e modifica soltanto il proprio profilo. I nomi degli altri
-- membri del gruppo NON arrivano da qui, ma dalla riga in group_members
-- che ciascuno pubblica per sé.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

-- ------------------------------------------------------------------
-- updated_at automatico
-- ------------------------------------------------------------------
create or replace function public.tocca_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.tocca_updated_at();

-- ------------------------------------------------------------------
-- Alla signUp Supabase crea la riga in auth.users: questo trigger crea
-- il profilo corrispondente con i dati passati in options.data.
-- ------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, phone, avatar_color)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Tu'),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'avatar_color', ''), '#E24A17')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
