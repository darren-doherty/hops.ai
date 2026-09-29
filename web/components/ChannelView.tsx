import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadChannel } from '../actions';
import { dayLabel, isSameDay } from '../format';
import { useStore } from '../store';
import { Composer } from './Composer';
import { MessageItem } from './MessageItem';
import type { ChannelDto } from '../../shared/types';

const GROUP_WINDOW_MS = 5 * 60_000;

export function ChannelView({ channel }: { channel: ChannelDto }) {
  const order = useStore((s) => s.channelOrder[channel.id]);
  const messagesById = useStore((s) => s.messagesById);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    setError(null);
    stickToBottom.current = true;
    loadChannel(channel.id).catch((err) => setError(String(err.message ?? err)));
  }, [channel.id]);

  // Keep the newest message in view unless the user has scrolled up to read history.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [order]);

  const onScroll = () => {
    const el = listRef.current!;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const title = channel.kind === 'dm' ? channel.name : `# ${channel.name}`;

  return (
    <>
      <header className="main-header">
        <h1>{title}</h1>
        {channel.topic && <span className="muted topic">{channel.topic}</span>}
      </header>

      <div className="message-list" ref={listRef} onScroll={onScroll}>
        {error && <div className="empty notice">Couldn't load messages: {error}</div>}
        {!order && !error && <div className="empty muted">Loading…</div>}
        {order?.length === 0 && (
          <div className="empty muted">
            {channel.kind === 'dm' ? `This is the start of your conversation with ${channel.name}.` : `This is the very beginning of #${channel.name}.`}
          </div>
        )}
        {order?.map((id, i) => {
          const message = messagesById[id];
          const prev = i > 0 ? messagesById[order[i - 1]] : undefined;
          const newDay = !prev || !isSameDay(prev.createdAt, message.createdAt);
          const compact =
            !newDay &&
            prev!.authorId === message.authorId &&
            prev!.status === 'active' &&
            prev!.replyCount === 0 &&
            new Date(message.createdAt).getTime() - new Date(prev!.createdAt).getTime() < GROUP_WINDOW_MS;
          return (
            <Fragment key={id}>
              {newDay && (
                <div className="day-divider">
                  <span>{dayLabel(message.createdAt)}</span>
                </div>
              )}
              <MessageItem id={id} compact={compact} />
            </Fragment>
          );
        })}
      </div>

      <Composer
        key={channel.id}
        channelId={channel.id}
        placeholder={channel.kind === 'dm' ? `Message ${channel.name}` : `Message #${channel.name}`}
      />
    </>
  );
}
