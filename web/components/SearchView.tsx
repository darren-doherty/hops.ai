import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatFull, relativeTime } from '../format';
import { useStore } from '../store';
import { Avatar } from './Avatar';
import { MessageBody } from './MessageBody';
import type { SearchHit } from '../../shared/types';

type Result = { state: 'loading' } | { state: 'error'; message: string } | { state: 'done'; hits: SearchHit[] };

/** Search is a separate, eventually consistent system: say so rather than pretend otherwise. */
export function SearchView({ q }: { q: string }) {
  const [result, setResult] = useState<Result>({ state: 'loading' });
  const usersById = useStore((s) => s.usersById);
  const channels = useStore((s) => s.channels);
  const setView = useStore((s) => s.setView);
  const setHighlight = useStore((s) => s.setHighlight);

  useEffect(() => {
    let cancelled = false;
    setResult({ state: 'loading' });
    api
      .search(q)
      .then((hits) => !cancelled && setResult({ state: 'done', hits }))
      .catch((err) => !cancelled && setResult({ state: 'error', message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [q]);

  const open = (hit: SearchHit) => {
    setView({ kind: 'channel', channelId: hit.channelId });
    setHighlight(hit.parentId ?? hit.id); // replies: show their thread's root (thread panel comes in Phase 3)
  };

  return (
    <>
      <header className="main-header">
        <h1>Search</h1>
        <span className="muted topic">Results for “{q}”</span>
      </header>
      <div className="search-results">
        {result.state === 'loading' && <div className="empty muted">Searching…</div>}
        {result.state === 'error' && <div className="empty notice">{result.message}</div>}
        {result.state === 'done' && result.hits.length === 0 && (
          <div className="empty muted">No results. Very recent messages can take a moment to become searchable.</div>
        )}
        {result.state === 'done' &&
          result.hits.map((hit) => {
            const channel = channels.find((c) => c.id === hit.channelId);
            return (
              <button key={hit.id} className="search-hit" onClick={() => open(hit)}>
                <Avatar user={usersById[hit.authorId]} size={28} />
                <div>
                  <div className="message-meta">
                    <span className="author">{usersById[hit.authorId]?.name}</span>
                    <span className="muted">
                      {channel?.kind === 'dm' ? channel.name : `#${channel?.name}`}
                      {hit.parentId && ' · in a thread'}
                    </span>
                    <span className="muted" title={formatFull(hit.createdAt)}>
                      {relativeTime(hit.createdAt)}
                    </span>
                  </div>
                  <div className="message-body">
                    <MessageBody text={hit.body} highlight={q} />
                  </div>
                </div>
              </button>
            );
          })}
      </div>
    </>
  );
}
