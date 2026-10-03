import "server-only";

import { getDB } from "@/db";
import {
  ANNOUNCEMENT_PRIORITY,
  ANNOUNCEMENT_TYPE,
  announcementCommentTable,
  announcementPollOptionTable,
  announcementPollVoteTable,
  announcementPostTable,
  announcementReadTable,
  announcementUpvoteTable,
  ROLES_ENUM,
  userTable,
} from "@/db/schema";
import { getSessionFromCookie } from "@/utils/auth";
import { checkActionRateLimit } from "@/infra/action-rate-limit";
import { sendAnnouncementNotificationEmail } from "@/utils/email";
import { logger } from "@/infra/logger";
import { sendEmailBestEffort } from "@/lib/best-effort-email";
import { announcementCreateInputSchema } from "@/lib/announcement-schemas";
import { and, count, desc, eq, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { ZSAError } from "zsa";

export async function getAnnouncementsUnreadCountForUser(userId: string) {
  const db = getDB();
  if (!("select" in db) || typeof db.select !== "function") {
    return 0;
  }
  const [result] = await db
    .select({ total: count() })
    .from(announcementPostTable)
    .leftJoin(
      announcementReadTable,
      and(
        eq(announcementReadTable.postId, announcementPostTable.id),
        eq(announcementReadTable.userId, userId),
      ),
    )
    .where(
      and(
        isNull(announcementReadTable.id),
        sql`${announcementPostTable.publishedAt} <= CURRENT_TIMESTAMP`,
      ),
    );

  return result?.total ?? 0;
}

export async function getAnnouncementsFeed(params?: {
  q?: string;
  type?: string;
  pinnedOnly?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const session = await getSessionFromCookie();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "Sign in required");

  const db = getDB();

  const whereClauses = [];

  if (params?.q) {
    whereClauses.push(
      or(
        like(announcementPostTable.title, `%${params.q}%`),
        like(announcementPostTable.body, `%${params.q}%`),
      ),
    );
  }

  if (params?.type) {
    whereClauses.push(eq(announcementPostTable.type, params.type));
  }

  if (params?.pinnedOnly) {
    whereClauses.push(eq(announcementPostTable.pinned, true));
  }

  if (params?.dateFrom) {
    whereClauses.push(sql`${announcementPostTable.publishedAt} >= ${params.dateFrom}`);
  }

  if (params?.dateTo) {
    whereClauses.push(sql`${announcementPostTable.publishedAt} <= ${params.dateTo}`);
  }

  whereClauses.push(sql`${announcementPostTable.publishedAt} <= CURRENT_TIMESTAMP`);

  const posts = await db
    .select({
      id: announcementPostTable.id,
      title: announcementPostTable.title,
      body: announcementPostTable.body,
      attachments: announcementPostTable.attachments,
      ctaLabel: announcementPostTable.ctaLabel,
      ctaUrl: announcementPostTable.ctaUrl,
      embedTitle: announcementPostTable.embedTitle,
      embedUrl: announcementPostTable.embedUrl,
      type: announcementPostTable.type,
      priority: announcementPostTable.priority,
      pinned: announcementPostTable.pinned,
      commentsEnabled: announcementPostTable.commentsEnabled,
      pollSingleChoice: announcementPostTable.pollSingleChoice,
      pollNamedVotes: announcementPostTable.pollNamedVotes,
      pollAllowVoteChange: announcementPostTable.pollAllowVoteChange,
      pollCloseAt: announcementPostTable.pollCloseAt,
      publishedAt: announcementPostTable.publishedAt,
      authorId: announcementPostTable.authorId,
      authorFirstName: userTable.firstName,
      authorLastName: userTable.lastName,
      authorEmail: userTable.email,
      authorAvatar: userTable.avatar,
      authorRole: userTable.role,
      isRead: sql<number>`case when ${announcementReadTable.id} is null then 0 else 1 end`,
      upvotesCount: sql<number>`(
        select count(*) from ${announcementUpvoteTable}
        where ${announcementUpvoteTable.postId} = ${announcementPostTable.id}
      )`,
      hasUpvoted: sql<number>`(
        select count(*) from ${announcementUpvoteTable}
        where ${announcementUpvoteTable.postId} = ${announcementPostTable.id}
          and ${announcementUpvoteTable.userId} = ${session.user.id}
      )`,
      commentsCount: sql<number>`(
        select count(*) from ${announcementCommentTable}
        where ${announcementCommentTable.postId} = ${announcementPostTable.id}
      )`,
    })
    .from(announcementPostTable)
    .leftJoin(userTable, eq(userTable.id, announcementPostTable.authorId))
    .leftJoin(
      announcementReadTable,
      and(
        eq(announcementReadTable.postId, announcementPostTable.id),
        eq(announcementReadTable.userId, session.user.id),
      ),
    )
    .where(whereClauses.length > 0 ? and(...whereClauses) : undefined)
    .orderBy(desc(announcementPostTable.pinned), desc(announcementPostTable.publishedAt));

  const postIds = posts.map((p) => p.id);

  const [pollOptions, pollVotes, comments] = await Promise.all([
    postIds.length
      ? db.query.announcementPollOptionTable.findMany({
          where: inArray(announcementPollOptionTable.postId, postIds),
          orderBy: [announcementPollOptionTable.sortOrder],
        })
      : [],
    postIds.length
      ? db.query.announcementPollVoteTable.findMany({
          where: inArray(announcementPollVoteTable.postId, postIds),
        })
      : [],
    postIds.length
      ? db
          .select({
            id: announcementCommentTable.id,
            postId: announcementCommentTable.postId,
            userId: announcementCommentTable.userId,
            parentId: announcementCommentTable.parentId,
            body: announcementCommentTable.body,
            createdAt: announcementCommentTable.createdAt,
            firstName: userTable.firstName,
            lastName: userTable.lastName,
            email: userTable.email,
            avatar: userTable.avatar,
            role: userTable.role,
          })
          .from(announcementCommentTable)
          .leftJoin(userTable, eq(userTable.id, announcementCommentTable.userId))
          .where(inArray(announcementCommentTable.postId, postIds))
      : [],
  ]);

  const pollVoterIds = Array.from(new Set(pollVotes.map((vote) => vote.userId)));
  const pollVoters = pollVoterIds.length
    ? await db.query.userTable.findMany({
        where: inArray(userTable.id, pollVoterIds),
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      })
    : [];

  const voterDisplayNameByUserId = new Map(
    pollVoters.map((voter) => [
      voter.id,
      `${voter.firstName ?? ""} ${voter.lastName ?? ""}`.trim() || voter.email || "User",
    ]),
  );
  const pollOptionsByPostId = new Map<string, typeof pollOptions>();
  for (const option of pollOptions) {
    pollOptionsByPostId.set(option.postId, [...(pollOptionsByPostId.get(option.postId) ?? []), option]);
  }

  const pollVotesByOptionId = new Map<string, typeof pollVotes>();
  const viewerVotedOptionIds = new Set<string>();
  for (const vote of pollVotes) {
    pollVotesByOptionId.set(vote.optionId, [...(pollVotesByOptionId.get(vote.optionId) ?? []), vote]);
    if (vote.userId === session.user.id) {
      viewerVotedOptionIds.add(vote.optionId);
    }
  }

  const commentsByPostId = new Map<string, typeof comments>();
  for (const comment of comments) {
    commentsByPostId.set(comment.postId, [...(commentsByPostId.get(comment.postId) ?? []), comment]);
  }

  return {
    viewerRole: session.user.role,
    posts: posts.map((post) => ({
      ...post,
      isRead: post.isRead > 0,
      hasUpvoted: post.hasUpvoted > 0,
      pollOptions: (pollOptionsByPostId.get(post.id) ?? [])
        .map((opt) => {
          const optionVotes = pollVotesByOptionId.get(opt.id) ?? [];
          return {
          ...opt,
          votes: optionVotes.length,
          hasVoted: viewerVotedOptionIds.has(opt.id),
          voters: optionVotes
            .map((vote) => ({
              userId: vote.userId,
              name: voterDisplayNameByUserId.get(vote.userId) ?? "User",
            })),
        };
        }),
      comments: commentsByPostId.get(post.id) ?? [],
    })),
  };
}

export async function createAnnouncement(input: {
  title: string;
  body: string;
  attachments?: Array<{ label: string; url: string }>;
  cta?: { label: string; url: string } | null;
  embed?: { title?: string | null; url: string } | null;
  type: string;
  priority: string;
  pinned?: boolean;
  commentsEnabled?: boolean;
  pollSingleChoice?: boolean;
  pollNamedVotes?: boolean;
  pollAllowVoteChange?: boolean;
  pollCloseAt?: Date | null;
  pollOptions?: string[];
  sendEmail?: boolean;
}) {
  const session = await getSessionFromCookie();
  if (!session || session.user.role !== ROLES_ENUM.ADMIN) {
    throw new ZSAError("NOT_AUTHORIZED", "Admin only");
  }
  await checkActionRateLimit("announcements:create", session.user.id, 30);

  const db = getDB();
  const parsedInput = announcementCreateInputSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new ZSAError(
      "INPUT_PARSE_ERROR",
      parsedInput.error.issues[0]?.message ?? "Invalid announcement payload",
    );
  }

  const normalizedInput = parsedInput.data;

  const [post] = await db
    .insert(announcementPostTable)
    .values({
      authorId: session.user.id,
      title: normalizedInput.title,
      body: normalizedInput.body,
      attachments: normalizedInput.attachments?.length ? normalizedInput.attachments : null,
      ctaLabel: normalizedInput.cta?.label ?? null,
      ctaUrl: normalizedInput.cta?.url ?? null,
      embedTitle: normalizedInput.embed?.title ?? null,
      embedUrl: normalizedInput.embed?.url ?? null,
      type: normalizedInput.type,
      priority: normalizedInput.priority,
      pinned: Boolean(normalizedInput.pinned),
      commentsEnabled: normalizedInput.commentsEnabled ?? true,
      pollSingleChoice: normalizedInput.pollSingleChoice ?? true,
      pollNamedVotes: normalizedInput.pollNamedVotes ?? true,
      pollAllowVoteChange: normalizedInput.pollAllowVoteChange ?? true,
      pollCloseAt: normalizedInput.pollCloseAt ?? null,
      emailNotificationSent: false,
    })
    .returning();

  if (post.type === ANNOUNCEMENT_TYPE.POLL && normalizedInput.pollOptions?.length) {
    await db.insert(announcementPollOptionTable).values(
      normalizedInput.pollOptions.map((label, index) => ({
        postId: post.id,
        label,
        sortOrder: index,
      })),
    );
  }

  let emailNotificationSent = false;

  if (normalizedInput.sendEmail) {
    const recipients = await db.query.userTable.findMany({
      where: isNotNull(userTable.emailVerified),
      columns: { email: true },
    });
    const recipientEmails = recipients.map((recipient) => recipient.email).filter(Boolean);
    if (recipientEmails.length > 0) {
      emailNotificationSent = await sendEmailBestEffort({
        send: () =>
          sendAnnouncementNotificationEmail({
            to: recipientEmails as string[],
            title: post.title,
            type: post.type,
            priority: post.priority,
          }),
        logger,
        message: "Failed to send announcement notification email",
        context: {
          announcementId: post.id,
          announcementType: post.type,
          recipientCount: recipientEmails.length,
        },
      });

      if (emailNotificationSent) {
        await db
          .update(announcementPostTable)
          .set({ emailNotificationSent: true })
          .where(eq(announcementPostTable.id, post.id));
      }
    }
  }

  return {
    ...post,
    emailNotificationSent,
  };
}

