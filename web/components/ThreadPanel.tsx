import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadThread } from '../actions';
import { useStore } from '../store';
import { Composer } from './Composer';
import { Icon } from './Icon';
import { MessageItem } from './MessageItem';

const GROUP_WINDOW_MS = 5 * 60_000;

export function ThreadPanel({ rootId }: { rootId: string }) {
  const root = useStore((s) => s.messagesById[rootId]);
  const order = useStore((s) => s.threadOrder[rootId]);
  const messagesById = useStore((s) => s.messagesById);
  const channel = useStore((s) => s.channels.find((c) => c.id === root?.channelId));
  const openThread = useStore((s) => s.openThread);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setError(null);
    loadThread(rootId).catch((err) => setError(String(err.message ?? err)));
  }, [rootId]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [order?.length]);

  return (
    <aside className="thread-panel">
      <header className="thread-header">
        <div>
          <h2>Thread</h2>
          {channel && <span className="muted">{channel.kind === 'dm' ? channel.name : `#${channel.name}`}</span>}
        </div>
        <button className="icon-button" onClick={() => openThread(null)} aria-label="Close thread">
          <Icon name="x" />
        </button>
      </header>

      <div className="thread-list" ref={listRef}>
        {error && <div className="empty notice">{error}</div>}
        {root && <MessageItem id={rootId} compact={false} inThread />}
        {order && (
          <div className="thread-divider">
            <span>
              {order.length} {order.length === 1 ? 'reply' : 'replies'}
            </span>
          </div>
        )}
        {order?.map((id, i) => {
          const message = messagesById[id];
          const prev = i > 0 ? messagesById[order[i - 1]] : undefined;
          const compact =
            !!prev &&
            prev.authorId === message.authorId &&
            prev.status === 'active' &&
            new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS;
          return <MessageItem key={id} id={id} compact={compact} inThread />;
        })}
      </div>

      {root && (
        <Composer key={rootId} channelId={root.channelId} parentId={rootId} placeholder="Reply…" />
      )}
    </aside>
  );
}
