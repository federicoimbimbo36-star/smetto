import { initials } from '../utils/format';

export default function AvatarCircle({ name, color, size = 40 }) {
  return (
    <div className="avatar-circle" style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}>
      {initials(name)}
    </div>
  );
}
