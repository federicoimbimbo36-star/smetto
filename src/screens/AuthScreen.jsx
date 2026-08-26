import { Eye, EyeOff, Phone, Lock } from 'lucide-react';
import { BrandMark } from '../components';

export default function AuthScreen(props) {
  const {
    mode, setMode, phone, setPhone, password, setPassword, confirmPassword, setConfirmPassword,
    showPassword, setShowPassword, showConfirmPassword, setShowConfirmPassword, error, busy, onSubmit,
  } = props;
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !busy) onSubmit(); };

  return (
    <div className="screen auth-screen">
      <div className="brand-row auth-brand-row">
        <BrandMark />
        <div>
          <div className="brand-name">Smetto</div>
          <div className="brand-tagline">Meno di ieri</div>
        </div>
      </div>

      <h1 className="screen-title">{mode === 'signup' ? 'Crea il tuo account' : 'Bentornato'}</h1>
      <p className="screen-sub">
        {mode === 'signup'
          ? 'Iscriviti con il numero di telefono: il conteggio resta legato a te, su qualsiasi dispositivo.'
          : 'Accedi con numero di telefono e password.'}
      </p>

      <div className="segmented">
        <button disabled={busy} className={mode === 'login' ? 'segmented-item active' : 'segmented-item'} onClick={() => setMode('login')}>Accedi</button>
        <button disabled={busy} className={mode === 'signup' ? 'segmented-item active' : 'segmented-item'} onClick={() => setMode('signup')}>Registrati</button>
      </div>

      <div className="field-group">
        <label className="field-label"><Phone size={13} /> Numero di telefono</label>
        <input className="text-input" type="tel" placeholder="+39 333 123 4567" value={phone}
          onChange={(e) => setPhone(e.target.value)} onKeyDown={handleKeyDown} autoComplete="tel" disabled={busy} />
      </div>

      <div className="field-group">
        <label className="field-label"><Lock size={13} /> Password</label>
        <div className="password-field">
          <input className="text-input" type={showPassword ? 'text' : 'password'} placeholder="Almeno 6 caratteri"
            value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKeyDown}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} disabled={busy} />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((s) => !s)} disabled={busy}
            title={showPassword ? 'Nascondi password' : 'Mostra password'}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {mode === 'signup' && (
        <div className="field-group">
          <label className="field-label"><Lock size={13} /> Conferma password</label>
          <div className="password-field">
            <input className="text-input" type={showConfirmPassword ? 'text' : 'password'} placeholder="Ripeti la password"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onKeyDown={handleKeyDown}
              autoComplete="new-password" disabled={busy} />
            <button type="button" className="password-toggle" onClick={() => setShowConfirmPassword((s) => !s)} disabled={busy}
              title={showConfirmPassword ? 'Nascondi password' : 'Mostra password'}>
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      )}

      {error && <p className="field-error">{error}</p>}

      <button className="btn btn-primary btn-block" onClick={onSubmit} disabled={busy}>
        {busy ? 'Attendere…' : mode === 'signup' ? 'Crea account' : 'Accedi'}
      </button>

      <p className="auth-switch-hint">
        {mode === 'signup' ? 'Hai già un account? ' : 'Non hai ancora un account? '}
        <button type="button" className="link-btn auth-inline-link" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')} disabled={busy}>
          {mode === 'signup' ? 'Accedi' : 'Registrati'}
        </button>
      </p>

      <p className="policy-note">
        Registri solo le tue sigarette. Se entri in un gruppo, gli amici vedono i tuoi conteggi:
        è quello il patto che rende la classifica utile.
      </p>
    </div>
  );
}
