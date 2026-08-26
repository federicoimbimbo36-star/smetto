import { useState } from 'react';
import { Flag, Bell, Check, Heart } from 'lucide-react';
import { TRIGGER } from '../constants';
import { eurSegno, eur0, tempoVita, dec, durata } from '../utils/format';
import { CurvaRisparmio, Progresso, Motto } from '../components';

export default function PianoScreen({ s, piano, conti, tappe, dati, onSalvaPiano, onModificaMotivo }) {
  const [aperto, setAperto] = useState(null);
  const [bozza, setBozza] = useState('');

  const apri = (t) => { setAperto(t); setBozza(dati.plans?.[t] || ''); };
  const conferma = () => { onSalvaPiano(aperto, bozza.trim()); setAperto(null); };

  return (
    <div className="screen">
      <h1 className="screen-title">Il piano</h1>

      {conti && (
        <>
          <div className={`hero-conto ${conti.inRosso ? 'hero-rosso' : ''}`}>
            <div className="hero-eyebrow">{conti.inRosso ? 'SOPRA IL TUO RITMO DI PARTENZA' : 'RISPARMIATO FINORA'}</div>
            <div className="hero-val num">{eurSegno(conti.risparmiato)}</div>
            <div className="hero-sub">
              {conti.evitate >= 1 ? (
                <>sono <b>{Math.floor(conti.evitate)}</b> sigarette che non hai fumato rispetto al tuo ritmo di partenza ({dec(conti.baseline)} al giorno)</>
              ) : conti.evitate <= -1 ? (
                <>sei <b>{Math.abs(Math.ceil(conti.evitate))}</b> sigarette sopra il ritmo da cui sei partito ({dec(conti.baseline)} al giorno). Il numero torna verde appena scendi sotto.</>
              ) : (
                <>sei in pari col tuo ritmo di partenza ({dec(conti.baseline)} al giorno)</>
              )}
            </div>
            <CurvaRisparmio punti={conti.curva} />
            <div className="hero-riga">
              <div><span className={`num ${conti.oggiRisparmio < 0 ? 'rosso' : ''}`}>{eurSegno(conti.oggiRisparmio)}</span><small>oggi</small></div>
              <div><span className={`num ${conti.settimana < 0 ? 'rosso' : ''}`}>{eurSegno(conti.settimana)}</span><small>questa settimana</small></div>
              <div><span className={`num ${conti.annoProiezione < 0 ? 'rosso' : ''}`}>{eur0(conti.annoProiezione)}</span><small>in un anno così</small></div>
            </div>
          </div>

          <div className={`hero-conto hero-vita ${conti.inRosso ? 'hero-rosso' : ''}`}>
            <div className="hero-eyebrow">{conti.inRosso ? 'VITA BRUCIATA IN PIÙ' : 'VITA NON BRUCIATA'}</div>
            <div className="hero-val num">{tempoVita(conti.minutiSalvati)}</div>
            <div className="hero-sub">
              A {conti.minutiPer} minuti per sigaretta, {conti.inRosso
                ? 'è il tempo che stai perdendo oltre a quello che perdevi già prima.'
                : 'sono i minuti che ti sei tenuto rispetto al ritmo da cui sei partito.'}
            </div>
            <div className="hero-riga">
              <div><span className="num">{tempoVita(conti.minutiPersiTotali)}</span><small>persi in totale</small></div>
              <div><span className="num">{tempoVita(conti.minutiPersiOggi)}</span><small>persi oggi</small></div>
              <div><span className="num">{tempoVita(conti.minutiAnnoRitmo)}</span><small>in un anno così</small></div>
            </div>
            <p className="fonte">
              Stima da Jackson, Jarvis e West, <i>The price of a cigarette: 20 minutes of life?</i>,
              Addiction 2024 (UCL): 17 minuti per gli uomini, 22 per le donne. È una media di
              popolazione, non una previsione sulla tua vita.
            </p>
          </div>
        </>
      )}

      {dati.profile?.motivo ? (
        <button className="motivo-card" onClick={onModificaMotivo}>
          <div className="eyebrow-row"><span>PERCHÉ LO STAI FACENDO</span></div>
          <p className="motivo-testo">“{dati.profile.motivo}”</p>
        </button>
      ) : (
        <button className="btn btn-ghost btn-block" onClick={onModificaMotivo}>Scrivi il tuo motivo</button>
      )}

      {piano && (
        <>
          <div className="traguardo">
            <div className="traguardo-icona"><Flag size={18} /></div>
            <div>
              <div className="traguardo-eyebrow">SIGARETTA ZERO PREVISTA</div>
              <div className="traguardo-data">{piano.dataZero}</div>
              <div className="traguardo-sub num">tra {piano.settimaneRestanti} settimane, se tieni questo passo</div>
            </div>
          </div>

          <div className="eyebrow-row section-gap"><span>LE PROSSIME SETTIMANE</span></div>
          <div className="piano-lista">
            {piano.righe.map((r) => (
              <div key={r.n} className={`piano-riga ${r.corrente ? 'piano-corrente' : ''}`}>
                <span className="piano-n num">S{r.n}</span>
                <span className="piano-data faint">{r.data}</span>
                <div className="piano-barra"><div className="piano-barra-fill" style={{ width: `${r.perc}%` }} /></div>
                <span className="piano-val num">{r.media < 0.5 ? '0' : dec(r.media)}</span>
              </div>
            ))}
          </div>
          <p className="micro-hint">
            Ogni settimana togli il 15% alla media della precedente, e almeno una sigaretta al giorno
            quando i numeri si abbassano. Il piano si ricalcola sui dati veri, non su questa previsione.
          </p>
        </>
      )}

      <div className="eyebrow-row section-gap"><span>COSA STA RECUPERANDO IL CORPO</span></div>
      <p className="micro-hint" style={{ marginTop: 8 }}>
        Il conto riparte da ogni sigaretta. Sei a {s?.ultima ? durata(Date.now() - s.ultima) : '—'} dall'ultima.
      </p>

      {s?.prossimaTappa && (
        <div className="prossimo-avviso">
          <Bell size={15} />
          <div>
            <b>Prossimo avviso tra {durata(s.prossimaTappa.mancano)}</b>
            <div>{s.prossimaTappa.avvisoTesto}</div>
          </div>
        </div>
      )}
      <div className="tappe">
        {tappe.map((t) => (
          <div key={t.titolo} className={`tappa ${t.raggiunta ? 'tappa-ok' : ''} ${t.corrente ? 'tappa-corrente' : ''}`}>
            <div className="tappa-icona">{t.raggiunta ? <Check size={14} /> : <Heart size={13} />}</div>
            <div className="tappa-corpo">
              <div className="tappa-head">
                <span className="tappa-titolo">{t.titolo}</span>
                <span className="tappa-quando num faint">{t.quando}</span>
              </div>
              <p className="tappa-testo">{t.testo}</p>
              {t.corrente && <Progresso valore={t.progresso} />}
            </div>
          </div>
        ))}
      </div>

      <div className="eyebrow-row section-gap"><span>I TUOI SE–ALLORA</span></div>
      <p className="micro-hint" style={{ marginTop: 8 }}>
        Decidere prima cosa farai al posto della sigaretta funziona molto meglio che resistere sul
        momento. Scrivilo per le situazioni che ti fregano più spesso.
      </p>
      <div className="plans">
        {TRIGGER.map((t) => (
          <div key={t} className="plan-row">
            <div className="plan-trigger">se {t}</div>
            {aperto === t ? (
              <div className="plan-edit">
                <input className="text-input" autoFocus value={bozza} onChange={(e) => setBozza(e.target.value)}
                  placeholder="allora… esco a fare due passi" onKeyDown={(e) => { if (e.key === 'Enter') conferma(); }} />
                <button className="btn btn-primary" onClick={conferma}>Salva</button>
              </div>
            ) : (
              <button className="plan-value" onClick={() => apri(t)}>
                {dati.plans?.[t] ? `allora ${dati.plans[t]}` : <span className="faint">tocca per scrivere il tuo piano</span>}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="aiuto-box">
        <div className="aiuto-titolo">Non sei obbligato a farlo a mani nude</div>
        <p>
          Cerotti, gomme e farmaci su prescrizione raddoppiano le probabilità di riuscirci rispetto
          alla sola forza di volontà, e i centri antifumo pubblici sono gratuiti. Parlane col medico
          o in farmacia: usare un aiuto non è barare.
        </p>
        <p className="aiuto-numero">Telefono Verde contro il Fumo (ISS): <b>800 554 088</b></p>
      </div>

      <Motto />
    </div>
  );
}
