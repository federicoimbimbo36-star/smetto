# Rilettura del 25 agosto 2026 — cosa era rotto e cosa è stato corretto

Rilettura completa del codice (App, schermate, componenti, auth, storage,
gruppi) e del backend Supabase vero, non solo di quello descritto nei
documenti. Il backend è risultato solido: RLS attiva su tutte e quattro le
tabelle, policy corrette, funzioni `SECURITY DEFINER` con `search_path`
bloccato e `revoke` sulle funzioni di trigger. Quello che segue riguarda
quasi tutto il client.

Verifica: `npm run verifica` (36 controlli, scritti per fallire con il codice
di prima) e build completa del bundle.

---

## Bug che l'utente vedeva

**Il prezzo del pacchetto non si poteva scrivere con i decimali.**
In Account il campo mostrava direttamente `profile.prezzoPacchetto` e a ogni
tasto riconvertiva il testo in numero. Appena si digitava la virgola di
«6,50», `Number("6,")` faceva 6, il campo si riscriveva da solo e la virgola
spariva: era impossibile inserire un prezzo con i centesimi. E siccome il
prezzo unitario è la base di *tutti* i conti dei risparmi, l'app mostrava
cifre sbagliate a chiunque avesse un pacchetto che non costa un numero tondo.
Ora il campo tiene una bozza di testo e converte quando si esce dal campo —
lo stesso schema che l'onboarding usava già correttamente.

**L'interruttore «Tappe del corpo» non spegneva le notifiche.**
Disattivarlo nascondeva il banner dentro l'app ma lasciava in coda tutte le
notifiche di sistema già programmate: continuavano ad arrivare per giorni.
E riattivarlo non le riprogrammava fino alla sigaretta successiva. Adesso
spegnere chiama `annullaTappe()`, riaccendere riprogramma dall'ultima
sigaretta, e all'avvio non si programma niente se l'interruttore è spento.

**Il piano settimanale era sfasato di una settimana.**
La prima riga conteneva l'obiettivo della settimana *in corso* — lo stesso
numero che il Recap mostra come «OBIETTIVO SETTIMANA n» — ma la etichettava
`S n+1` e le metteva accanto la data del lunedì dopo. Chi confrontava le due
schermate vedeva lo stesso valore attribuito a due settimane diverse. Ora la
prima riga del piano è la prima settimana che ha davvero un obiettivo: questa
se esiste una media della settimana scorsa, la prossima se siamo ancora nella
settimana di misura (che per definizione non ha limiti).

**I download di CSV e backup JSON potevano non partire.**
Il link non veniva attaccato al documento (Firefox ignora il click su un
elemento fuori dal DOM) e `URL.revokeObjectURL` veniva chiamato nello stesso
giro di eventi del click, cosa che può annullare il download appena avviato.

**Il calo in classifica era gonfiato.**
`days` contiene una chiave solo per i giorni con almeno una sigaretta.
Prendere «le prime 7 chiavi» e dividerle per 7 significava prendere i primi
7 giorni *fumati* — che possono coprire due o tre settimane di calendario —
e confrontarli con gli ultimi 7 giorni veri, zeri compresi. Il risultato
premiava proprio chi era partito piano. Ora i primi 7 giorni sono 7 giorni di
calendario dal primo registrato, e il calo si calcola solo dopo 14 giorni
veri, così le due finestre non si sovrappongono.

---

## Bug di date: l'ora legale

In Italia due giorni all'anno non durano 24 ore. Tutta l'app calcolava i
confini di giornata sottraendo `86.400.000` millisecondi alla volta, quindi
da quel giorno in poi i confini restavano spostati di un'ora.

Il caso peggiore era la classifica del gruppo. Il 30 marzo 2026 le chiavi
degli «ultimi 7 giorni», costruite con `ymd(sod(now) − i·DAY)`, davano:

```
30/03  28/03  27/03  26/03  25/03  24/03  23/03
```

Il 29 marzo **non c'è**, e al suo posto è entrato il 23. Un giorno intero
sparito dal totale settimanale del gruppo, e un giorno vecchio contato al suo
posto — senza nessun segnale che qualcosa fosse andato storto.

Tutta l'aritmetica sui giorni passa ora da `addGiorni(ts, n)`, che ragiona
per giorni di calendario: settimana corrente, ieri, media a 7 giorni, curva a
14 giorni, finestra a 30 giorni, medie per settimana e chiavi della
classifica.

---

## Avvio, rete e scritture

