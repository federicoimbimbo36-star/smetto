# Migrazioni

Queste cinque migrazioni sono **esattamente** quelle già applicate al progetto
Supabase `mzsiqlhovliginqazwrx`, scaricate dal database e messe qui: fino a
prima vivevano solo sul progetto remoto, quindi lo schema non era ricostruibile
da nessuna parte. Se il progetto fosse sparito — cancellato per sbaglio, piano
free messo in pausa, account perso — non sarebbe rimasto niente da cui ripartire:
tabelle, policy RLS e funzioni erano tutte e sole lì.

| File | Cosa fa |
|---|---|
| `20260824124453_profiles_and_signup_trigger.sql` | tabella `profiles`, nickname unico, trigger che crea il profilo alla registrazione |
| `20260824124540_gruppi_membri_e_kv.sql` | `groups`, `group_members`, `user_kv` e tutte le policy RLS |
| `20260824124554_fix_policy_delete_membro_ambiguita.sql` | correzione di una policy che permetteva al proprietario di un gruppo di rimuovere membri di altri gruppi |
| `20260824124626_rpc_gruppi_e_account.sql` | `create_group`, `join_group`, `group_preview`, `delete_me` e i relativi grant |
| `20260824124658_blinda_funzioni_trigger.sql` | toglie dalle API REST le funzioni che servono solo ai trigger |

## Ricostruire il database da zero

```bash
npx supabase link --project-ref <nuovo-ref>
npx supabase db push
```

Poi, a mano nel pannello: **Authentication → Sign In / Providers → Email →
Confirm email = OFF** (qui si entra con numero e password, l'email è tecnica).

## Se cambi lo schema

Le modifiche fatte a mano dal pannello **non finiscono qui da sole**. Dopo
averle fatte:

```bash
npx supabase db pull      # riporta le differenze in una nuova migrazione
```

Meglio ancora: scrivere prima la migrazione e applicarla con `db push`, così il
repository resta la fonte della verità e non l'eco di quello che è successo
altrove.
