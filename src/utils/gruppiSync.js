/* ------------------------------------------------------------------ */
/* gruppiSync.js — src/utils/gruppiSync.js                             */
/*                                                                     */
/* La coda di `sync()`: cosa resta, cosa si toglie, cosa si mostra.     */
/*                                                                     */
/* Stava dentro App.jsx e partiva dalla lista catturata all'AVVIO della */
/* sincronizzazione. Ma fra l'avvio e la fine ci sono varie richieste   */
/* di rete, e in mezzo l'utente può entrare in un gruppo nuovo: quando  */
/* l'esito arrivava, ricostruiva tutto dalla lista vecchia e il gruppo  */
/* appena aggiunto spariva — dalla lista salvata, dalla schermata, dai  */
/* membri in memoria e dal gruppo attivo. Quattro posti, un solo        */
/* errore: prendere per buono lo stato di prima.                        */
/*                                                                     */
/* Sta qui, ed è pura, per la stessa ragione di `costruisciLotto` e     */
/* `caricaSessione`: una gara che non si può eseguire non si può        */
/* dimostrare chiusa, e un banco che si riscrive la regola invece di    */
/* chiamarla verifica se stesso.                                        */
/*                                                                     */
/* La regola, in una riga: la sincronizzazione può TOGLIERE solo quello */
/* che ha verificato, e non può decidere niente su quello che non ha    */
/* nemmeno guardato.                                                    */
/* ------------------------------------------------------------------ */

/* I CODICI CHE RESTANO.

   Si parte dalla lista di ADESSO, non da quella di partenza, e si
   tolgono solo i morti che ci sono ancora: un gruppo sciolto da cui
   l'utente è già uscito per conto suo non va tolto due volte, e un
   gruppo entrato nel frattempo non è affare di questa sincronizzazione.

   `daTogliere` esce separato perché è quello che va segnato a `false`
   in `gruppiStato`: solo i gruppi che questa sincronizzazione ha
   davvero verificato come sciolti. */
export function codiciDopoSync(attuali, morti) {
  const adesso = Array.isArray(attuali) ? attuali : [];
  const sciolti = Array.isArray(morti) ? morti : [];
  const daTogliere = sciolti.filter((c) => adesso.includes(c));
  return {
    codici: adesso.filter((c) => !daTogliere.includes(c)),
    daTogliere,
  };
}

/* LE SCHEDE DEI GRUPPI a schermo.

   Per ogni codice rimasto si prende la scheda appena letta, se c'è;
   altrimenti quella che c'era già. Il secondo caso copre due situazioni
   diverse che qui si comportano allo stesso modo: il gruppo incerto —
   la rete non ha risposto, e la scheda di prima è meglio di niente — e
   il gruppo entrato durante la sincronizzazione, che questa
   sincronizzazione non ha mai interrogato.

   L'ordine è quello dei codici, che è l'ordine in cui l'utente è
   entrato nei gruppi: è quello che decide quale si apre per primo. */
export function gruppiDopoSync(prima, letti, codici) {
  const perCodice = new Map();
  (Array.isArray(prima) ? prima : []).forEach((g) => { if (g?.code) perCodice.set(g.code, g); });
  (Array.isArray(letti) ? letti : []).forEach((g) => { if (g?.code) perCodice.set(g.code, g); });
  return codici.map((c) => perCodice.get(c)).filter(Boolean);
}

/* LE CLASSIFICHE in memoria.

   Stessa regola: la lettura nuova se c'è, quella di prima se non c'è.
   Prima si partiva da `membriLetti` e si rimettevano dentro solo i
   codici «da tenere» calcolati sulla lista vecchia, quindi la classifica
   di un gruppo entrato nel frattempo veniva buttata via anche se era già
   stata caricata. */
export function membriDopoSync(prima, letti, codici) {
  const vecchi = prima && typeof prima === 'object' ? prima : {};
  const nuovi = letti && typeof letti === 'object' ? letti : {};
  const out = {};
  codici.forEach((c) => {
    if (nuovi[c]) out[c] = nuovi[c];
    else if (vecchi[c]) out[c] = vecchi[c];
  });
  return out;
}

/* IL GRUPPO APERTO.

   Si cambia solo se quello aperto non c'è più. Prima si controllava
   contro la lista vecchia, quindi un gruppo appena aggiunto — che
   `handleConfermaJoin` apre subito — risultava «non più presente» e la
   schermata saltava da un'altra parte sotto le mani dell'utente. */
export function attivoDopoSync(attivo, codici) {
  if (attivo && codici.includes(attivo)) return attivo;
  return codici[0] || null;
}

/* LO STATO DEI GRUPPI con le uscite registrate.

   Uno scioglimento è un'uscita e va scritta dove si scrivono le uscite,
   altrimenti `normalizzaRegistro` rigenera `groups` da `gruppiStato` e
   il gruppo torna alla prima rilettura. Si tocca solo `daTogliere`:
   quello entrato nel frattempo mantiene il suo `true` e il suo
   orologio. */
export function statoDopoSync(stato, daTogliere) {
  const out = { ...(stato && typeof stato === 'object' ? stato : {}) };
  daTogliere.forEach((c) => { out[c] = false; });
  return out;
}
