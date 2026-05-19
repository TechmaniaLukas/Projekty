import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";

export const listMine = query({
  args: { route: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db
      .query("savedViews")
      .withIndex("by_user_route", (q) =>
        q.eq("userId", me._id).eq("route", args.route),
      )
      .collect();
    rows.sort((a, b) => a._creationTime - b._creationTime);
    return rows;
  },
});

export const save = mutation({
  args: { name: v.string(), route: v.string(), params: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!args.name.trim()) throw new ConvexError("Název je povinný");
    // Stejný název přepíše (upsert).
    const existing = await ctx.db
      .query("savedViews")
      .withIndex("by_user_route", (q) =>
        q.eq("userId", me._id).eq("route", args.route),
      )
      .collect();
    const dup = existing.find(
      (v) => v.name.trim().toLowerCase() === args.name.trim().toLowerCase(),
    );
    if (dup) {
      await ctx.db.patch(dup._id, { params: args.params });
      return dup._id;
    }
    return await ctx.db.insert("savedViews", {
      userId: me._id,
      name: args.name.trim(),
      route: args.route,
      params: args.params,
    });
  },
});

export const remove = mutation({
  args: { viewId: v.id("savedViews") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const view = await ctx.db.get(args.viewId);
    if (!view) return;
    if (view.userId !== me._id) {
      throw new ConvexError("Lze smazat jen vlastní pohled");
    }
    await ctx.db.delete(args.viewId);
  },
});
