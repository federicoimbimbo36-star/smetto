import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

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

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !busy) submit(); };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal modal-small">
        <div className="modal-title">Recupera password</div>

        {step === 'code' ? (
          <>
            <p className="modal-hint">
              Abbiamo inviato un codice via SMS al numero {phone}. Inseriscilo qui sotto per continuare.
            </p>
            <div className="field-group">
              <label className="field-label">Codice ricevuto</label>
              <input className="text-input" inputMode="numeric" placeholder="123456" value={code}
                onChange={(e) => setCode(e.target.value)} onKeyDown={handleKeyDown} autoFocus disabled={busy} />
            </div>
          </>
        ) : (
          <>
            <p className="modal-hint">Codice verificato. Scegli la nuova password per il tuo account.</p>
            <div className="field-group">
              <label className="field-label"><Lock size={13} /> Nuova password</label>
              <div className="password-field">
                <input className="text-input" type={showPassword ? 'text' : 'password'} placeholder="Almeno 6 caratteri"
                  value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKeyDown}
                  autoComplete="new-password" autoFocus disabled={busy} />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((s) => !s)} disabled={busy}
                  title={showPassword ? 'Nascondi password' : 'Mostra password'}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="field-group">
              <label className="field-label"><Lock size={13} /> Conferma password</label>
              <input className="text-input" type={showPassword ? 'text' : 'password'} placeholder="Ripeti la password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={handleKeyDown}
                autoComplete="new-password" disabled={busy} />
            </div>
          </>
        )}

        {error && <p className="field-error">{error}</p>}

        <div className="modal-row-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Annulla</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Attendere…' : step === 'code' ? 'Continua' : 'Reimposta password'}
          </button>
        </div>
      </div>
    </div>
  );
}
