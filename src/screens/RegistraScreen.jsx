import { Check, X, Wind } from 'lucide-react';
import { TRIGGER } from '../constants';
import { eur, eurSegno, tempoVita, durata, dec } from '../utils/format';
import { Mozzicone, Progresso, Motto, StrisciaStop } from '../components';

export default function RegistraScreen({
  s, conti, now, ultimoTs, gruppi, tappaBanner, onChiudiBanner, record,
  checkedIn, onCheckin, onFuma, onCraving, onAnnulla, onTag, onSkipTag, onVaiAlPiano,
}) {
  const primaSett = !s || s.sett === 0;
  const senzaFumare = s?.ultima ? now - s.ultima : 0;
  const inStop = s && s.oggi === 0 && s.ultima && senzaFumare >= 12 * 3600000;

  return (
    <div className="screen screen-registra">
      <div className="reg-top">
        <div className="eyebrow-row">
          <span>{s ? `GIORNO ${s.giorno + 1} · SETTIMANA ${s.sett + 1}` : 'PRIMO GIORNO'}</span>
          {gruppi.length > 0 && (
            <span className="eyebrow-green">
              {gruppi.length === 1 ? gruppi[0].name : `${gruppi.length} GRUPPI`}
            </span>
          )}
        </div>

        {tappaBanner && (
          <div className="tappa-banner">
            <div className="tappa-banner-icona"><Check size={16} /></div>
            <div className="tappa-banner-corpo">
              <div className="tappa-banner-titolo">{tappaBanner.avviso}</div>
              <p className="tappa-banner-testo">{tappaBanner.avvisoTesto}</p>
            </div>
            <button className="tappa-banner-close" onClick={onChiudiBanner} aria-label="Chiudi"><X size={16} /></button>
          </div>
        )}

        {conti && (
          <button className={`conti ${conti.inRosso ? 'conti-rosso' : ''}`} onClick={onVaiAlPiano}>
            <div className="conti-cell">
              <div className="conti-val num">{eurSegno(conti.risparmiato)}</div>
              <div className="conti-lab">{conti.inRosso ? 'spesi oltre il tuo ritmo' : 'risparmiati'}</div>
            </div>
            <div className="conti-sep" />
            <div className="conti-cell">
              <div className="conti-val num">{tempoVita(conti.minutiSalvati)}</div>
              <div className="conti-lab">{conti.inRosso ? 'di vita bruciata in più' : 'di vita non bruciata'}</div>
            </div>
          </button>
        )}

        {inStop ? (
          <StrisciaStop ms={senzaFumare} record={record?.piuLungo || 0} checkedIn={checkedIn} onCheckin={onCheckin} />
        ) : (
          <>
            <div className="reg-count">
              <span className="reg-number num">{s ? s.oggi : 0}</span>
              <span className="reg-unit">
                oggi
                {s && s.budget !== null && <span className="reg-budget num"> / {s.budget} nel budget</span>}
                {conti && s && s.oggi > 0 && (
                  <span className="reg-budget num"> · {eur(s.oggi * conti.unitario)} e {tempoVita(s.oggi * conti.minutiPer)}</span>
                )}
              </span>
            </div>

            <div className="butt-row">
              {s && Array.from({ length: Math.max(s.oggi, s.budget ?? 0) }, (_, i) => (
                <Mozzicone key={i}
                  stato={i < s.oggi ? (s.budget !== null && i >= s.budget ? 'oltre' : 'pieno') : 'vuoto'}
                  acceso={i === s.oggi - 1 && ultimoTs !== null} />
              ))}
              {(!s || (s.oggi === 0 && s.budget === null)) && <span className="muted-line">nessuna ancora</span>}
            </div>
          </>
        )}
      </div>

      <div className="tap-zone">
        <div className="tap-wrap">
          {ultimoTs && <div key={ultimoTs} className="anello" />}
          <button className="big-plus" onClick={onFuma} aria-label="Registra una sigaretta fumata">+</button>
        </div>
        <div className="eyebrow-row eyebrow-center"><span>HO FUMATO UNA SIGARETTA</span></div>
        <p className="muted-line num tap-last">
          {s && s.ultima ? `ultima ${durata(now - s.ultima)} fa` : 'il primo tap fa partire la misura'}
        </p>
      </div>

      <div className="reg-bottom">
        {ultimoTs ? (
          <>
            <button className="link-btn undo" onClick={onAnnulla}>ANNULLA L'ULTIMA</button>
            <div className="trigger-sheet">
              <div className="eyebrow-row"><span>COS'ERA?</span></div>
              <div className="trigger-chips">
                {TRIGGER.map((t) => <button key={t} className="trigger-chip" onClick={() => onTag(ultimoTs, t)}>{t}</button>)}
                <button className="trigger-skip" onClick={onSkipTag}>salta</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <button className="btn btn-craving" onClick={onCraving}>
              <Wind size={17} /> Sto per fumare — aiutami
            </button>

            {s && s.prossimaTappa && (
              <div className="tappa-mini">
                <div className="tappa-mini-head">
                  <span>{s.prossimaTappa.titolo}</span>
                  <span className="num faint">tra {durata(s.prossimaTappa.mancano)}</span>
                </div>
                <Progresso valore={s.prossimaTappa.progresso} />
              </div>
            )}

            <p className="goal-inline">
              {primaSett
                ? 'Settimana di misura: fuma come al solito, serve a sapere da dove parti.'
                : s.obiettivo < 0.5
                  ? 'Obiettivo di questa settimana: zero sigarette.'
                  : `Obiettivo di questa settimana: massimo ${dec(s.obiettivo)} al giorno.`}
            </p>

            <Motto compatto />
          </>
        )}
      </div>
    </div>
  );
}
