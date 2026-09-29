# Hops Assignment

---

## **Design**

Build a simple, real-time messaging system along the lines of Slack. Focus on the messaging experience and activity feed rather than trying to build a complete product. Build enough to exercise the activity feed: creating messages and replies, mentions/reactions, and editing or deleting messages.

The activity feed should feel like something a real person could use. We do care about product craft and the decisions behind what you build.

Messages and their later edits or deletions also need to make their way to several independent systems: a search index, a notification sender, and the activity feed itself. These systems communicate over the network and can be slow or unavailable. How you make that reliable, and what guarantees you choose to provide, is part of the task.

The search index and notification sender can be simple local or in-process fakes. You do not need to build or deploy separate services. Treat their boundaries as if they were real external systems. Seed enough data that the experience resembles a busy team rather than an empty demo.

Use any tech stack you want.

## **What we'll dig into**

Be prepared to talk about:

- what you decided deserves someone's attention and what doesn't
- what you chose to borrow from existing products, what you changed, and why
- what stale, edited or deleted entries look like
- how messages make their way to the activity feed
- what guarantees your implementation provides
- where you knowingly cut corners

We don't expect everything to be finished. A trade-off you thought through and can explain is more valuable than functionality you added without being able to defend the design. Use whatever format helps explain your work in addition to the code itself. Markdown, HTML or a short recording are all great options.

## **Practicalities**

Scope the implementation to a few focused hours and use AI heavily if that's how you normally work. Cut features before you cut reasoning, and make the important decisions yourself. We'd much rather see something small that you understand deeply than something broad that you can't defend.

We'll provide Claude Max subscription so you have plenty of tokens. We will wait until you are ready to share it to schedule the next interview.

Afterwards, we'll use what you built as the starting point for two conversations:

- a system design session, where we'll explore this architecture and push well beyond the scope of the take-home;
- a conversation with the CEO and Founder about your product thinking, your decisions, and how you used AI throughout the process.