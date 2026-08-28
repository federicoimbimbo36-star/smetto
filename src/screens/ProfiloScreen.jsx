import { useState, useEffect } from 'react';
import { Mail, Phone, Download, LogOut, Trash2, ChevronRight } from 'lucide-react';
import { PALETTE } from '../constants';
import { AvatarCircle, Chip, Pianta } from '../components';
import { eurSegno, dec } from '../utils/format';

/* ------------------------------------------------------------------ */
/*  PROFILO                                                            */
/*                                                                     */
/*  Risponde a: «chi sono e perché lo sto facendo?».                   */
/*                                                                     */
/*  In cima la persona, non i campi: avatar, nome, da quando, e le tre */
/*  cifre che riassumono il percorso. Tutto il resto — dati, prezzo    */
/*  del pacchetto, notifiche, password, esportazioni — sta sotto,      */
/*  raggruppato per argomento invece che in una lista unica di venti   */
/*  controlli.                                                         */
/*                                                                     */
/*  Il numero di telefono resta di sola lettura, ed è importante che   */
/*  si veda: è la credenziale con cui si entra. Cambiarlo qui non      */
/*  cambierebbe le credenziali, e al primo recupero password nessuno   */
/*  capirebbe più qual è quello giusto. Meglio un campo bloccato che   */
/*  una trappola.                                                      */
/* ------------------------------------------------------------------ */

