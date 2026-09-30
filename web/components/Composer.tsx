import { useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import { sendMessage } from '../actions';

type Props = { channelId: string; parentId?: string | null; placeholder: string };

/** Enter sends, Shift+Enter adds a new line. Sending is optimistic, so the box clears immediately. */
export function Composer({ channelId, parentId = null, placeholder }: Props) {
  const [text, setText] = useState('');

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    sendMessage(channelId, body, parentId);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={Math.min(8, text.split('\n').length)}
        maxLength={4000}
      />
      <button className="send" onClick={submit} disabled={!text.trim()} aria-label="Send">
        <Icon name="arrowUp" size={16} />
      </button>
    </div>
  );
}
