import { useState } from 'react';
import { Wallet, Hourglass } from 'lucide-react';
import { MOTIVI, TAPPE, MANTRA, MINUTI_PER_SIGARETTA } from '../constants';
import { eur, eur0, tempoVita } from '../utils/format';
import { BrandMark } from '../components';

export default function OnboardingScreen({ iniziale, onFine, onChiediPermesso }) {
  const [passo, setPasso] = useState(0);
  const [prezzo, setPrezzo] = useState(iniziale?.prezzoPacchetto ? String(iniziale.prezzoPacchetto).replace('.', ',') : '');
  const [perPacchetto, setPerPacchetto] = useState(String(iniziale?.perPacchetto || 20));
  const [baseline, setBaseline] = useState(iniziale?.baseline ? String(iniziale.baseline) : '');
  const [sesso, setSesso] = useState(iniziale?.sesso || 'non_detto');
  const [motivo, setMotivo] = useState(iniziale?.motivo || '');

  const nPrezzo = Number(String(prezzo).replace(',', '.'));
  const nPer = Number(perPacchetto) || 20;
  const nBase = Number(String(baseline).replace(',', '.'));
  const unitario = nPrezzo > 0 ? nPrezzo / nPer : 0;

  const chiudi = (avvisiCorpo) => onFine({
    prezzoPacchetto: nPrezzo > 0 ? nPrezzo : null,
    perPacchetto: nPer,
    baseline: nBase > 0 ? nBase : null,
    sesso,
    motivo: motivo.trim(),
  }, avvisiCorpo);

  return (
    <div className="screen">
      <div className="onb-dots">
        {[0, 1, 2, 3].map((i) => <span key={i} className={`onb-dot ${i <= passo ? 'onb-dot-on' : ''}`} />)}
      </div>

      {passo === 0 && (
        <>
          <h1 className="screen-title">Quanto costa il tuo pacchetto?</h1>
          <p className="screen-sub">
            È la prima cosa che mi serve. Da qui in poi ogni sigaretta che <b>non</b> fumi diventa un
            numero che vedi crescere, giorno dopo giorno.
          </p>
          <div className="row-2">
            <div className="field-group">
              <label className="field-label"><Wallet size={13} /> Prezzo del pacchetto</label>
              <input className="text-input" inputMode="decimal" placeholder="6,00" value={prezzo}
                onChange={(e) => setPrezzo(e.target.value)} autoFocus />
            </div>
            <div className="field-group">
              <label className="field-label">Quante ne contiene</label>
              <input className="text-input" type="number" inputMode="numeric" value={perPacchetto}
                onChange={(e) => setPerPacchetto(e.target.value)} />
            </div>
          </div>
          {unitario > 0 && (
            <div className="onb-eco">
              Una sigaretta ti costa <b>{eur(unitario)}</b>. Ogni volta che ne salti una, quei
              centesimi finiscono nel contatore.
            </div>
          )}
          <button className="btn btn-primary btn-block" disabled={!(nPrezzo > 0)} onClick={() => setPasso(1)}>Continua</button>
        </>
      )}

      {passo === 1 && (
        <>
          <h1 className="screen-title">Quante ne fumi in una giornata normale?</h1>
          <p className="screen-sub">
            Una stima basta: serve a costruire il primo piano e a sapere da quale ritmo stai
            scendendo. Dalla settimana prossima uso i numeri veri che avrai registrato.
          </p>
          <input className="text-input" type="number" inputMode="numeric" placeholder="Es. 15"
            value={baseline} onChange={(e) => setBaseline(e.target.value)} autoFocus />
          <div className="trigger-chips">
            {[5, 10, 15, 20, 30].map((n) => (
              <button key={n} className="trigger-chip" onClick={() => setBaseline(String(n))}>{n}</button>
            ))}
          </div>

          {nBase > 0 && unitario > 0 && (
            <div className="onb-eco">
              A questo ritmo spendi <b>{eur0(nBase * unitario * 365)}</b> all'anno, e ogni giorno
              se ne vanno <b>{tempoVita(nBase * MINUTI_PER_SIGARETTA[sesso])}</b> di vita attesa.
            </div>
          )}

          <div className="field-group" style={{ marginTop: 20 }}>
            <label className="field-label"><Hourglass size={13} /> Per il calcolo dei minuti</label>
            <div className="trigger-chips">
              {[['uomo', 'uomo · 17 min'], ['donna', 'donna · 22 min'], ['non_detto', 'preferisco non dirlo · 20 min']].map(([k, l]) => (
                <button key={k} className={`trigger-chip ${sesso === k ? 'trigger-chip-on' : ''}`} onClick={() => setSesso(k)}>{l}</button>
              ))}
            </div>
            <p className="micro-hint">
              Lo studio UCL del 2024 stima 17 minuti di vita persi per sigaretta negli uomini e 22
              nelle donne. Se preferisci non rispondere uso la media di 20.
            </p>
          </div>

          <button className="btn btn-primary btn-block" onClick={() => setPasso(2)}>Continua</button>
          <button className="link-btn onb-skip" onClick={() => setPasso(2)}>Non lo so</button>
        </>
      )}

      {passo === 2 && (
        <>
          <h1 className="screen-title">Perché vuoi smettere?</h1>
          <p className="screen-sub">
            Te lo rimetto davanti agli occhi nel momento in cui starai per accendere. Scrivilo come
            lo diresti a voce, non come una frase da manuale.
          </p>
          <input className="text-input" placeholder="Es. Voglio rincorrere mio figlio senza fermarmi"
            value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          <div className="trigger-chips">
            {MOTIVI.map((m) => <button key={m} className="trigger-chip" onClick={() => setMotivo(m)}>{m}</button>)}
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 22 }} onClick={() => setPasso(3)}>Continua</button>
          <button className="link-btn onb-skip" onClick={() => setPasso(3)}>Salta</button>
        </>
      )}

      {passo === 3 && (
        <>
          <h1 className="screen-title">Ti avviso quando il tuo corpo cambia</h1>
          <p className="screen-sub">
            Ogni volta che passi una soglia dall'ultima sigaretta ti arriva un messaggio. Non sono
            promemoria: sono cose che stanno succedendo davvero mentre non fumi.
          </p>

          <div className="anteprima-notifiche">
            {[TAPPE[1], TAPPE[3], TAPPE[4]].map((t) => (
              <div key={t.avviso} className="anteprima-notifica">
                <div className="anteprima-mark"><BrandMark size={22} /></div>
                <div>
                  <div className="anteprima-titolo">{t.avviso} 🫁</div>
                  <div className="anteprima-testo">{t.avvisoTesto}</div>
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-primary btn-block" onClick={async () => { await onChiediPermesso(); chiudi(true); }}>
            Attiva gli avvisi
          </button>
          <button className="link-btn onb-skip" onClick={() => chiudi(false)}>Non ora</button>

          <div className="motto" style={{ marginTop: 22 }}>
            <span className="motto-testo">{MANTRA}</span>
            <span className="motto-coda">Se ricadi, riprova.</span>
          </div>
        </>
      )}
    </div>
  );
}
