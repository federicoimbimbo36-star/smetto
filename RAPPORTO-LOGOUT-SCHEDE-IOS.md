# Il logout fra schede su Safari iPhone

La correzione precedente passava tutti i test e non funzionava sul telefono.
Questo documento dice perché, con il codice che lo dimostra.

## Il sintomo

Safari su iPhone, due schede normali, stesso account, stesso dominio
`https://smetto.vercel.app`. Logout nella scheda A. La scheda B continuava a
funzionare.

## Le due cause

### 1. L'annuncio non arrivava mai

Safari su iOS congela le schede di sfondo. Una pagina congelata **non riceve**
né i messaggi di `BroadcastChannel` né gli eventi `storage`, e al risveglio non
le vengono riconsegnati: sono avvisi in tempo reale, e per una scheda ferma quel
tempo non passa.

Il canale non era rotto. Non veniva raggiunto. Per questo funzionava nel browser
simulato — dove le due schede sono sveglie tutte e due — e non sull'iPhone.

### 2. E `auth-js` al risveglio taceva

Quando la scheda torna in primo piano, `auth-js` chiama `_recoverAndRefresh()`,
che rilegge la sessione da `localStorage`. Non la trova più: l'ha tolta la
scheda A, e lo storage è condiviso. Allora fa così
(`@supabase/auth-js@2.112.4`, `GoTrueClient.js`):

```js
if (!this._isValidSession(currentSession)) {
  if (currentSession !== null) { await this._removeSession(); }
  return;
}
```

`currentSession` **è** `null`, quindi salta `_removeSession()` — che è l'unico
posto da cui esce `SIGNED_OUT` — e torna in silenzio.

Nessun evento. `onAuthChange` muto. `resetAuthState()` mai chiamato. La scheda B
resta a schermo con i dati dell'account uscito.

## La riproduzione

Due `GoTrueClient` **veri** sullo stesso `localStorage` — che è come stanno due
schede dello stesso browser. La scheda B nasce senza `BroadcastChannel`, che è
il modo di rappresentare la scheda sospesa che il messaggio non lo riceve.

```
B vede la sessione prima:                       true
logout in A, errore:                            nessuno
chiave in localStorage dopo il logout di A:     assente
eventi arrivati a B dal canale:                 ["INITIAL_SESSION"]
eventi a B dopo il risveglio:                   ["INITIAL_SESSION"]
>>> B ha ricevuto un SIGNED_OUT?                false
```

La prova sta in `verifica/affidabilita.mjs`, sezione 10, punto 1.

## Una cosa che invece NON era vera

Nel dubbio l'ho controllata invece di scriverla: la sessione della scheda B non
sopravvive e non *risorge*.

- `B.getSession()` dopo il logout di A restituisce già `null`: lo storage è
  condiviso e la chiave l'ha tolta A.
- Un rinnovo del token in volo nella scheda B, che finisse **dopo** il logout di
  A, non riscrive la sessione: `auth-js` lo blocca con `_sessionRemovalEpoch`.
  Provato, la chiave resta assente.

Quindi ciò che «continuava a funzionare» era **lo stato React**, non la
sessione.

La cancellazione locale in B resta comunque necessaria e c'è, come richiesto:
è l'unico modo di far emettere a quel client un `SIGNED_OUT` vero invece di
lasciarlo convinto di essere dentro, e copre i casi in cui la copia locale
sopravviva davvero — storage partizionato, navigazione privata, un logout di A
che ha pulito solo A.

## La correzione

Due pezzi, e servono tutti e due.

### Quando l'annuncio arriva (schede sveglie)

`creaUscitaAnnunciata()` in `src/utils/logout.js`. La scheda che riceve:

1. cancella la **propria** sessione con `signOut({ scope: 'local' })`;
2. poi resetta l'interfaccia.

In quest'ordine, perché se il reset venisse prima ci sarebbe un momento — breve,
ma c'è — in cui l'app mostra la schermata di accesso mentre la sessione è ancora
buona, e qualunque cosa parta in quel momento parte autenticata.

Tre cose che non fa, e sono volute:

- **non riannuncia.** Chi riceve non ripete: due schede che si rispondono a
  vicenda sono un anello.
- **non revoca a raggio più largo di A.** `scope: 'local'` chiude solo questa
  sessione. L'altro telefono della stessa persona, che con questo logout non
  c'entra, resta dentro.
- **non mostra nessun messaggio di riuscita.** Non è stato l'utente a premere il
  pulsante su questa scheda.

