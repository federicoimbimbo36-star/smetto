import { useId } from 'react';

/* ------------------------------------------------------------------ */
/*  LA PIANTA                                                          */
/*                                                                     */
/*  È l'unico elemento decorativo dell'app, ed è anche il suo unico    */
/*  meccanismo di ricompensa. Regola fondamentale: NON TORNA MAI       */
/*  INDIETRO. Cresce con i giorni di percorso — non con i giorni       */
/*  senza fumare — perché una ricaduta non deve cancellare quello che  */
/*  è già stato fatto. È la stessa cosa che dice la schermata dopo una */
/*  ricaduta ("quei 20 giorni non sono andati persi"), detta con un    */
/*  disegno invece che con una frase.                                  */
/*                                                                     */
/*  Non è un albero cartoon: stelo e foglie sono tratti, il verde è    */
/*  quello del sistema, e l'unico tocco caldo è il fiore che compare   */
/*  a 90 giorni.                                                       */
/* ------------------------------------------------------------------ */

export const STADI = [
  { da: 0,  h: 0,   foglie: 0,  nome: 'Il seme è nella terra' },
  { da: 1,  h: 36,  foglie: 2,  nome: 'Germoglio' },
  { da: 3,  h: 58,  foglie: 3,  nome: 'Sta spuntando' },
  { da: 7,  h: 82,  foglie: 4,  nome: 'Una settimana di radici' },
  { da: 14, h: 104, foglie: 5,  nome: 'Piccola pianta' },
  { da: 30, h: 126, foglie: 6,  nome: 'Pianta sviluppata' },
  { da: 90, h: 142, foglie: 7,  nome: 'In fiore', fiore: true },
];

export function stadioPer(giorni) {
  let i = 0;
  for (let k = 0; k < STADI.length; k += 1) if (giorni >= STADI[k].da) i = k;
  return { ...STADI[i], indice: i };
}

/* La foglia: una mandorla asimmetrica disegnata dall'origine verso
   destra. Le foglie di sinistra sono la stessa forma specchiata, così
   ce n'è una sola da mantenere. */
const FOGLIA = 'M0 0 C7 -9 19 -12 28 -6 C21 3 8 6 0 0 Z';

const SUOLO = 166;
const CENTRO = 80;

/* Lo stelo non è una retta: oscilla appena, altrimenti sembra un'asta.
   Campionato in 26 punti invece che disegnato con curve di Bézier —
   a questa dimensione i segmenti sono da 5px e la linea è già morbida,
   e i punti servono comunque per attaccarci le foglie. */
const xStelo = (t) => CENTRO + Math.sin(t * 2.4) * 3.4;

export default function Pianta({ giorni = 0, dimensione = 220, mostraStadio = true }) {
  const uid = useId();
  const st = stadioPer(giorni);
  const { h, foglie, fiore } = st;

  const punti = [];
  for (let i = 0; i <= 26; i += 1) {
    const t = i / 26;
    punti.push(`${xStelo(t).toFixed(1)},${(SUOLO - h * t).toFixed(1)}`);
  }
  const stelo = `M${punti.join(' L')}`;

  const tMin = foglie <= 2 ? 0.5 : 0.2;
  // la cima resta sgombra: è lì che a 90 giorni si apre il fiore, ed è
  // anche quello che rende leggibile la silhouette a 70px nel Profilo
  const tMax = fiore ? 0.84 : 0.9;
  const lista = Array.from({ length: foglie }, (_, i) => {
    const passo = foglie === 1 ? 1 : (i / (foglie - 1)) ** 1.15;
    const t = tMin + passo * (tMax - tMin);
    const verso = i % 2 === 0 ? 1 : -1;
    /* Le foglie in basso sono più grandi e CADONO, quelle in cima sono più
       piccole e si alzano. Senza questa escursione (56 gradi fra la prima
       e l'ultima) le foglie restano orizzontali e la pianta legge come una
       scala a pioli invece che come una cosa viva. */
    const scala = 1.05 - t * 0.35;
    const rotazione = 26 - t * 58;
    return {
      t, verso, scala, rotazione,
      // mezzo tratto dentro lo stelo, altrimenti la foglia sembra staccata
      x: xStelo(t) - verso * 1.2,
      y: SUOLO - h * t,
      key: `${uid}-f${i}`,
    };
  });

  const cima = { x: xStelo(1), y: SUOLO - h };

  return (
    <div className="pianta-wrap" style={{ height: dimensione }}>
      <span className="pianta-luce" />
      <svg
        className="pianta-svg" width={dimensione} height={dimensione}
        viewBox="0 0 160 180" fill="none" role="img"
        aria-label={`Il tuo percorso: ${st.nome.toLowerCase()}, giorno ${giorni + 1}`}
      >
        <line
          x1={CENTRO - 26 - h * 0.14} y1={SUOLO}
          x2={CENTRO + 26 + h * 0.14} y2={SUOLO}
          className="pianta-terra"
        />

        <g className="pianta-dondolo">
          {h === 0 ? (
            <ellipse cx={CENTRO} cy={SUOLO - 5} rx="7" ry="9" className="pianta-seme pianta-parte" />
          ) : (
            <>
              <path d={stelo} className="pianta-stelo pianta-parte" />

              {lista.map((f, i) => (
                <path
                  key={f.key} d={FOGLIA}
                  className={`pianta-foglia pianta-parte ${foglie > 4 && i < foglie / 2 ? 'pianta-foglia-piena' : ''}`}
                  style={{ animationDelay: `${0.12 + i * 0.07}s` }}
                  /* l'ordine conta: ruota nel suo spazio, poi la scala
                     negativa specchia anche la rotazione, poi si posa */
                  transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) scale(${(f.verso * f.scala).toFixed(3)} ${f.scala.toFixed(3)}) rotate(${f.rotazione.toFixed(1)})`}
                />
              ))}

              {fiore && (
                <g
                  className="pianta-parte"
                  style={{ animationDelay: '0.7s' }}
                  transform={`translate(${cima.x.toFixed(1)} ${(cima.y - 4).toFixed(1)})`}
                >
                  {[0, 72, 144, 216, 288].map((a) => (
                    <ellipse
                      key={a} cx="0" cy="-7" rx="4.6" ry="7.4"
                      className="pianta-fiore" transform={`rotate(${a})`}
                    />
                  ))}
                  <circle cx="0" cy="0" r="3.4" className="pianta-fiore-cuore" />
                </g>
              )}
            </>
          )}
        </g>
      </svg>
      {mostraStadio && <p className="pianta-stadio">{st.nome}</p>}
    </div>
  );
}
