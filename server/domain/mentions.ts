const MENTION_RE = /@([a-z0-9_.-]+)/gi;

/** Handles mentioned in a message body: lowercased, de-duplicated, in order of appearance. */
export function parseMentions(body: string): string[] {
  const handles = [...body.matchAll(MENTION_RE)].map((m) => m[1].toLowerCase().replace(/[.-]+$/, ''));
  return [...new Set(handles)].filter(Boolean);
}