export default function ProfiloScreen({
  user, setUser, nicknameDraft, setNicknameDraft, pwFields, setPwFields,
  onSave, onRecovery, onChangePassword, onDelete, onLogout, onResetLog,
  totale, notifiche, onToggleNotifiche, avvisiCorpo, onToggleCorpo, profile, onProfileChange,
  onExportJSON, onExportCSV, start, conti, giorniPercorso, motivo, onModificaMotivo, obiettivo,
}) {
  /* I campi numerici tengono una BOZZA di testo, non il numero: se si
     riconverte a ogni tasto, appena si scrive la virgola di "6,50" il
     campo si riscrive da solo e la virgola sparisce — e senza prezzo
     giusto tutti i conti dei risparmi sono sbagliati. */
  const [prezzoDraft, setPrezzoDraft] = useState(
    profile.prezzoPacchetto == null ? '' : String(profile.prezzoPacchetto).replace('.', ','),
  );
  const [perPacchettoDraft, setPerPacchettoDraft] = useState(String(profile.perPacchetto ?? 20));

  useEffect(() => {
    setPrezzoDraft(profile.prezzoPacchetto == null ? '' : String(profile.prezzoPacchetto).replace('.', ','));
  }, [profile.prezzoPacchetto]);
  useEffect(() => {
    setPerPacchettoDraft(String(profile.perPacchetto ?? 20));
  }, [profile.perPacchetto]);

  const confermaPrezzo = () => {
    const n = Number(prezzoDraft.replace(',', '.'));
    const valido = Number.isFinite(n) && n > 0 ? n : null;
    onProfileChange('prezzoPacchetto', valido);
    setPrezzoDraft(valido == null ? '' : String(valido).replace('.', ','));
  };
  const confermaPerPacchetto = () => {
    const n = Math.round(Number(perPacchettoDraft));
    const valido = Number.isFinite(n) && n > 0 ? n : 20;
    onProfileChange('perPacchetto', valido);
    setPerPacchettoDraft(String(valido));
  };
  const invio = (fn) => (e) => { if (e.key === 'Enter') fn(); };

  const dataInizio = start
    ? new Date(start).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="screen">
      <h1 className="titolo-schermata">Profilo</h1>

      {/* ---- chi sei ---- */}
      <div className="card">
        <div className="card-riga">
          <AvatarCircle name={user.nickname || user.name} color={user.avatarColor} size={64} />
          <div className="card-riga-corpo">
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>
              {user.nickname || user.name}
            </div>
            <div className="testo-piccolo" style={{ marginTop: 3 }}>
              {dataInizio ? `Dal ${dataInizio} · giorno ${giorniPercorso + 1}` : 'Il percorso non è ancora partito'}
            </div>
          </div>
          <Pianta giorni={giorniPercorso} dimensione={70} mostraStadio={false} />
        </div>

        {conti && (
          <div className="eroe-riga">
            <div>
              <span className={`num ${conti.inRosso ? 'spento' : ''}`}>{eurSegno(conti.risparmiato)}</span>
              <small>risparmiati</small>
            </div>
            <div><span className="num">{totale}</span><small>sigarette registrate</small></div>
            <div>
              <span className="num">{obiettivo == null ? '—' : obiettivo < 0.5 ? '0' : dec(obiettivo)}</span>
              <small>obiettivo al giorno</small>
            </div>
          </div>
        )}
      </div>

      {/* ---- il motivo ---- */}
      <button className="card card-tocco card-tenue" style={{ marginTop: 12 }} onClick={onModificaMotivo}>
        <div className="card-riga">
          <div className="card-riga-corpo">
            <div className="etichetta">Perché lo stai facendo</div>
            <p style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4, margin: '8px 0 0', color: 'var(--t1)' }}>
              {motivo ? `“${motivo}”` : 'Non l\u2019hai ancora scritto'}
            </p>
          </div>
          <ChevronRight size={20} color="var(--t2)" />
        </div>
      </button>

      {/* ---- i tuoi dati ---- */}
      <h2 className="titolo-sezione stacco">I tuoi dati</h2>

      <div className="campo" style={{ marginTop: 16 }}>
        <label className="campo-label">Il colore del tuo avatar</label>
        <div className="avatar-palette">
          {PALETTE.map((c) => (
            <button
              key={c} className="avatar-scelta" style={{
                background: c,
                outline: user.avatarColor === c ? '2.5px solid var(--verde)' : 'none',
                outlineOffset: '2px',
              }}
              onClick={() => setUser((u) => ({ ...u, avatarColor: c }))}
              aria-label={`Colore avatar ${c}`} aria-pressed={user.avatarColor === c}
            />
          ))}
        </div>
      </div>

      <div className="campo">
        <label className="campo-label" htmlFor="p-nome">Nome</label>
        <input
          id="p-nome" className="campo-input" value={user.name}
          onChange={(e) => setUser((u) => ({ ...u, name: e.target.value }))}
        />
      </div>

      <div className="campo">
        <label className="campo-label" htmlFor="p-nick">Nickname · è quello che vede il gruppo</label>
        <input
          id="p-nick" className="campo-input" value={nicknameDraft}
          onChange={(e) => setNicknameDraft(e.target.value)}
        />
      </div>

      <div className="campo">
        <label className="campo-label" htmlFor="p-mail">
          <Mail size={14} /> Email {user.emailVerified && <Chip>verificata</Chip>}
        </label>
        <input
          id="p-mail" className="campo-input" value={user.email}
          onChange={(e) => setUser((u) => ({ ...u, email: e.target.value }))}
        />
      </div>

      <div className="campo">
        <label className="campo-label" htmlFor="p-tel">
          <Phone size={14} /> Numero di telefono {user.phoneVerified && <Chip>verificato</Chip>}
        </label>
        <input id="p-tel" className="campo-input" value={user.phone} readOnly disabled />
        <p className="nota">
          È il numero con cui accedi, quindi non si cambia da qui. Per usarne un altro scrivici:
          serve spostare l'account, non basta cambiare il campo.
        </p>
      </div>

      <button className="btn btn-primario btn-blocco" onClick={onSave}>Salva le modifiche</button>

      {/* ---- il pacchetto ---- */}
      <h2 className="titolo-sezione stacco">Il tuo pacchetto</h2>
      <p className="testo-piccolo" style={{ margin: '8px 0 16px' }}>
        È la base di ogni conto sui risparmi. Se cambia il prezzo, cambialo anche qui.
      </p>
      <div className="riga">
        <div className="campo">
          <label className="campo-label" htmlFor="p-prezzo">Prezzo</label>
          <input
            id="p-prezzo" className="campo-input" inputMode="decimal" placeholder="6,00"
            value={prezzoDraft} onChange={(e) => setPrezzoDraft(e.target.value)}
            onBlur={confermaPrezzo} onKeyDown={invio(confermaPrezzo)}
          />
        </div>
        <div className="campo">
          <label className="campo-label" htmlFor="p-per">Sigarette</label>
          <input
            id="p-per" className="campo-input" type="number" inputMode="numeric"
            value={perPacchettoDraft} onChange={(e) => setPerPacchettoDraft(e.target.value)}
            onBlur={confermaPerPacchetto} onKeyDown={invio(confermaPerPacchetto)}
          />
        </div>
      </div>
      <div className="campo">
        <label className="campo-label">Minuti di vita per sigaretta</label>
        <div className="pastiglie">
          {[['uomo', 'uomo · 17'], ['donna', 'donna · 22'], ['non_detto', 'media · 20']].map(([k, l]) => (
            <button
              key={k} className={`pastiglia ${(profile.sesso || 'non_detto') === k ? 'pastiglia-on' : ''}`}
              onClick={() => onProfileChange('sesso', k)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ---- notifiche ---- */}
      <h2 className="titolo-sezione stacco">Notifiche</h2>
      <button className="interruttore" onClick={onToggleCorpo} aria-pressed={avvisiCorpo}>
        <div className="card-riga-corpo">
          <div className="interruttore-titolo">Quando il corpo cambia</div>
          <div className="interruttore-sub">
            Ossigeno che risale, gusto che torna, respiro che si libera. Non sono promemoria:
            sono cose che stanno succedendo.
          </div>
        </div>
        <span className={`interruttore-pill ${avvisiCorpo ? 'interruttore-on' : ''}`}>
          <span className="interruttore-knob" />
        </span>
      </button>
      <button className="interruttore" onClick={onToggleNotifiche} aria-pressed={notifiche}>
        <div className="card-riga-corpo">
          <div className="interruttore-titolo">Quando si muove il gruppo</div>
          <div className="interruttore-sub">
            Quando qualcuno registra una sigaretta. Il tuo conteggio resta comunque visibile a loro.
          </div>
        </div>
        <span className={`interruttore-pill ${notifiche ? 'interruttore-on' : ''}`}>
          <span className="interruttore-knob" />
        </span>
      </button>

      {/* ---- password ---- */}
      <h2 className="titolo-sezione stacco">Password</h2>
      <div className="pila" style={{ marginTop: 16 }}>
        <input
          className="campo-input" type="password" placeholder="Password attuale" autoComplete="current-password"
          value={pwFields.current} onChange={(e) => setPwFields((p) => ({ ...p, current: e.target.value }))}
        />
        <input
          className="campo-input" type="password" placeholder="Nuova password" autoComplete="new-password"
          value={pwFields.next} onChange={(e) => setPwFields((p) => ({ ...p, next: e.target.value }))}
        />
        <input
          className="campo-input" type="password" placeholder="Conferma la nuova password" autoComplete="new-password"
          value={pwFields.confirm} onChange={(e) => setPwFields((p) => ({ ...p, confirm: e.target.value }))}
        />
        <button className="btn btn-secondario btn-blocco" onClick={onChangePassword}>Cambia password</button>
        <button className="btn btn-testo btn-testo-centro" onClick={onRecovery}>
          L'ho dimenticata — recupera via SMS
        </button>
      </div>

      {/* ---- privacy e dati ---- */}
      <h2 className="titolo-sezione stacco">Privacy e dati</h2>
      <p className="testo-piccolo" style={{ margin: '8px 0 16px' }}>
        Hai registrato {totale} sigarette in tutto. I tuoi dati restano tuoi: puoi portarteli
        via quando vuoi. Il gruppo vede solo i conteggi, mai il registro.
      </p>
      <div className="riga">
        <button className="btn btn-secondario btn-piccolo" onClick={onExportCSV}>
          <Download size={16} /> Registro CSV
        </button>
        <button className="btn btn-secondario btn-piccolo" onClick={onExportJSON}>
          <Download size={16} /> Backup JSON
        </button>
      </div>
      <p className="nota">
        Il CSV si apre in Excel: utile se vuoi far vedere l'andamento al medico. Il JSON contiene
        tutto e serve a rimettere i dati su un altro telefono.
      </p>

      <div className="pila" style={{ marginTop: 24 }}>
        <button className="btn btn-spento btn-blocco" onClick={onResetLog}>
          Azzera lo storico · l'account resta
        </button>
        <button className="btn btn-spento btn-blocco" onClick={onLogout}>
          <LogOut size={17} /> Esci dall'account
        </button>
        <button className="btn btn-testo btn-testo-tenue btn-testo-centro" onClick={onDelete}>
          <Trash2 size={15} /> Elimina l'account
        </button>
      </div>
    </div>
  );
}
