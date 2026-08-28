import { Sun, Sprout, Wind, User } from 'lucide-react';

/* Quattro voci, non cinque: il gruppo non è sparito, è dentro Aiuto —
   che è esattamente cosa fa (qualcuno che ti guarda mentre smetti).
   Icone lineari, nessun riempimento, la sola attiva è verde. */
const VOCI = [
  { id: 'oggi', Icona: Sun, label: 'Oggi' },
  { id: 'percorso', Icona: Sprout, label: 'Percorso' },
  { id: 'aiuto', Icona: Wind, label: 'Aiuto' },
  { id: 'profilo', Icona: User, label: 'Profilo' },
];

export default function BottomNav({ active, onChange, badge }) {
  return (
    <nav className="bottom-nav" aria-label="Navigazione principale">
      {VOCI.map(({ id, Icona, label }) => {
        const attivo = active === id;
        return (
          <button
            key={id} className={`nav-item ${attivo ? 'nav-item-attivo' : ''}`}
            onClick={() => onChange(id)} aria-current={attivo ? 'page' : undefined}
          >
            <span className="nav-icona">
              <Icona size={22} strokeWidth={attivo ? 2.3 : 1.8} />
              {id === 'aiuto' && badge > 0 && (
                <span className="nav-pallino">{badge > 9 ? '9+' : badge}</span>
              )}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
