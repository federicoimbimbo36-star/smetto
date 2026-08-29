-- Astinenza dichiarata, visibile al gruppo.
--
-- La classifica ha una regola: un giorno conta solo se è stato DICHIARATO,
-- cioè se ci sono sigarette registrate o se è stato confermato «oggi zero».
-- Serve a evitare che sparire dall'app diventi la strategia vincente, visto
-- che chi non registra niente ha zero sigarette e finirebbe primo.
--
-- Quella regola però tagliava fuori proprio chi smette davvero: uno che ha
-- dichiarato di aver smesso e non riapre l'app per dieci giorni non ha
-- niente da dichiarare, eppure quei dieci giorni sono la cosa migliore che
-- gli sia successa. Con questa colonna il gruppo sa distinguere il silenzio
-- dall'astinenza dichiarata.
--
-- Colonna additiva e con default: le righe esistenti restano valide e i
-- client vecchi continuano a funzionare senza scriverla.

alter table public.group_members
  add column if not exists smesso_dal bigint;

comment on column public.group_members.smesso_dal is
  'Istante (ms epoch) in cui il membro ha dichiarato di aver smesso; null se è in fase di riduzione. Dopo questa data i giorni senza registrazioni contano come giorni dichiarati.';

-- Nessuna nuova policy: la colonna vive dentro group_members, che ha già
-- RLS attiva e le sue policy verificate. Chi può leggere la riga può
-- leggere anche questa colonna, chi può scrivere la propria riga può
-- scrivere anche questa.
