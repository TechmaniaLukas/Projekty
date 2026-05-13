import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type AnyCtx = QueryCtx | MutationCtx;
type User = Doc<"users">;
type Project = Doc<"projects">;
type Task = Doc<"tasks">;

export function isAdmin(user: User): boolean {
  return user.role === "admin";
}

export function isPm(user: User): boolean {
  return user.role === "pm";
}

export function isDeptLead(user: User): boolean {
  return user.role === "department_lead";
}

export function canManageUsers(user: User): boolean {
  return isAdmin(user);
}

export function canCreateProject(user: User, department: Project["department"]): boolean {
  if (isAdmin(user) || isPm(user)) return true;
  if (isDeptLead(user)) {
    if (department === "cross") return true;
    return user.department === department;
  }
  return false;
}

export function canEditProject(user: User, project: Project): boolean {
  if (isAdmin(user) || isPm(user)) return true;
  if (isDeptLead(user)) {
    if (project.department === "cross") return true;
    return project.department === user.department;
  }
  return false;
}

export async function isProjectMemberOrAssignee(
  ctx: AnyCtx,
  projectId: Id<"projects">,
  userId: Id<"users">,
): Promise<boolean> {
  const member = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) =>
      q.eq("projectId", projectId).eq("userId", userId),
    )
    .first();
  if (member) return true;
  const assignedTask = await ctx.db
    .query("tasks")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .filter((q) => q.eq(q.field("assigneeId"), userId))
    .first();
  return assignedTask !== null;
}

export async function canViewProject(
  ctx: AnyCtx,
  user: User,
  project: Project,
): Promise<boolean> {
  if (isAdmin(user) || isPm(user)) return true;
  if (isDeptLead(user)) {
    if (project.department === "cross") return true;
    return project.department === user.department;
  }
  return isProjectMemberOrAssignee(ctx, project._id, user._id);
}

export function canEditTask(user: User, project: Project, task: Task): boolean {
  if (isAdmin(user) || isPm(user)) return true;
  if (isDeptLead(user)) {
    if (project.department === "cross") return true;
    return project.department === user.department;
  }
  return task.assigneeId === user._id;
}

export function canAddTask(user: User, project: Project): boolean {
  if (isAdmin(user) || isPm(user)) return true;
  if (isDeptLead(user)) {
    if (project.department === "cross") return true;
    return project.department === user.department;
  }
  return false;
}

export function canDeleteTask(user: User, project: Project): boolean {
  if (isAdmin(user) || isPm(user)) return true;
  if (isDeptLead(user)) {
    if (project.department === "cross") return true;
    return project.department === user.department;
  }
  return false;
}

export function canArchiveProject(user: User, project: Project): boolean {
  if (isAdmin(user)) return true;
  if (isPm(user)) return project.ownerId === user._id;
  if (isDeptLead(user)) {
    return project.department === user.department || project.department === "cross";
  }
  return false;
}
