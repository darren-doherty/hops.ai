import type { UserDto } from '../../shared/types';

export function Avatar({ user, size = 32 }: { user: UserDto | undefined; size?: number }) {
  const initials = (user?.name ?? '?')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');
  return (
    <span
      className="avatar"
      style={{ background: user?.color ?? '#999', width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