**L'app poteva restare bloccata su «Verifica sessione…».**
`installStorage.js` dichiarava «l'app si apre subito con i dati che ha», ma
la lettura aspettava comunque la risposta del database: con rete lenta o
assente si restava fermi fino al timeout interno di `fetch`, decine di
secondi. Ora l'attesa ha una scadenza di 3,5 secondi, dopo la quale si parte
con la copia locale; la risposta, se arriva dopo, aggiorna comunque la cache.
Stessa scadenza su scritture e cancellazioni: una scrittura appesa finiva in
un limbo — né completata né in coda — e si perdeva. Ora finisce in coda e
viene ritentata.

**Ogni tasto premuto nei campi del profilo scriveva sul database e
ripubblicava i conteggi al gruppo.** Il prezzo, il motivo e i se–allora sono
dati privati: il gruppo non li vede nemmeno. `salva()` accetta ora
`{ pubblica: false }` per tutto ciò che non riguarda il gruppo.

**In modalità locale la lista dei gruppi veniva cancellata.**
Senza Supabase configurato `groups.mine()` torna `[]` per forza, e `loadLog`
prendeva quel vuoto per buono sovrascrivendo la lista salvata sul
dispositivo. Ora si distingue «non fai parte di nessun gruppo» da «i gruppi
qui non esistono» (`groups.disponibile()`).

**I gruppi sciolti restavano appesi.** Se un gruppo spariva, il suo codice
restava nella lista locale e ogni pubblicazione successiva falliva in
silenzio fino al riavvio dell'app. Ora la sincronizzazione lo toglie.

---

## Robustezza e pulizia

- `Math.max(...array)` passa ogni elemento come argomento: su anni di storico
  si arriva al limite di argomenti del motore JS e parte un `RangeError`.
  Sostituito ovunque con `maxTs()`, che scorre e basta e su array vuoto torna
  `null` invece di `−Infinity`.
- Il numero di telefono in Account non è più modificabile: è la credenziale
  di accesso, e cambiarlo nel profilo *non* cambiava le credenziali. Si
  sarebbe continuato ad accedere col vecchio numero mentre l'app ne mostrava
  un altro.
- Il registro vuoto è ora una funzione (`vuotoLog()`) e non una costante
  condivisa fra tutti i suoi usi.
- Al logout vengono azzerati i campi password, il nickname in bozza e la
  mappa dei «già visti» del gruppo: su un telefono condiviso restavano lì.
- `contiBase` dipendeva dall'oggetto `s` intero, che è nuovo ogni 15 secondi:
  i `filter` costosi su tutto lo storico ripartivano a ogni tick. Ora dipende
  dal singolo numero che gli serve.
- Notifiche web: tolti i riferimenti a `/icon-192.png` e `/badge.png`, file
  che in `public/` non esistono.
- Tolti `groupKey` / `memberPrefix` / `memberKey` e `nuovoCodice()`: nomi di
  uno schema che non esiste più (i codici li genera il database, che è
  l'unico a poter garantire che non ne esca uno già in uso).
- Aggiunta la regola CSS mancante per `.craving-motivo`.

---

## Lo schema del database non era in nessun repository

Le cinque migrazioni esistevano **solo** sul progetto Supabase remoto.
`BACKEND.md` diceva come scaricarle, ma nessuno l'aveva fatto: se il progetto
fosse sparito — cancellato per sbaglio, piano free messo in pausa, account
perso — non sarebbe rimasto niente da cui ricostruire tabelle, policy RLS e
funzioni. Ora stanno in `supabase/migrations/`, identiche a quelle applicate.

---

## Cosa **non** è stato toccato

- Il backend: verificato, non modificato. Le segnalazioni del linter Supabase
  sulle funzioni `SECURITY DEFINER` richiamabili da utenti autenticati sono
  attese — `create_group`, `join_group`, `group_preview` e `delete_me` sono
  fatte apposta per essere chiamate dal client, e ognuna verifica
  `auth.uid()` al primo rigo.
- Il recupero password via SMS: resta non funzionante per il motivo già
  documentato (il numero non è legato ad `auth.users`), e l'app continua a
  dirlo invece di far aspettare un codice che non arriverebbe.

---

## Poi è arrivato l'audit matematico

Questa rilettura guardava il codice. Quella successiva ha guardato i **numeri**,
eseguendoli invece di leggerli: i `useMemo` di `App.jsx` replicati fuori da
React per confrontare quello che il codice produce con quello che sarebbe
corretto. Ne sono usciti cinque problemi critici che questa rilettura non aveva
visto, perché non erano bug di codice ma di modello — il ritmo di partenza che
si misurava da solo, le medie che cambiavano nel corso della giornata, due
formule diverse per le stesse «sigarette risparmiate».

Il registro completo sta in `AUDIT-MATEMATICO.md`.
