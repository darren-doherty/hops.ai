import { useEffect, useRef } from 'react';
import { retrySend } from '../actions';
import { formatFull, formatTime, relativeTime } from '../format';
import { useStore } from '../store';
import { Avatar } from './Avatar';
import { MessageBody } from './MessageBody';

type Props = {
  id: string;
  /** Continuation of the previous author's messages: hide avatar and name, like Slack. */
  compact: boolean;
};

export function MessageItem({ id, compact }: Props) {
  const message = useStore((s) => s.messagesById[id]);
  const author = useStore((s) => (message ? s.usersById[message.authorId] : undefined));
  const sendState = useStore((s) => s.sendState[id]);
  const highlighted = useStore((s) => s.highlightMessageId === id);
  const discard = useStore((s) => s.discard);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlighted) return;
    ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = setTimeout(() => useStore.getState().setHighlight(null), 2500);
    return () => clearTimeout(timer);
  }, [highlighted]);

  if (!message) return null;
  const deleted = message.status === 'deleted';

  return (
    <div
      ref={ref}
      className={['message', compact && 'compact', sendState, highlighted && 'highlight'].filter(Boolean).join(' ')}
    >
      <div className="message-gutter">
        {compact ? (
          <span className="hover-time" title={formatFull(message.createdAt)}>
            {formatTime(message.createdAt)}
          </span>
        ) : (
          <Avatar user={author} size={36} />
        )}
      </div>
      <div className="message-content">
        {!compact && (
          <div className="message-meta">
            <span className="author">{author?.name ?? 'Unknown'}</span>
            <span className="time muted" title={formatFull(message.createdAt)}>
              {formatTime(message.createdAt)}
            </span>
          </div>
        )}
        <div className="message-body">
          {deleted ? (
            <span className="deleted muted">This message was deleted.</span>
          ) : (
            <>
              <MessageBody text={message.body} />
              {message.editedAt && <span className="edited muted"> (edited)</span>}
            </>
          )}
        </div>

        {message.replyCount > 0 && (
          <div className="replies-link">
            {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
            {message.lastReplyAt && <span className="muted"> · last reply {relativeTime(message.lastReplyAt)} ago</span>}
          </div>
        )}

        {sendState === 'failed' && (
          <div className="send-failed">
            Not sent.{' '}
            <button onClick={() => retrySend(id)}>Retry</button> · <button onClick={() => discard(id)}>Discard</button>
          </div>
        )}
      </div>
    </div>
  );
}