export async function toggleAnnouncementUpvote(postId: string) {
  const session = await getSessionFromCookie();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "Sign in required");
  await checkActionRateLimit("announcements:upvote", session.user.id, 120);

  const db = getDB();
  const existing = await db.query.announcementUpvoteTable.findFirst({
    where: and(
      eq(announcementUpvoteTable.postId, postId),
      eq(announcementUpvoteTable.userId, session.user.id),
    ),
  });

  if (existing) {
    await db.delete(announcementUpvoteTable).where(eq(announcementUpvoteTable.id, existing.id));
    return { upvoted: false };
  }

  await db.insert(announcementUpvoteTable).values({
    postId,
    userId: session.user.id,
  });
  return { upvoted: true };
}

export async function addAnnouncementComment(input: {
  postId: string;
  body: string;
  parentId?: string | null;
}) {
  const session = await getSessionFromCookie();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "Sign in required");
  await checkActionRateLimit("announcements:comment", session.user.id, 80);

  const db = getDB();

  const post = await db.query.announcementPostTable.findFirst({
    where: eq(announcementPostTable.id, input.postId),
  });
  if (!post) throw new ZSAError("NOT_FOUND", "Post not found");
  if (!post.commentsEnabled) throw new ZSAError("FORBIDDEN", "Comments are disabled for this post");

  if (input.parentId) {
    const parent = await db.query.announcementCommentTable.findFirst({
      where: eq(announcementCommentTable.id, input.parentId),
      columns: { id: true, postId: true },
    });
    if (!parent || parent.postId !== input.postId) {
      throw new ZSAError("INPUT_PARSE_ERROR", "Invalid parent comment");
    }
  }

  const [comment] = await db
    .insert(announcementCommentTable)
    .values({
      postId: input.postId,
      userId: session.user.id,
      parentId: input.parentId ?? null,
      body: input.body,
    })
    .returning();

  return comment;
}

