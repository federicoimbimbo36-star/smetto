import { useState, useEffect } from 'react';
import {
  Camera, Mail, Phone, Wallet, Hourglass, Bell, BellOff, Lock, Download, LogOut, Trash2,
} from 'lucide-react';
import { PALETTE } from '../constants';
import { AvatarCircle, Chip } from '../components';

export default function AccountScreen({
  user, setUser, nicknameDraft, setNicknameDraft, pwFields, setPwFields,
  onSave, onRecovery, onChangePassword, onDelete, onLogout, onResetLog,
  totale, notifiche, onToggleNotifiche, avvisiCorpo, onToggleCorpo, profile, onProfileChange,
  onExportJSON, onExportCSV,
}) {
  /* I campi numerici tengono una BOZZA di testo, non il numero.
     Prima il valore mostrato era `profile.prezzoPacchetto` e a ogni tasto
     si riconvertiva in numero: appena si scriveva la virgola di "6,50",
     Number("6,") diventava 6, il campo si riscriveva da solo e la virgola
     spariva. Il prezzo con i decimali era semplicemente impossibile da
     inserire, e senza prezzo giusto tutti i conti dei risparmi sono
     sbagliati. Adesso si digita liberamente e il numero viene estratto
     quando si esce dal campo (o si preme Invio). */
  const [prezzoDraft, setPrezzoDraft] = useState(
    profile.prezzoPacchetto == null ? '' : String(profile.prezzoPacchetto).replace('.', ','),
  );
  const [perPacchettoDraft, setPerPacchettoDraft] = useState(String(profile.perPacchetto ?? 20));

  // se il profilo cambia da fuori (nuovo login, onboarding rifatto) le bozze
  // devono seguirlo, altrimenti restano ferme sui valori di prima
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

  const invioConferma = (fn) => (e) => { if (e.key === 'Enter') fn(); };

  return (
    <div className="screen">
      <h1 className="screen-title">Account</h1>

      <div className="account-avatar-row">
        <AvatarCircle name={user.nickname || user.name} color={user.avatarColor} size={72} />
        <div className="avatar-palette">
          {PALETTE.map((c) => (
            <button key={c} className="avatar-swatch"
              style={{ background: c, outline: user.avatarColor === c ? '1.5px solid #F2EDE4' : 'none', outlineOffset: '2px' }}
              onClick={() => setUser((u) => ({ ...u, avatarColor: c }))} aria-label={`Colore avatar ${c}`} />
          ))}
        </div>
      </div>
      <p className="micro-hint"><Camera size={13} /> Scegli un colore per il tuo avatar</p>

      <div className="field-group">
        <label className="field-label">Nome</label>
        <input className="text-input" value={user.name} onChange={(e) => setUser((u) => ({ ...u, name: e.target.value }))} />
      </div>

      <div className="field-group">
        <label className="field-label">Nickname (è quello che vede il gruppo)</label>
        <input className="text-input" value={nicknameDraft} onChange={(e) => setNicknameDraft(e.target.value)} />
      </div>

      <div className="field-group">
        <label className="field-label"><Mail size={13} /> Email {user.emailVerified && <Chip tone="mint">verificata</Chip>}</label>
        <input className="text-input" value={user.email} onChange={(e) => setUser((u) => ({ ...u, email: e.target.value }))} />
      </div>

      {/* Il numero NON è modificabile qui, ed è importante che si veda.
          È la credenziale con cui si entra: cambiarlo nel profilo non
          cambiava le credenziali, quindi si sarebbe continuato ad accedere
          col vecchio numero mentre l'app ne mostrava un altro — e al primo
          tentativo di recupero password nessuno avrebbe più capito quale
          fosse quello giusto. Meglio un campo bloccato che una trappola. */}
      <div className="field-group">
        <label className="field-label"><Phone size={13} /> Numero di telefono {user.phoneVerified && <Chip tone="mint">verificato</Chip>}</label>
        <input className="text-input" value={user.phone} readOnly disabled />
        <p className="micro-hint">
          È il numero con cui accedi, quindi non si cambia da qui. Per usarne un altro
          scrivi pure: serve spostare l&apos;account, non basta cambiare il campo.
        </p>
      </div>

      <button className="btn btn-primary btn-block" onClick={onSave}>Salva modifiche</button>

      <div className="divider" />

      <h2 className="section-title"><Wallet size={15} /> Il tuo pacchetto</h2>
      <div className="row-2">
        <div className="field-group">
          <label className="field-label">Prezzo</label>
          <input className="text-input" inputMode="decimal" placeholder="6,00" value={prezzoDraft}
            onChange={(e) => setPrezzoDraft(e.target.value)}
            onBlur={confermaPrezzo} onKeyDown={invioConferma(confermaPrezzo)} />
        </div>
        <div className="field-group">
          <label className="field-label">Sigarette</label>
          <input className="text-input" type="number" inputMode="numeric" value={perPacchettoDraft}
            onChange={(e) => setPerPacchettoDraft(e.target.value)}
            onBlur={confermaPerPacchetto} onKeyDown={invioConferma(confermaPerPacchetto)} />
        </div>
      </div>
      <div className="field-group">
        <label className="field-label"><Hourglass size={13} /> Minuti per sigaretta</label>
        <div className="trigger-chips">
          {[['uomo', 'uomo · 17'], ['donna', 'donna · 22'], ['non_detto', 'media · 20']].map(([k, l]) => (
            <button key={k} className={`trigger-chip ${(profile.sesso || 'non_detto') === k ? 'trigger-chip-on' : ''}`}
              onClick={() => onProfileChange('sesso', k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="divider" />

      <h2 className="section-title">{notifiche ? <Bell size={15} /> : <BellOff size={15} />} Notifiche</h2>
      <button className="toggle-row" onClick={onToggleCorpo}>
        <div>
          <div className="toggle-title">Tappe del corpo</div>
          <div className="toggle-sub">
            Ti avviso quando superi una soglia dall'ultima sigaretta: monossido dimezzato, gusto che
            torna, respiro che si libera.
          </div>
        </div>
        <span className={`toggle-pill ${avvisiCorpo ? 'toggle-on' : ''}`}><span className="toggle-knob" /></span>
      </button>

      <button className="toggle-row" onClick={onToggleNotifiche}>
        <div>
          <div className="toggle-title">Avvisi dal gruppo</div>
          <div className="toggle-sub">Quando un amico registra una sigaretta. Il tuo conteggio resta comunque visibile a loro.</div>
        </div>
        <span className={`toggle-pill ${notifiche ? 'toggle-on' : ''}`}><span className="toggle-knob" /></span>
      </button>

      <div className="divider" />

      <h2 className="section-title"><Lock size={15} /> Password</h2>
      <input className="text-input" type="password" placeholder="Password attuale" value={pwFields.current}
        onChange={(e) => setPwFields((p) => ({ ...p, current: e.target.value }))} />
      <input className="text-input" type="password" placeholder="Nuova password" value={pwFields.next}
        onChange={(e) => setPwFields((p) => ({ ...p, next: e.target.value }))} />
      <input className="text-input" type="password" placeholder="Conferma nuova password" value={pwFields.confirm}
        onChange={(e) => setPwFields((p) => ({ ...p, confirm: e.target.value }))} />
      <button className="btn btn-ghost btn-block" onClick={onChangePassword}>Cambia password</button>
      <button className="link-btn" onClick={onRecovery}>Password dimenticata? Recupera via SMS</button>

      <div className="divider" />

      <h2 className="section-title">I tuoi dati</h2>
      <p className="policy-note">
        Hai registrato {totale} sigarette in tutto. Vuoi parlare con qualcuno? Telefono Verde contro
        il Fumo dell'Istituto Superiore di Sanità: <b>800 554 088</b>, gratuito.
      </p>
      <div className="export-row">
        <button className="btn btn-ghost" onClick={onExportCSV}><Download size={15} /> Registro CSV</button>
        <button className="btn btn-ghost" onClick={onExportJSON}><Download size={15} /> Backup JSON</button>
      </div>
      <p className="micro-hint">
        Il CSV si apre in Excel: utile se vuoi far vedere il tuo andamento al medico. Il JSON
        contiene tutto e serve a rimettere i dati su un altro telefono.
      </p>

      <button className="link-btn danger" onClick={onResetLog}>Azzera lo storico (l'account resta)</button>

      <div className="divider" />

      <button className="btn btn-ghost btn-block" onClick={onLogout}><LogOut size={16} /> Esci</button>
      <button className="link-btn danger" onClick={onDelete}><Trash2 size={14} /> Elimina account</button>
    </div>
  );
}
