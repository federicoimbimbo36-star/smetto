-- Controllo di concorrenza sul registro personale.
--
-- IL PROBLEMA. `user_kv` tiene un unico oggetto JSON per chiave, riscritto
-- per intero a ogni modifica con un upsert. L'upsert è «l'ultimo che scrive
-- vince», e con un registro che contiene TUTTE le sigarette questo significa
-- che l'ultimo che scrive cancella il lavoro dell'altro:
--
--   telefono A legge 100 sigarette
--   telefono B legge 100 sigarette
--   A ne registra una  → scrive 101 (le sue)
--   B ne registra una  → scrive 101 (le sue), sopra quelle di A
--   risultato: 101, e una sigaretta registrata dall'utente è sparita.
--
-- Stessa identica cosa con due schede del browser, e fra la copia locale e
-- quella remota dopo un periodo offline.
--
-- LA CORREZIONE è in due pezzi, e questo è il secondo.
-- Il primo sta nel client (`src/utils/fusione.js`): due versioni del
-- registro non si scelgono più, si FONDONO — unione degli istanti, lapidi
-- per le cancellazioni, orologio per campo sui valori singoli.
-- Il secondo è questa colonna: senza di lei la fusione avrebbe comunque una
-- finestra scoperta, perché fra il momento in cui il client legge la
-- versione remota e quello in cui riscrive quella fusa può essersene
-- infilata un'altra.
--
-- COME FUNZIONA. Ogni scrittura dichiara la revisione da cui parte:
--
--   update user_kv set value = …, rev = rev + 1
--    where user_id = … and key = … and rev = <quella che credevo di avere>
--
-- Se nel frattempo qualcun altro ha scritto, la riga non viene aggiornata e
-- l'update torna zero righe. Il client se ne accorge, rilegge, rifonde e
-- riprova. Nessuna scrittura può più passare sopra a una che non ha visto.
--
-- Colonna additiva e con default, quindi le righe esistenti restano valide.
-- Nessuna nuova policy: `rev` vive dentro `user_kv`, che ha già RLS attiva e
-- la policy `kv_all_own` verificata. Chi può scrivere la propria riga può
-- scrivere anche questa colonna, e non può toccare quelle degli altri.

alter table public.user_kv
  add column if not exists rev bigint not null default 0;

comment on column public.user_kv.rev is
  'Contatore di revisione per il controllo di concorrenza ottimistico. Il client scrive con `where rev = <revisione letta>` e incrementa: se la riga non viene aggiornata significa che qualcun altro ha scritto nel frattempo, e il client rilegge, fonde e riprova. Impedisce che una scrittura cancelli una modifica che non ha mai visto.';

-- La revisione la muove SOLO il client, che è l'unico a sapere da quale
-- valore è partito: un trigger che la incrementasse da solo renderebbe la
-- condizione `rev = <attesa>` sempre vera nell'istante sbagliato e
-- toglierebbe ogni protezione. `updated_at` continua a essere aggiornato dal
-- suo trigger e resta buono per la diagnostica, non per decidere chi vince.
