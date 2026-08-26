-- Le funzioni di trigger non devono essere richiamabili come endpoint REST:
-- servono solo al database. `nuovo_codice` idem.
revoke execute on function public.handle_new_user()   from public, anon, authenticated;
revoke execute on function public.pulisci_gruppo()    from public, anon, authenticated;
revoke execute on function public.tocca_updated_at()  from public, anon, authenticated;
revoke execute on function public.nuovo_codice()      from public, anon, authenticated;
