import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { deleteMessage, editMessage, retrySend, toggleReaction } from '../actions';
import { formatFull, formatTime, relativeTime } from '../format';
import { useStore } from '../store';
import { Avatar } from './Avatar';
import { MessageBody } from './MessageBody';
import { Reactions } from './Reactions';
import { Icon } from './Icon';
import { REACTION_EMOJI } from '../../shared/types';

type Props = {
  id: string;
  /** Continuation of the previous author's messages: hide avatar and name, like Slack. */
  compact: boolean;
  /** Rendered inside the thread panel: no thread affordances (one level of threads). */
  inThread?: boolean;
};

export function MessageItem({ id, compact, inThread = false }: Props) {
  const message = useStore((s) => s.messagesById[id]);
  const author = useStore((s) => (message ? s.usersById[message.authorId] : undefined));
  const me = useStore((s) => s.me)!;
  const sendState = useStore((s) => s.sendState[id]);
  const highlighted = useStore((s) => s.highlightMessageId === id);
  const discard = useStore((s) => s.discard);
  const openThread = useStore((s) => s.openThread);
  const ref = useRef<HTMLDivElement>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!highlighted) return;
    ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = setTimeout(() => useStore.getState().setHighlight(null), 2500);
    return () => clearTimeout(timer);
  }, [highlighted]);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(timer);
  }, [note]);

  if (!message) return null;
  const deleted = message.status === 'deleted';
  const mine = message.authorId === me.id;
  const settled = !deleted && !sendState; // confirmed by the server and not deleted
  const canReply = settled && !inThread && !message.parentId;

  const startEdit = () => {
    setDraft(message.body);
    setEditing(true);
    setPickerOpen(false);
  };
  const saveEdit = async () => {
    const body = draft.trim();
    setEditing(false);
    if (body && body !== message.body) setNote(await editMessage(id, body));
  };
  const onEditKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') setEditing(false);
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void saveEdit();
    }
  };

  return (
    <div
      ref={ref}
      className={['message', compact && 'compact', sendState, highlighted && 'highlight', editing && 'editing']
        .filter(Boolean)
        .join(' ')}
      onMouseLeave={() => setPickerOpen(false)}
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

        {editing ? (
          <div className="edit-box">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onEditKey}
              rows={Math.min(8, draft.split('\n').length + 1)}
              maxLength={4000}
            />
            <div className="edit-hint muted">
              Escape to <button onClick={() => setEditing(false)}>cancel</button> · Enter to{' '}
              <button onClick={() => void saveEdit()}>save</button>
            </div>
          </div>
        ) : (
          <div className="message-body">
            {deleted ? (
              <span className="deleted muted">This message was deleted.</span>
            ) : (
              <>
                <MessageBody text={message.body} />
                {message.editedAt && (
                  <span className="edited muted" title={`Edited ${formatFull(message.editedAt)}`}>
                    {' '}
                    (edited)
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {!deleted && <Reactions messageId={id} reactions={message.reactions} />}

        {!inThread && message.replyCount > 0 && (
          <button className="replies-link" onClick={() => openThread(message.id)}>
            {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
            {message.lastReplyAt && <span className="muted"> · last reply {relativeTime(message.lastReplyAt)} ago</span>}
          </button>
        )}

        {note && <div className="message-note">{note}</div>}

        {sendState === 'failed' && (
          <div className="send-failed">
            Not sent.{' '}
            <button onClick={() => retrySend(id)}>Retry</button> · <button onClick={() => discard(id)}>Discard</button>
          </div>
        )}
      </div>

      {settled && !editing && (
        <div className={`message-actions ${pickerOpen ? 'open' : ''}`}>
          {pickerOpen ? (
            REACTION_EMOJI.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  toggleReaction(id, emoji);
                  setPickerOpen(false);
                }}
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))
          ) : (
            <>
              <button onClick={() => setPickerOpen(true)} title="Add reaction">
                <Icon name="smilePlus" />
              </button>
              {canReply && (
                <button onClick={() => openThread(message.id)} title="Reply in thread">
                  <Icon name="message" />
                </button>
              )}
              {mine && (
                <>
                  <button onClick={startEdit} title="Edit message">
                    <Icon name="pencil" />
                  </button>
                  <button
                    className="danger"
                    onClick={async () => setNote(await deleteMessage(id))}
                    title="Delete message"
                  >
                    <Icon name="trash" />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
