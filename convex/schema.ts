import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  datasets: defineTable({
    userId: v.id("users"),
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
  })
    .index("by_user", ["userId"])
    .index("by_job", ["jobId"]),
});