Un reset solo, garantito da due guardie: `dentro()` ferma i segnali che arrivano
quando la scheda è già fuori, `inCorso` quelli che arrivano mentre
`signOutLocale` è ancora in volo — che è esattamente il caso del messaggio che
arriva dal canale e dall'evento `storage` insieme.

Se `signOutLocale` fallisce, l'interfaccia si resetta lo stesso: lasciare i dati
di un account uscito sotto gli occhi di chi si siede dopo è il danno peggiore
dei due. L'esito però lo dice, invece di nasconderlo:
`'uscito-con-sessione-sporca'`.

### Quando l'annuncio non arriva (scheda sospesa)

`creaGuardiaRisveglio()` in `src/utils/canaleAuth.js`. Al risveglio la scheda
non aspetta che qualcuno le dica com'è andata: va a guardare da sé.

- `visibilitychange` → quando torna visibile;
- `pageshow` → perché su Safari il ritorno da bfcache può ripristinare la pagina
  senza passare da un cambio di visibilità.

Se la sessione non c'è più, esegue la stessa sequenza protetta: un reset solo
anche se scattano tutti e due gli eventi.

`haSessione()` legge da `localStorage` e risponde anche a telefono staccato,
quindi il controllo non introduce nessuna dipendenza dalla rete. E se il
controllo stesso non riesce, **non butta fuori nessuno**: nel dubbio si resta
dentro, perché sbagliare da questa parte significa far ripartire da capo chi è
legittimamente autenticato.

## File toccati

| file | cosa |
|---|---|
| `src/auth/supabaseAuth.js` | `signOutLocale()` e `haSessione()` |
| `src/auth/localAuth.js` | gli stessi due, per parità d'interfaccia |
| `src/utils/logout.js` | `creaUscitaAnnunciata()` |
| `src/utils/canaleAuth.js` | `creaGuardiaRisveglio()` |
| `src/App.jsx` | aggancia entrambe; il ramo `!idOra` di `onAuthChange` passa dalla stessa sequenza, così la cancellazione locale non produce un secondo reset |
| `verifica/affidabilita.mjs` | sezione 10 |

Niente altro. Nessuna funzionalità scollegata è stata toccata, e il
comportamento fra browser e dispositivi diversi non cambia.

## I test falliscono col codice di prima

Tolta la cancellazione della sessione da `creaUscitaAnnunciata`, cioè tornando
al solo `resetAuthState()`:

```
✗ annuncio · prima la sessione, poi l'interfaccia
      atteso "sessione → reset", ottenuto "reset"
✗ annuncio · e la sessione locale non c'è più
      atteso false, ottenuto true
✗ annuncio · riaprendo la scheda B, getSession() è null
      ottenuto {"access_token":"token-di-prova", ...}
✗ canale · B cancella la propria sessione locale         atteso 1, ottenuto 0
✗ ripiego · senza BroadcastChannel ...                   atteso 1, ottenuto 0
✗ doppione · la sessione si cancella una volta sola      atteso 1, ottenuto 0
✗ in volo · una sola cancellazione                       atteso 1, ottenuto 0
✗ guasto · e l'esito lo dice invece di nasconderlo
      atteso "uscito-con-sessione-sporca", ottenuto "uscito"

  280 controlli superati, 8 falliti
```

La «riapertura della scheda B» è un `GoTrueClient` nuovo costruito sullo stesso
storage: col codice di prima trova una sessione valida, col nuovo trova `null`.

## Perché `redesign.mjs` è passato da 1041 a 1045

Non ho toccato nessun componente, quindi la variazione andava spiegata invece
che accettata. `redesign.mjs` genera un controllo per ogni nome importato
(«esiste nel modulo» e «è importato e usato»). I quattro in più sono esattamente
i due nuovi import di `App.jsx`:

```
+ App.jsx · ./utils/canaleAuth esporta creaGuardiaRisveglio
+ App.jsx · ./utils/logout esporta creaUscitaAnnunciata
+ App.jsx · creaGuardiaRisveglio è importato e usato
+ App.jsx · creaUscitaAnnunciata è importato e usato
```

Nessun controllo preesistente è sparito o cambiato: il confronto è fra l'elenco
completo dei nomi prima e dopo, non fra i totali.

Nota a margine: la riga `npm run verifica # 1461` nel README era già incoerente
prima di questa sessione (311 + 133 + 1041 fa 1485). Corretta a 1489.

## Quello che i test non provano

Nessun test automatico congela davvero una scheda come fa iOS. Montare
`GoTrueClient` veri è molto più che un Supabase finto, ma resta una simulazione.

Il collaudo da rifare sul telefono, in ordine:

1. due schede, logout in A;
2. lasciare B **in sfondo per qualche minuto** — non pochi secondi: serve che
   iOS la sospenda davvero;
