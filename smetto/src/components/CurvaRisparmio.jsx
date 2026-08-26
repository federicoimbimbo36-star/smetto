import { useId } from 'react';

/* curva cumulativa del risparmio, giorno per giorno.
   Può scendere sotto lo zero: sopra si riempie di verde, sotto di brace. */
export default function CurvaRisparmio({ punti }) {
  // id univoci per istanza: se in futuro compare più di una CurvaRisparmio
  // sulla stessa pagina, i clipPath non si sovrascrivono più a vicenda.
  const uid = useId();
  const idSopra = `curva-sopra-${uid}`;
  const idSotto = `curva-sotto-${uid}`;

  if (!punti || punti.length < 2) return null;
  const W = 300;
  const H = 92;
  const PAD = 10;
  const valori = punti.map((p) => p.v);
  const alto = Math.max(...valori, 0);
  const basso = Math.min(...valori, 0);
  const span = alto - basso || 1;
  const y = (v) => PAD + (1 - (v - basso) / span) * (H - PAD * 2);

  const xy = punti.map((p, i) => [(i / (punti.length - 1)) * W, y(p.v)]);
  const yZero = y(0);
  const linea = xy.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = `${linea} L${W},${yZero.toFixed(1)} L0,${yZero.toFixed(1)} Z`;
  const ultimo = xy[xy.length - 1];
  const negativa = punti[punti.length - 1].v < 0;

  return (
    <div className="curva">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="curva-svg">
        <defs>
          <clipPath id={idSopra}><rect x="0" y="0" width={W} height={Math.max(0, yZero)} /></clipPath>
          <clipPath id={idSotto}><rect x="0" y={yZero} width={W} height={Math.max(0, H - yZero)} /></clipPath>
        </defs>
        <path d={area} className="curva-area-pos" clipPath={`url(#${idSopra})`} />
        <path d={area} className="curva-area-neg" clipPath={`url(#${idSotto})`} />
        <line x1="0" y1={yZero} x2={W} y2={yZero} className="curva-zero" vectorEffect="non-scaling-stroke" />
        <path d={linea} className={`curva-linea ${negativa ? 'curva-linea-neg' : ''}`} vectorEffect="non-scaling-stroke" />
        <circle cx={ultimo[0]} cy={ultimo[1]} r="3.5"
          className={`curva-punto ${negativa ? 'curva-punto-neg' : ''}`} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="curva-assi">
        <span>{punti[0].label}</span>
        <span>oggi</span>
      </div>
    </div>
  );
}
