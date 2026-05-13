import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { Id } from "../_generated/dataModel";

export type Role = "admin" | "pm" | "department_lead" | "member";

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  if (!user) return null;
  if (user.isActive === false) return null;
  return user;
}

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new ConvexError("Nepřihlášený uživatel");
  return user;
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  roles: Role[],
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!user.role || !roles.includes(user.role)) {
    throw new ConvexError(`Nedostatečná oprávnění (požadováno: ${roles.join(", ")})`);
  }
  return user;
}

export async function requireUserById(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("Uživatel nenalezen");
  return user;
}
