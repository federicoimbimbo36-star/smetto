import { Eye, EyeOff } from 'lucide-react';
import { BrandMark, Pianta, CampoTelefono, FattoConIA } from '../components';

export default function AuthScreen(props) {
  const {
    mode, setMode, phone, setPhone, paese, setPaese,
    password, setPassword, confirmPassword, setConfirmPassword,
    showPassword, setShowPassword, showConfirmPassword, setShowConfirmPassword, error, busy, onSubmit,
  } = props;
  const invio = (e) => { if (e.key === 'Enter' && !busy) onSubmit(); };
  const registrazione = mode === 'signup';

  return (
    <div className="screen">
      <div className="marchio-riga" style={{ justifyContent: 'center', marginBottom: 8 }}>
        <BrandMark size={38} />
        <div>
          <div className="marchio-nome">Smetto</div>
          <div className="marchio-claim">Meno di ieri</div>
        </div>
      </div>

      <Pianta giorni={7} dimensione={150} mostraStadio={false} />

      <h1 className="titolo-schermata" style={{ textAlign: 'center', marginTop: 20 }}>
        {registrazione ? 'Cominciamo' : 'Bentornato'}
      </h1>
      <p className="sotto-schermata" style={{ textAlign: 'center' }}>
        {registrazione
          ? 'Con il numero di telefono. Il percorso resta legato a te, su qualsiasi telefono.'
          : 'Numero di telefono e password.'}
      </p>

      <div className="segmenti">
        <button
          disabled={busy} className={`segmento ${!registrazione ? 'segmento-on' : ''}`}
          onClick={() => setMode('login')}
        >
          Accedi
        </button>
        <button
          disabled={busy} className={`segmento ${registrazione ? 'segmento-on' : ''}`}
          onClick={() => setMode('signup')}
        >
          Registrati
        </button>
      </div>

      <div className="campo">
        <span className="campo-label">Numero di telefono</span>
        <CampoTelefono
          paese={paese} setPaese={setPaese}
          numero={phone} setNumero={setPhone}
          disabled={busy} onInvio={() => { if (!busy) onSubmit(); }}
        />
      </div>

      <div className="campo">
        <label className="campo-label" htmlFor="a-pw">Password</label>
        <div className="campo-password">
          <input
            id="a-pw" className="campo-input" type={showPassword ? 'text' : 'password'}
            placeholder={registrazione ? 'Almeno 12 caratteri' : 'Password'} value={password}
            onChange={(e) => setPassword(e.target.value)} onKeyDown={invio}
            autoComplete={registrazione ? 'new-password' : 'current-password'} disabled={busy}
          />
          <button
            type="button" className="campo-occhio" onClick={() => setShowPassword((s) => !s)} disabled={busy}
            aria-label={showPassword ? 'Nascondi la password' : 'Mostra la password'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {registrazione && (
        <div className="campo">
          <label className="campo-label" htmlFor="a-pw2">Conferma la password</label>
          <div className="campo-password">
            <input
              id="a-pw2" className="campo-input" type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Ripetila" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} onKeyDown={invio}
              autoComplete="new-password" disabled={busy}
            />
            <button
              type="button" className="campo-occhio" onClick={() => setShowConfirmPassword((s) => !s)} disabled={busy}
              aria-label={showConfirmPassword ? 'Nascondi la password' : 'Mostra la password'}
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
      )}

      {error && <p className="campo-errore">{error}</p>}

      <button className="btn btn-primario btn-blocco" style={{ marginTop: 8 }} onClick={onSubmit} disabled={busy}>
        {busy ? 'Un attimo…' : registrazione ? 'Crea il mio account' : 'Entra'}
      </button>

      <button
        className="btn btn-testo btn-testo-centro" style={{ marginTop: 8 }} disabled={busy}
        onClick={() => setMode(registrazione ? 'login' : 'signup')}
      >
        {registrazione ? 'Ho già un account' : 'Non ho ancora un account'}
      </button>

      <p className="nota" style={{ marginTop: 24 }}>
        Registri solo le tue sigarette. Se entri in un gruppo, gli altri vedono i tuoi conteggi:
        è quello il patto che rende la classifica utile.
      </p>

      <FattoConIA />
    </div>
  );
}
