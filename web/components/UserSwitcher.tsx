import type { UserDto } from '../../shared/types';
import { Avatar } from './Avatar';

function switchTo(handle: string) {
  const url = new URL(location.href);
  url.searchParams.set('as', handle);
  location.href = url.toString();
}

/** Compact switcher at the top of the sidebar. Full reload keeps state handling trivial. */
export function UserSwitcher({ me, users }: { me: UserDto; users: UserDto[] }) {
  return (
    <label className="user-switcher" title="Switch user (demo only: no real auth)">
      <Avatar user={me} size={28} />
      <select value={me.handle} onChange={(e) => switchTo(e.target.value)}>
        {users.map((u) => (
          <option key={u.id} value={u.handle}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Shown when there is no ?as= in the URL. */
export function UserPicker({ users, notice }: { users: UserDto[]; notice: string | null }) {
  return (
    <div className="picker">
      <h1>Hops</h1>
      <p className="muted">Pick someone to be. Open another window as someone else to see realtime updates.</p>
      {notice && <p className="notice">{notice}</p>}
      <ul>
        {users.map((u) => (
          <li key={u.id}>
            <button onClick={() => switchTo(u.handle)}>
              <Avatar user={u} size={24} /> {u.name} <span className="muted">@{u.handle}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
