/* Barre morbide, non un grafico finanziario: angoli tondi, verde tenue,
   e la colonna evidenziata piena. La riga tratteggiata del budget resta,
   ma disegnata con il filo verde invece che con una linea d'allarme. */
export default function Barre({ dati, budget, evidenzia }) {
  const max = Math.max(1, budget ?? 0, ...dati.map((d) => d.n));
  const ALTEZZA = 96;
  return (
    <div className="grafico">
      {budget != null && (
        <div className="grafico-budget" style={{ bottom: 26 + (budget / max) * ALTEZZA }}>
          <div className="grafico-budget-linea" />
          <span className="grafico-budget-tag num">max {budget}</span>
        </div>
      )}
      <div className="grafico-colonne">
        {dati.map((d, i) => (
          <div className="grafico-col" key={i}>
            <span className={`grafico-valore num ${d.futuro ? 'invisibile' : ''}`}>{d.n}</span>
            <div
              className={`grafico-barra ${d.futuro ? 'grafico-barra-futuro' : ''} ${evidenzia === i ? 'grafico-barra-oggi' : ''}`}
              style={{ height: d.futuro ? 0 : Math.max(4, (d.n / max) * ALTEZZA) }}
            />
            <span className="grafico-giorno">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
