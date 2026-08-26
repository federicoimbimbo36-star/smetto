export default function BrandMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <rect x="9" y="6" width="12" height="15" fill="#F6F6F3" stroke="#C6C7C0" />
      <rect x="9" y="21" width="12" height="6" fill="#BE8850" />
      <circle cx="15" cy="5" r="2.6" fill="#E24A17" />
    </svg>
  );
}
