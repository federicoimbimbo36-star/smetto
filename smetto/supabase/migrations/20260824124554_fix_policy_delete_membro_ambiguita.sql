-- Nella versione precedente il riferimento `code` dentro la subquery si
-- risolveva su `g.code` invece che sulla riga di group_members: la
-- condizione diventava sempre vera e il proprietario di UN gruppo qualsiasi
-- avrebbe potuto rimuovere membri di ALTRI gruppi. Qui è qualificato.
drop policy if exists members_delete_self_or_owner on public.group_members;
create policy members_delete_self_or_owner on public.group_members
  for delete to authenticated using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.groups g
      where g.code = public.group_members.code
        and g.owner_id = (select auth.uid())
    )
  );
