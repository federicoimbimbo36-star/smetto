-- Stesso alfabeto di nuovoCodice() lato client: niente O/0/I/1 da confondere.
create or replace function public.nuovo_codice()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  res text := '';
  i   integer;
begin
  for i in 1..6 loop
    res := res || substr(alfabeto, 1 + floor(random() * length(alfabeto))::integer, 1);
  end loop;
  return res;
end;
$$;

-- Creare il gruppo ed entrarci sono una cosa sola: niente gruppo fantasma
-- senza membri se qualcosa va storto a metà strada.
create or replace function public.create_group(
  p_name text, p_member_name text default 'Tu', p_color text default '#E24A17'
) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare
  v_code  text;
  v_group public.groups;
  i       integer;
begin
  if (select auth.uid()) is null then raise exception 'non autenticato'; end if;

  for i in 1..10 loop
    v_code := public.nuovo_codice();
    begin
      insert into public.groups (code, name, owner_id)
      values (v_code, coalesce(nullif(btrim(p_name), ''), 'Gruppo'), (select auth.uid()))
      returning * into v_group;
      exit;
    exception when unique_violation then
      -- codice già preso: se ne prova un altro
    end;
  end loop;

  if v_group.code is null then
    raise exception 'non è stato possibile generare un codice libero';
  end if;

  insert into public.group_members (code, user_id, name, color)
  values (v_group.code, (select auth.uid()),
          coalesce(nullif(btrim(p_member_name), ''), 'Tu'),
          coalesce(nullif(p_color, ''), '#E24A17'));

  return v_group;
end;
$$;

-- Anteprima prima di entrare: si vede solo nome e quante persone ci sono,
-- mai i numeri di nessuno.
create or replace function public.group_preview(p_code text)
returns table (code text, name text, member_count integer)
language sql security definer stable set search_path = '' as $$
  select g.code, g.name,
         (select count(*)::integer from public.group_members m where m.code = g.code)
  from public.groups g
  where g.code = upper(btrim(p_code));
$$;

create or replace function public.join_group(
  p_code text, p_name text default 'Tu', p_color text default '#E24A17'
) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare
  v_group public.groups;
begin
  if (select auth.uid()) is null then raise exception 'non autenticato'; end if;

  select * into v_group from public.groups where code = upper(btrim(p_code));
  if v_group.code is null then return null; end if;

  insert into public.group_members (code, user_id, name, color)
  values (v_group.code, (select auth.uid()),
          coalesce(nullif(btrim(p_name), ''), 'Tu'),
          coalesce(nullif(p_color, ''), '#E24A17'))
  on conflict (code, user_id) do update
    set name = excluded.name, color = excluded.color;

  return v_group;
end;
$$;

-- Cancellare il proprio account: eliminare da auth.users richiede privilegi
-- che nel client non devono mai finire, quindi passa da qui.
create or replace function public.delete_me()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'non autenticato'; end if;
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke execute on function public.nuovo_codice()                     from public, anon;
revoke execute on function public.create_group(text, text, text)     from public, anon;
revoke execute on function public.join_group(text, text, text)       from public, anon;
revoke execute on function public.group_preview(text)                from public, anon;
revoke execute on function public.delete_me()                        from public, anon;
revoke execute on function public.is_member(text)                    from public, anon;

grant execute on function public.create_group(text, text, text)      to authenticated;
grant execute on function public.join_group(text, text, text)        to authenticated;
grant execute on function public.group_preview(text)                 to authenticated;
grant execute on function public.delete_me()                         to authenticated;
grant execute on function public.is_member(text)                     to authenticated;
