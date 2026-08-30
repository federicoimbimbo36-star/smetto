/* ------------------------------------------------------------------ */
/* groups.js — src/data/groups.js                                      */
/*                                                                     */
/* Prima i gruppi vivevano in un KV "ultimo che scrive vince": tutto il */
/* gruppo era un unico oggetto, e per entrare o pubblicare i propri     */
/* numeri bisognava rileggere e riscrivere anche i dati degli altri.    */
/* Da lì il giro di scrittura-rilettura-confronto con i tentativi: una  */
/* toppa, non una garanzia. E soprattutto: essendo storage locale, due  */
/* persone su due telefoni non si vedevano proprio.                    */
/*                                                                     */
/* Adesso ogni membro è UNA RIGA sua nella tabella group_members, sul   */
/* database. Entrare, uscire e pubblicare i propri conteggi toccano     */
/* solo quella riga, quindi il conflitto non può nascere: non serve più */
/* nessun tentativo, nessun confronto, nessun lost update. E le policy  */
/* RLS fanno rispettare la regola più importante dell'app —            */
/* «ognuno registra solo le proprie sigarette» — sul server, dove       */
/* nessuno può aggirarla toccando il codice del client.                */
/*                                                                     */
/* Chi non fa parte del gruppo non ne legge i membri. L'unica cosa      */
/* visibile con il solo codice invito è l'anteprima (nome del gruppo e  */
/* quante persone ci sono), che passa da una funzione dedicata.         */
/* ------------------------------------------------------------------ */

import { supabase } from '../auth/supabaseClient.js';
import { ymd, maxTs } from '../utils/format.js';

const ms = (iso) => (iso ? new Date(iso).getTime() : null);

/* Se le variabili d'ambiente di Supabase sono vuote, `supabase` è null e
   l'app gira in modalità locale (vedi auth/index.js). Senza questi controlli
   il primo groups.mine() lanciava un TypeError dentro loadLog(): la promise
   nel primo useEffect rigettava, setSessionChecked(true) non veniva mai
   eseguito e l'app restava per sempre su "Verifica sessione…". Il fallback
   dichiarato non funzionava proprio. */
const spento = () => {
  if (!supabase) {
    // eslint-disable-next-line no-console
    console.warn('[groups] Supabase non configurato: i gruppi non sono disponibili in modalità locale.');
    return true;
  }
  return false;
};

/* riga del database → scheda del membro, con i nomi che usa già l'app */
function scheda(row) {
  return {
    id: row.user_id,
    name: row.name,
    color: row.color,
    days: row.days || {},
    resists: row.resists || {},
    checkins: row.checkins || {},
    total: row.total || 0,
    lastEvent: row.last_event,
    lastResist: row.last_resist,
    lastAttivita: row.last_attivita,
    /* Serve alla classifica per sapere se il silenzio di questo membro è
       silenzio o astinenza dichiarata: senza, chi smette davvero e non
       riapre l'app risulterebbe inattivo e uscirebbe dalla graduatoria. */
    smessoDal: row.smesso_dal ?? null,
    updatedAt: ms(row.updated_at),
  };
}

function componiGruppo(row) {
  const membri = (row.group_members || [])
    .map((m) => ({
      id: m.user_id, name: m.name, color: m.color, joinedAt: ms(m.joined_at),
    }))
    .sort((a, b) => a.joinedAt - b.joinedAt);
  return {
    code: row.code,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: ms(row.created_at),
    members: membri,
  };
}

