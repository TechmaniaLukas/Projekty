import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { canViewProject } from "./lib/permissions";
import type { Doc, Id } from "./_generated/dataModel";

export interface SearchResult {
  kind: "project" | "task" | "user";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  projectId?: Id<"projects">;
}

export const global = query({
  args: { q: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const term = args.q.trim();
    if (term.length < 2) return [];
    const limit = args.limit ?? 12;

    const results: SearchResult[] = [];

    const projects = await ctx.db
      .query("projects")
      .withSearchIndex("search_name", (q) => q.search("name", term))
      .take(limit);
    const visibleProjects: Doc<"projects">[] = [];
    for (const p of projects) {
      if (p.status === "archived") continue;
      if (await canViewProject(ctx, me, p)) {
        visibleProjects.push(p);
        results.push({
          kind: "project",
          id: p._id,
          title: p.name,
          subtitle: p.description?.slice(0, 80),
          href: `/projekty/${p._id}`,
        });
      }
    }

    const tasks = await ctx.db
      .query("tasks")
      .withSearchIndex("search_title", (q) => q.search("title", term))
      .take(limit * 2);
    const projectCache = new Map<string, Doc<"projects"> | null>();
    const projectAccessCache = new Map<string, boolean>();
    for (const t of tasks) {
      let allowed = projectAccessCache.get(t.projectId as string);
      let project = projectCache.get(t.projectId as string) ?? null;
      if (allowed === undefined) {
        if (!projectCache.has(t.projectId as string)) {
          project = await ctx.db.get(t.projectId);
          projectCache.set(t.projectId as string, project);
        }
        allowed =
          project !== null &&
          project.status !== "archived" &&
          (await canViewProject(ctx, me, project));
        projectAccessCache.set(t.projectId as string, allowed);
      }
      if (!allowed) continue;
      results.push({
        kind: "task",
        id: t._id,
        title: t.title,
        subtitle: project ? project.name : undefined,
        href: `/projekty/${t.projectId}?task=${t._id}`,
        projectId: t.projectId,
      });
      if (results.length >= limit * 2) break;
    }

    const lower = term.toLowerCase();
    const allUsers = await ctx.db.query("users").collect();
    for (const u of allUsers) {
      if (u.isActive === false) continue;
      const name = (u.name ?? "").toLowerCase();
      const email = (u.email ?? "").toLowerCase();
      if (name.includes(lower) || email.includes(lower)) {
        results.push({
          kind: "user",
          id: u._id,
          title: u.name ?? u.email ?? "Uživatel",
          subtitle: u.email ?? undefined,
          href: `/tym`,
        });
      }
    }

    return results.slice(0, limit * 2);
  },
});
