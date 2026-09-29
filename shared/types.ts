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

export type SearchHit = {
  id: string;
  channelId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
};

export type ActivityReason = 'mention' | 'dm' | 'participating' | 'reaction';

export type ActivityItemDto = {
  id: string;
  reason: ActivityReason;
  /** reaction: distinct reactors; dm: unread messages in the group; otherwise 1 */
  count: number;
  /** Newest first */
  actorIds: string[];
  latestAt: string;
  readAt: string | null;
  channelId: string;
  /** Subject message (DM groups: the latest message) */
  messageId: string;
  parentId: string | null;
  /** Live text of the subject message, never a snapshot */
  preview: string;
  editedAt: string | null;
  /** Thread root, for replies */
  root: { authorId: string; body: string; deleted: boolean } | null;
  /** Reaction groups: distinct emojis, in the order they were first used */
  emojis: string[];
};

export type ActivityFeedDto = { items: ActivityItemDto[]; unreadCount: number };

export type ThreadDto = { root: MessageDto; replies: MessageDto[] };

export type ServerEvent =
  | { type: 'message.upserted'; message: MessageDto }
  | { type: 'reactions.updated'; messageId: string; channelId: string; reactions: ReactionSummary[] }
  | { type: 'activity.changed'; unreadCount: number };