const groups = {
  /* Dice a chi chiama se il backend c'è davvero. Serve a distinguere due
     casi che da fuori si somigliano e non lo sono: «non fai parte di nessun
     gruppo» e «i gruppi qui non esistono proprio». Senza questa distinzione
     l'app in modalità locale prendeva l'elenco vuoto per buono e cancellava
     la lista dei gruppi salvata sul dispositivo. */
  disponibile: () => Boolean(supabase),

  /* Creare il gruppo ed entrarci sono una transazione sola lato database:
     non può restare un gruppo vuoto se qualcosa fallisce a metà. */
  async create(name, me) {
    if (spento()) throw new Error('backend non configurato');
    const { data, error } = await supabase.rpc('create_group', {
      p_name: name,
      p_member_name: me.name,
      p_color: me.color,
    });
    if (error) throw new Error(error.message);
    return {
      code: data.code,
      name: data.name,
      ownerId: data.owner_id,
      createdAt: ms(data.created_at),
      members: [{ id: me.id, name: me.name, color: me.color, joinedAt: Date.now() }],
    };
  },

  /* Con il solo codice si vede questo e nient'altro: come si chiama il
     gruppo e quante persone ci sono. Nessun nome, nessun numero. */
  async preview(code) {
    if (spento()) return null;
    const { data, error } = await supabase.rpc('group_preview', { p_code: code });
    const g = Array.isArray(data) ? data[0] : data;
    if (error || !g) return null;
    return { code: g.code, name: g.name, memberCount: g.member_count };
  },

  /* Il gruppo con l'elenco dei suoi iscritti.
  
     TRE ESITI, NON DUE. Prima ne tornava uno solo — `null` — e dentro quel
     `null` ci stavano due cose che non hanno niente in comune: «il gruppo
     non esiste più, o ne sei stato tolto» e «non sono riuscito a
     chiederlo». Chi chiama le trattava allo stesso modo, cioè toglieva il
     codice dalla lista: bastava un tunnel o un Wi-Fi che oscilla perché
     l'app facesse uscire dai propri gruppi, e non si rientrava fino al
     riavvio.
  
       { ok: true,  gruppo: {...} }  → c'è
       { ok: true,  gruppo: null  }  → la domanda è arrivata: non c'è più
       { ok: false }                 → non lo so, e nel dubbio non si tocca niente
  
     `ok` dice se la RISPOSTA è affidabile, `gruppo` dice cosa contiene. */
  async fetch(code) {
    if (spento()) return { ok: false };
    const { data, error } = await supabase
      .from('groups')
      .select('code, name, owner_id, created_at, group_members(user_id, name, color, joined_at)')
      .eq('code', code)
      .maybeSingle();
    // errore = la domanda non è arrivata a destinazione: non è una risposta
    if (error) return { ok: false, errore: error.message };
    // nessun errore e nessuna riga: questa sì è una risposta, ed è «non c'è»
    return { ok: true, gruppo: data ? componiGruppo(data) : null };
  },

  /* Tutti i gruppi di cui faccio parte, presi dal database invece che
     dalla lista salvata sul dispositivo: è così che un telefono nuovo
     ritrova i gruppi senza che nessuno reinserisca i codici.
  
     Qui gli esiti sono due, perché «nessun gruppo» è una risposta
     legittima: quello che non deve più succedere è che una LETTURA
     FALLITA venga scambiata per «non fai parte di niente» e cancelli la
     lista salvata sul dispositivo. */
  async mine() {
    if (spento()) return { ok: false, gruppi: [] };
    const { data, error } = await supabase
      .from('groups')
      .select('code, name, owner_id, created_at, group_members(user_id, name, color, joined_at)');
    if (error || !data) return { ok: false, gruppi: [], errore: error?.message };
    return { ok: true, gruppi: data.map(componiGruppo) };
  },

  async join(code, me) {
    if (spento()) return { error: 'backend non configurato' };
    const { data, error } = await supabase.rpc('join_group', {
      p_code: code,
      p_name: me.name,
      p_color: me.color,
    });
    if (error) return { error: error.message };
    if (!data) return { error: 'codice' };
    const esito = await this.fetch(data.code);
    return {
      group: esito.gruppo || {
        code: data.code,
        name: data.name,
        ownerId: data.owner_id,
        createdAt: ms(data.created_at),
        members: [{ id: me.id, name: me.name, color: me.color, joinedAt: Date.now() }],
      },
    };
  },

  /* Si cancella solo la propria riga. Se resta qualcuno il gruppo continua
     a vivere (e se se n'è andato il proprietario, la proprietà passa a chi
     è entrato per primo); se non resta nessuno il gruppo sparisce da solo:
     ci pensa un trigger sul database. */
  async leave(code, uid) {
    if (spento()) return {};
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('code', code)
      .eq('user_id', uid);
    if (error) return { error: error.message };
    return {};
  },

  /* La dichiarazione è una sola: gli stessi identici numeri finiscono in
     ogni gruppo di cui fai parte. Non si può dire una cosa agli amici e
     un'altra alla famiglia. */
  async publish(codes, me, dati) {
    if (spento() || !codes?.length || !me?.id) return;

    const days = {};
    dati.cigs.forEach((t) => { const k = ymd(t); days[k] = (days[k] || 0) + 1; });
    const resists = {};
    dati.resists.forEach((t) => { const k = ymd(t); resists[k] = (resists[k] || 0) + 1; });
    const checkins = {};
    (dati.checkins || []).forEach((t) => { checkins[ymd(t)] = true; });

    const eventi = [...dati.cigs, ...dati.resists, ...(dati.checkins || [])];
    const base = {
      user_id: me.id,
      name: me.name,
      color: me.color,
      days,
      resists,
      checkins,
      total: dati.cigs.length,
      // maxTs e non Math.max(...lista): lo spread passa ogni elemento come
      // argomento e su uno storico lungo raggiunge il limite del motore JS.
      // La regola era già scritta in format.js, qui era rimasta l'eccezione.
      last_event: maxTs(dati.cigs),
      last_resist: maxTs(dati.resists),
      last_attivita: maxTs(eventi),
      smesso_dal: Number.isFinite(dati.smessoDal) ? dati.smessoDal : null,
    };

    const { error } = await supabase
      .from('group_members')
      .upsert(codes.map((code) => ({ ...base, code })), { onConflict: 'code,user_id' });

    // Se nel frattempo il gruppo è stato sciolto la scrittura fallisce:
    // non è un problema da mostrare all'utente, il prossimo sync ripulisce.
    if (error) console.warn('pubblicazione dei conteggi non riuscita:', error.message);
  },

  /* Stessa regola di `fetch`: una classifica vuota e una classifica che
     non si è riusciti a leggere non sono la stessa cosa. La seconda non
     deve svuotare quella che l'utente ha già davanti. */
  async fetchMembers(code) {
    if (spento()) return { ok: false, membri: [] };
    const { data, error } = await supabase
      .from('group_members')
      .select('user_id, name, color, days, resists, checkins, total, last_event, last_resist, last_attivita, smesso_dal, updated_at')
      .eq('code', code);
    if (error || !data) return { ok: false, membri: [], errore: error?.message };
    return { ok: true, membri: data.map(scheda) };
  },
};

/* ------------------------------------------------------------------ */
/*  CHI È VIVO, CHI È MORTO, CHI NON SI SA                             */
/*                                                                     */
/*  Sta qui e non dentro App.jsx per una ragione sola: è LA REGOLA che  */
/*  decide se un gruppo viene tolto dalla lista, ed è esattamente la    */
/*  cosa che non ci si può permettere di verificare a occhio. Funzione  */
/*  pura di (codici, esiti): la si prova senza rete, senza React e      */
/*  senza database.                                                    */
/*                                                                     */
/*  L'invariante da non rompere mai: un codice finisce fra i `morti`    */
/*  SOLO se la sua lettura è riuscita e ha risposto «non c'è».          */
/* ------------------------------------------------------------------ */
export function smista(codici, esiti) {
  const vivi = [];
  const morti = [];
  const incerti = [];
  codici.forEach((code) => {
    const e = esiti[code];
    if (!e || !e.ok) incerti.push(code);
    else if (!e.gruppo) morti.push(code);
    else vivi.push(code);
  });
  return { vivi, morti, incerti };
}

export default groups;
