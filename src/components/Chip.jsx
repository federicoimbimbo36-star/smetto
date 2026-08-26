export default function Chip({ children, tone = 'muted' }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}