export async function deleteAnnouncementComment(commentId: string) {
  const session = await getSessionFromCookie();
  if (!session || session.user.role !== ROLES_ENUM.ADMIN) {
    throw new ZSAError("NOT_AUTHORIZED", "Admin only");
  }

  const db = getDB();
  await db.delete(announcementCommentTable).where(eq(announcementCommentTable.id, commentId));
  return { ok: true };
}

export async function voteOnAnnouncementPoll(input: { postId: string; optionIds: string[] }) {
  const session = await getSessionFromCookie();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "Sign in required");
  await checkActionRateLimit("announcements:poll-vote", session.user.id, 120);

  const db = getDB();

  const post = await db.query.announcementPostTable.findFirst({
    where: eq(announcementPostTable.id, input.postId),
  });
  if (!post || post.type !== ANNOUNCEMENT_TYPE.POLL) {
    throw new ZSAError("NOT_FOUND", "Poll post not found");
  }

  if (post.pollCloseAt && post.pollCloseAt.getTime() < Date.now()) {
    throw new ZSAError("FORBIDDEN", "Poll is closed");
  }

  if (post.pollSingleChoice && input.optionIds.length !== 1) {
    throw new ZSAError("INPUT_PARSE_ERROR", "This poll allows only one choice");
  }

  const validOptions = await db.query.announcementPollOptionTable.findMany({
    where: eq(announcementPollOptionTable.postId, input.postId),
  });

  const optionSet = new Set(validOptions.map((opt) => opt.id));
  if (input.optionIds.some((id) => !optionSet.has(id))) {
    throw new ZSAError("INPUT_PARSE_ERROR", "Invalid poll option");
  }

  const existing = await db.query.announcementPollVoteTable.findMany({
    where: and(
      eq(announcementPollVoteTable.postId, input.postId),
      eq(announcementPollVoteTable.userId, session.user.id),
    ),
  });

  if (existing.length > 0 && !post.pollAllowVoteChange) {
    throw new ZSAError("FORBIDDEN", "Vote changes are disabled for this poll");
  }

  if (existing.length > 0) {
    await db
      .delete(announcementPollVoteTable)
      .where(
        and(
          eq(announcementPollVoteTable.postId, input.postId),
          eq(announcementPollVoteTable.userId, session.user.id),
        ),
      );
  }

  if (input.optionIds.length > 0) {
    await db.insert(announcementPollVoteTable).values(
      input.optionIds.map((optionId) => ({
        postId: input.postId,
        optionId,
        userId: session.user.id,
      })),
    );
  }

  return { ok: true };
}

export async function markAnnouncementRead(postId: string) {
  const session = await getSessionFromCookie();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "Sign in required");

  const db = getDB();
  const existing = await db.query.announcementReadTable.findFirst({
    where: and(
      eq(announcementReadTable.postId, postId),
      eq(announcementReadTable.userId, session.user.id),
    ),
  });

  if (existing) return existing;

  const [record] = await db
    .insert(announcementReadTable)
    .values({ postId, userId: session.user.id })
    .returning();

  return record;
}

export const ANNOUNCEMENT_META = {
  types: ANNOUNCEMENT_TYPE,
  priorities: ANNOUNCEMENT_PRIORITY,
};
