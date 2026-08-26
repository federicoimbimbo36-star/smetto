export default function BrandMark({ size = 34 }) {
  /* Stesso marchio dell'icona dell'app (vedi strumenti/genera-icone.py):
     la sigaretta in orizzontale e la brace accesa all'estremità — l'unica
     luce del sistema. In verticale leggerebbe come un punto esclamativo,
     che è il segnale opposto a quello che quest'app vuole dare. */
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <circle cx="7" cy="15" r="5.2" fill="#F0A23C" opacity=".15" />
      <circle cx="7" cy="15" r="2.7" fill="#F0A23C" />
      <rect x="10.6" y="13" width="12.8" height="4" rx="2" fill="#F2EDE4" />
      <rect x="19.4" y="13" width="4" height="4" rx="2" fill="#C96A1E" />
    </svg>
  );
}
