import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function RecoveryOtpModal({ phone, onCancel, onVerify }) {
  const [step, setStep] = useState('code');            // 'code' -> 'password'
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    if (step === 'code') {
      if (code.trim().length < 4) { setError('Inserisci il codice ricevuto via SMS.'); return; }
      setStep('password');
      return;
    }
    if (password.length < 6) { setError('La nuova password deve avere almeno 6 caratteri.'); return; }
    if (password !== confirm) { setError('La conferma non coincide con la nuova password.'); return; }
    setBusy(true);
    const res = await onVerify(code.trim(), password);
    setBusy(false);
    if (res?.error) setError(res.error);
  }

  const invio = (e) => { if (e.key === 'Enter' && !busy) submit(); };

  return (
    <div className="modale-velo" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modale" role="dialog" aria-modal="true">
        <h2 className="modale-titolo">Recupera la password</h2>

        {step === 'code' ? (
          <>
            <p className="modale-testo">Ti abbiamo mandato un codice via SMS al {phone}. Scrivilo qui sotto.</p>
            <div className="campo" style={{ marginTop: 20 }}>
              <label className="campo-label" htmlFor="otp-code">Codice ricevuto</label>
              <input
                id="otp-code" className="campo-input" inputMode="numeric" placeholder="123456" value={code}
                onChange={(e) => setCode(e.target.value)} onKeyDown={invio} autoFocus disabled={busy}
              />
            </div>
          </>
        ) : (
          <>
            <p className="modale-testo">Codice verificato. Scegli la nuova password.</p>
            <div className="campo" style={{ marginTop: 20 }}>
              <label className="campo-label" htmlFor="otp-pw">Nuova password</label>
              <div className="campo-password">
                <input
                  id="otp-pw" className="campo-input" type={showPassword ? 'text' : 'password'}
                  placeholder="Almeno 6 caratteri" value={password}
                  onChange={(e) => setPassword(e.target.value)} onKeyDown={invio}
                  autoComplete="new-password" autoFocus disabled={busy}
                />
                <button
                  type="button" className="campo-occhio" onClick={() => setShowPassword((s) => !s)} disabled={busy}
                  aria-label={showPassword ? 'Nascondi la password' : 'Mostra la password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="campo">
              <label className="campo-label" htmlFor="otp-pw2">Conferma password</label>
              <input
                id="otp-pw2" className="campo-input" type={showPassword ? 'text' : 'password'}
                placeholder="Ripeti la password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} onKeyDown={invio}
                autoComplete="new-password" disabled={busy}
              />
            </div>
          </>
        )}

        {error && <p className="campo-errore">{error}</p>}

        <div className="modale-azioni">
          <button className="btn btn-secondario" onClick={onCancel} disabled={busy}>Annulla</button>
          <button className="btn btn-primario" onClick={submit} disabled={busy}>
            {busy ? 'Un attimo…' : step === 'code' ? 'Continua' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  );
}