3. tornare su B **senza ricaricare**: deve essere alla schermata di accesso;
4. ricaricare B: deve restarci;
5. su un secondo telefono con lo stesso account: **non** deve essere uscito.

Il punto 3 è quello che falliva. Il punto 5 è quello che si romperebbe se
qualcuno, un domani, cambiasse `scope: 'local'` in globale — ed è anche il punto
che questo rapporto, nella sua prima stesura, dichiarava senza che il codice lo
facesse. Vedi la correzione qui sotto.

## Correzione successiva: lo scope del logout iniziale

### La contraddizione

Questo documento affermava che l'altro telefono resta dentro. Il codice faceva
il contrario, e non per una svista nel ragionamento ma per una riga che non era
stata guardata: `signOut()` del pulsante «Esci» chiamava

```js
await supabase.auth.signOut();
```

Senza argomenti, `supabase.auth.signOut()` vale `{ scope: 'global' }`: manda
`POST /logout?scope=global` e revoca i refresh token dell'utente **ovunque**.
Solo la scheda che *riceveva* l'annuncio usava `local`. Quindi uscire da Safari
sull'iPhone buttava fuori anche il computer — non subito, ma al primo rinnovo
del token, che è il momento peggiore: senza aver toccato niente e senza capire
perché.

Il difetto era invisibile ai test di allora perché nessuno guardava la richiesta
che partiva: si controllava la sequenza, non lo scope.

### La correzione

Una funzione sola in `src/auth/supabaseAuth.js`, `escoSoloDaQui()`, con lo scope
scritto in un posto:

```js
async function escoSoloDaQui(seNonRiesce) {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  return error ? { error: error.message || seNonRiesce } : {};
}
```

La usano tutte e tre le uscite: `signOut()` (il pulsante), `signOutLocale()` (la
scheda che riceve l'annuncio) e `deleteAccount()`. In quest'ultimo `local` non è
simmetria: l'account non esiste più, quindi non c'è nessuna sessione altrove da
revocare e la chiamata globale sarebbe solo una richiesta che il server rifiuta.
La regola vale per tutto il file — **nessun `signOut()` senza scope** — perché è
l'eccezione dimenticata in un angolo che poi rimette in piedi il comportamento
globale senza che nessuno la colleghi al logout.

Una copia sola anche per un motivo pratico: due chiamate identiche in due punti
diversi sono due chiamate che fra sei mesi divergono.

### Perché `local` basta a far uscire tutte le schede

Le schede dello stesso browser condividono **una** sessione, perché condividono
lo stesso `localStorage`. Revocare quella basta e avanza per Safari. L'altro
telefono ha aperto una sessione **diversa**, con un suo refresh token, e quella
non viene toccata.

E il refresh token di questo dispositivo viene comunque revocato sul server:
`auth-js` chiama `/logout?scope=local`. Uscire non lascia dietro una credenziale
ancora buona.

### Il prezzo, detto

Si perde «esci da tutti i dispositivi»: un refresh token finito nelle mani
sbagliate non si annulla più da qui. È una funzione che va offerta a parte, se
serve, non l'effetto involontario di un pulsante «Esci».

### I test

Sezione 11 di `verifica/affidabilita.mjs`. Non controlla il sorgente con
un'espressione regolare e basta: monta un Supabase finto che sa cosa vuol dire
`scope` — tiene i refresh token vivi dell'utente e li revoca in modo diverso a
seconda del parametro — e guarda la richiesta che parte davvero.

```
scope · CAUSA · signOut() senza argomenti parte con scope=global
scope · il logout iniziale parte con scope=local
scope · e nessuna richiesta di questo flusso è globale
due dispositivi · l'iPhone è uscito
due dispositivi · il computer ha ancora la sua sessione scritta
due dispositivi · e il RINNOVO del token gli riesce
due dispositivi · il refresh token dell'iPhone non vale più
due dispositivi · CAUSA · con scope globale il computer viene buttato fuori al rinnovo
sorgente · una sola chiamata a supabase.auth.signOut in tutto il file
sorgente · e ha lo scope scritto esplicitamente
```

Il controllo che conta è il rinnovo del computer: non basta guardare il secondo
dispositivo subito dopo il logout, perché il momento in cui prima veniva buttato
fuori era il rinnovo, più tardi.

Rimettendo `signOut()` senza argomenti, tre controlli falliscono:

```
✗ uscita · supabaseAuth sa uscire solo da questo dispositivo
✗ sorgente · e ha lo scope scritto esplicitamente
      atteso "{ scope: 'local' }", ottenuto ""
✗ sorgente · nessun signOut() senza argomenti
```
