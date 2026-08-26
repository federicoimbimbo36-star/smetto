import { eur, eurSegno, tempoVita, dec, durata, ora, etichettaGiorno } from '../utils/format';
import { Barre } from '../components';

export default function RecapScreen({ s, mese, registro, tags, now, periodo, setPeriodo, onElimina, record, conti }) {
  return (
    <div className="screen">
      <h1 className="screen-title">Recap</h1>

      <div className="segmented">
        {['giorno', 'settimana', 'mese'].map((p) => (
          <button key={p} className={periodo === p ? 'segmented-item active' : 'segmented-item'} onClick={() => setPeriodo(p)}>
            {p === 'giorno' ? 'Giorno' : p === 'settimana' ? 'Settimana' : 'Mese'}
          </button>
        ))}
      </div>

      {!s && <p className="muted-line">Registra la prima sigaretta e qui comparirà il tuo recap.</p>}

      {s && periodo === 'giorno' && (
        <>
          <div className="avg-row">
            <span className="avg-number num">{s.oggi}</span>
            <span className="avg-label">sigarette oggi</span>
          </div>
          <p className="avg-delta num">
            {s.ieri === null ? 'primo giorno registrato'
              : s.oggi === s.ieri ? `come ieri (${s.ieri})`
                : s.oggi < s.ieri ? <span className="green">▼ {s.ieri - s.oggi} rispetto a ieri ({s.ieri})</span>
                  : `▲ ${s.oggi - s.ieri} rispetto a ieri (${s.ieri})`}
          </p>

          <div className="stat-grid">
            <div className="stat-cell"><div className="stat-value num">{dec(s.media7)}</div><div className="stat-label">media ultimi 7 giorni</div></div>
            <div className="stat-cell"><div className="stat-value num green">{s.resistOggi}</div><div className="stat-label">voglie superate oggi</div></div>
            {conti && <div className="stat-cell"><div className="stat-value num">{eur(s.oggi * conti.unitario)}</div><div className="stat-label">spesi oggi</div></div>}
            {conti && <div className="stat-cell"><div className="stat-value num">{tempoVita(s.oggi * conti.minutiPer)}</div><div className="stat-label">di vita attesa, oggi</div></div>}
            <div className="stat-cell"><div className="stat-value num">{s.intervalloMedio ? durata(s.intervalloMedio) : '—'}</div><div className="stat-label">intervallo medio oggi</div></div>
            <div className="stat-cell"><div className="stat-value">{s.fasciaTop ? s.fasciaTop.label : '—'}</div><div className="stat-label">fascia più a rischio</div></div>
          </div>

          <div className="eyebrow-row section-gap"><span>COME SI DISTRIBUISCE LA GIORNATA</span></div>
          <Barre dati={s.perFascia} budget={null} evidenzia={s.fasciaTopIndex} />

          <div className="divider" />
          <div className="eyebrow-row"><span>IL REGISTRO</span></div>
          {registro.length === 0 && (
            <p className="muted-line" style={{ marginTop: 10 }}>
              Ancora vuoto. Ogni sigaretta compare qui con l'ora e con quanto tempo è passato dalla precedente.
            </p>
          )}
          {registro.map(([giorno, lista]) => (
            <div key={giorno} className="log-day">
              <div className="log-day-head">
                <span>{etichettaGiorno(giorno, now)}</span>
                <span className="num">{lista.length}</span>
              </div>
              {lista.map((t, i) => {
                const prec = lista[i + 1];
                return (
                  <div className="log-row" key={t}>
                    <span className="log-time num">{ora(t)}</span>
                    <span className="log-meta">
                      {tags[t] && <span>{tags[t]}</span>}
                      {tags[t] && prec && ' · '}
                      {prec && <span className="num faint">{durata(t - prec)} dopo</span>}
                    </span>
                    <button className="log-del" onClick={() => onElimina(t)} aria-label={`Elimina la sigaretta delle ${ora(t)}`}>×</button>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}

      {s && periodo === 'settimana' && (
        <>
          <div className="goal-box">
            {s.sett === 0 ? (
              <>
                <div className="goal-headline">SETTIMANA DI MISURA · NESSUN LIMITE</div>
                <p className="goal-note">Serve a sapere da dove parti: l'obiettivo arriva tra {7 - s.giorniTrascorsi} giorni.</p>
              </>
            ) : (
              <>
                <div className="goal-eyebrow">OBIETTIVO SETTIMANA {s.sett + 1}</div>
                <div className="goal-headline goal-big">
                  {s.obiettivo < 0.5 ? 'ZERO SIGARETTE' : `MASSIMO ${dec(s.obiettivo)} AL GIORNO`}
                </div>
                <p className="goal-note num">la settimana scorsa: {dec(s.mediaPrec)} al giorno</p>
              </>
            )}
          </div>

          <div className="avg-row">
            <span className="avg-number num">{dec(s.media)}</span>
            <span className="avg-label">al giorno, questa settimana</span>
          </div>
          {s.mediaPrec !== null && s.mediaPrec > 0 && (
            <p className={`avg-delta num ${s.media <= s.mediaPrec ? 'green' : ''}`}>
              {s.media <= s.mediaPrec ? '▼' : '▲'}{' '}
              {Math.round(Math.abs((s.media - s.mediaPrec) / s.mediaPrec) * 100)}% rispetto a {dec(s.mediaPrec)}
            </p>
          )}

          <Barre dati={s.perGiorno} budget={s.budget} evidenzia={s.indiceOggi} />

          <div className="stat-grid">
            <div className="stat-cell"><div className="stat-value num">{s.settTot}</div><div className="stat-label">totale della settimana</div></div>
            <div className="stat-cell"><div className="stat-value num green">{s.resistSett}</div><div className="stat-label">voglie superate</div></div>
            {conti && (
              <div className="stat-cell">
                <div className={`stat-value num ${conti.settimana < 0 ? 'rosso' : 'green'}`}>{eurSegno(conti.settimana)}</div>
                <div className="stat-label">{conti.settimana < 0 ? 'spesi oltre il tuo ritmo' : 'risparmiati in settimana'}</div>
              </div>
            )}
            <div className="stat-cell"><div className="stat-value num">{s.giorniSottoBudget ?? '—'}</div><div className="stat-label">giorni dentro il budget</div></div>
          </div>

          {s.topTrigger && (
            <p className="trigger-summary">
              <b>{s.topTrigger[0]}</b> ha innescato {s.topTrigger[1]} sigarette su {s.settTot}.
              Scrivi il tuo se–allora per quella situazione: lo trovi nella scheda Piano.
            </p>
          )}
        </>
      )}

      {s && periodo === 'mese' && mese && (
        <>
          <div className="avg-row">
            <span className="avg-number num">{dec(mese.media)}</span>
            <span className="avg-label">al giorno, ultimi 30 giorni</span>
          </div>
          {mese.mediaPrec > 0 && (
            <p className={`avg-delta num ${mese.media <= mese.mediaPrec ? 'green' : ''}`}>
              {mese.media <= mese.mediaPrec ? '▼' : '▲'}{' '}
              {Math.round(Math.abs((mese.media - mese.mediaPrec) / mese.mediaPrec) * 100)}% rispetto ai 30 giorni precedenti
            </p>
          )}

          <div className="eyebrow-row section-gap"><span>MEDIA PER SETTIMANA</span></div>
          <Barre dati={mese.perSettimana} budget={null} evidenzia={mese.perSettimana.length - 1} />

          <div className="stat-grid">
            <div className="stat-cell"><div className="stat-value num">{mese.totale}</div><div className="stat-label">sigarette in 30 giorni</div></div>
            <div className="stat-cell"><div className="stat-value num green">{mese.giorniZero}</div><div className="stat-label">giorni a zero</div></div>
            <div className="stat-cell"><div className="stat-value num">{record.piuLungo ? durata(record.piuLungo) : '—'}</div><div className="stat-label">record: più tempo senza fumare</div></div>
            <div className="stat-cell"><div className="stat-value num green">{mese.resists}</div><div className="stat-label">voglie superate</div></div>
          </div>

          <p className="trigger-summary">
            {mese.risparmiate > 0
              ? `Rispetto al ritmo della tua prima settimana, in questo mese hai fumato ${mese.risparmiate} sigarette in meno.`
              : 'Il confronto con la tua prima settimana diventa leggibile dopo qualche settimana di dati.'}
          </p>
        </>
      )}
    </div>
  );
}
