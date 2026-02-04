import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Get user's datasets (last N, default 5)
export const getUserDatasets = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("datasets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit ?? 5);
  },
});

// Get dataset by job ID
export const getDatasetByJobId = query({
  args: { jobId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const dataset = await ctx.db
      .query("datasets")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .first();

    // Verify ownership
    if (!dataset || dataset.userId !== userId) {
      return null;
    }

    return dataset;
  },
});

// Save or update dataset (authenticated)
export const saveDataset = mutation({
  args: {
    jobId: v.string(),
    description: v.string(),
    rows: v.number(),
    format: v.union(v.literal("csv"), v.literal("json"), v.literal("parquet")),
    seed: v.optional(v.number()),
    options: v.optional(v.any()),
    schema: v.optional(v.any()),
    status: v.string(),
    progress: v.number(),
    error: v.optional(v.string()),
    files: v.optional(v.any()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Check if dataset exists (upsert)
    const existing = await ctx.db
      .query("datasets")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        ...args,
        userId,
      });
      return existing._id;
    }

    // Insert new
    return await ctx.db.insert("datasets", {
      ...args,
      userId,
    });
  },
});

// Internal mutation for server-side updates (uses provided userId)
export const saveDatasetInternal = mutation({
  args: {
    visitorId: v.string(), // For anonymous users, we'll use a visitor ID
    jobId: v.string(),
    description: v.string(),
    rows: v.number(),
    format: v.union(v.literal("csv"), v.literal("json"), v.literal("parquet")),
    seed: v.optional(v.number()),
    options: v.optional(v.any()),
    schema: v.optional(v.any()),
    status: v.string(),
    progress: v.number(),
    error: v.optional(v.string()),
    files: v.optional(v.any()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Try to get authenticated user first
    const userId = await getAuthUserId(ctx);

    // If no user, we can't save (datasets require a user)
    if (!userId) {
      // For now, just return without saving for anonymous users
      return null;
    }

    const { visitorId, ...datasetArgs } = args;

    const existing = await ctx.db
      .query("datasets")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...datasetArgs, userId });
      return existing._id;
    }

    return await ctx.db.insert("datasets", { ...datasetArgs, userId });
  },
});
