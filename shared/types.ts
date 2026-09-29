// Contracts shared by server and web. See implementation-plan.md "Shared contracts".

export type UserDto = {
  id: string;
  handle: string;
  name: string;
  color: string;
};

export type ChannelDto = {
  id: string;
  kind: 'public' | 'dm';
  /** Public: channel name. DM: the other member's display name. */
  name: string;
  topic: string;
  memberIds: string[];
};

export type ReactionSummary = { emoji: string; userIds: string[] };

export type MessageDto = {
  id: string;
  channelId: string;
  authorId: string;
  parentId: string | null;
  /** Empty string when deleted: the server never sends deleted text. */
  body: string;
  status: 'active' | 'deleted';
  version: number;
  createdAt: string;
  editedAt: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  reactions: ReactionSummary[];
};

export type ActivityReason = 'mention' | 'dm' | 'participating' | 'reaction';

export type ServerEvent =
  | { type: 'message.upserted'; message: MessageDto }
  | { type: 'reactions.updated'; messageId: string; channelId: string; reactions: ReactionSummary[] }
  | { type: 'activity.changed'; unreadCount: number };
