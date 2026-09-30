import { useState } from 'react';
import { useStore } from '../store';
import { Icon } from './Icon';

export function SearchBox() {
  const [q, setQ] = useState('');
  const setView = useStore((s) => s.setView);

  return (
    <form
      className="search-box"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim().length >= 2) setView({ kind: 'search', q: q.trim() });
      }}
    >
      <Icon name="search" size={14} />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages" aria-label="Search messages" />
    </form>
  );
}
