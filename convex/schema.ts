import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const ROLES = ["admin", "director", "pm", "department_lead", "member"] as const;
export const DEPARTMENTS = ["it", "facility", "vyroba"] as const;
export const PROJECT_DEPARTMENTS = ["it", "facility", "vyroba", "cross"] as const;
export const PROJECT_STATUSES = ["planning", "active", "on_hold", "done", "archived"] as const;
export const TASK_STATUSES = ["todo", "in_progress", "blocked", "review", "done"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;

const role = v.union(...ROLES.map((r) => v.literal(r)));
const department = v.union(...DEPARTMENTS.map((d) => v.literal(d)));
const projectDepartment = v.union(...PROJECT_DEPARTMENTS.map((d) => v.literal(d)));
const projectStatus = v.union(...PROJECT_STATUSES.map((s) => v.literal(s)));
const taskStatus = v.union(...TASK_STATUSES.map((s) => v.literal(s)));
const priority = v.union(...PRIORITIES.map((p) => v.literal(p)));

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    role: v.optional(role),
    department: v.optional(department),
    isActive: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_role", ["role"])
    .index("by_department", ["department"]),

  projects: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    ownerId: v.id("users"),
    department: projectDepartment,
    status: projectStatus,
    priority: priority,
    deadline: v.optional(v.number()),
    startDate: v.optional(v.number()),
    createdBy: v.id("users"),
    isTemplate: v.optional(v.boolean()),
  })
    .index("by_department", ["department"])
    .index("by_status", ["status"])
    .index("by_owner", ["ownerId"])
    .index("by_deadline", ["deadline"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["department", "status"],
    }),

  projectMembers: defineTable({
    projectId: v.id("projects"),
    userId: v.id("users"),
    role: v.union(v.literal("watcher"), v.literal("contributor")),
  })
    .index("by_project", ["projectId"])
    .index("by_user", ["userId"])
    .index("by_project_and_user", ["projectId", "userId"]),

  tasks: defineTable({
    projectId: v.id("projects"),
    parentTaskId: v.optional(v.id("tasks")),
    milestoneId: v.optional(v.id("milestones")),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    status: taskStatus,
    priority: priority,
    startDate: v.optional(v.number()),
    deadline: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    order: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_project", ["projectId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_parent", ["parentTaskId"])
    .index("by_milestone", ["milestoneId"])
    .index("by_project_and_status", ["projectId", "status"])
    .index("by_deadline", ["deadline"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["projectId", "status"],
    }),

  comments: defineTable({
    taskId: v.id("tasks"),
    authorId: v.id("users"),
    text: v.string(),
    mentions: v.optional(v.array(v.id("users"))),
    editedAt: v.optional(v.number()),
  }).index("by_task", ["taskId"]),

  taskDependencies: defineTable({
    blockingTaskId: v.id("tasks"),
    blockedTaskId: v.id("tasks"),
    createdBy: v.id("users"),
  })
    .index("by_blocking", ["blockingTaskId"])
    .index("by_blocked", ["blockedTaskId"])
    .index("by_pair", ["blockingTaskId", "blockedTaskId"]),

  attachments: defineTable({
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
    taskId: v.optional(v.id("tasks")),
    commentId: v.optional(v.id("comments")),
    uploadedBy: v.id("users"),
  })
    .index("by_task", ["taskId"])
    .index("by_comment", ["commentId"]),

  notifications: defineTable({
    recipientId: v.id("users"),
    actorId: v.optional(v.id("users")),
    type: v.union(
      v.literal("task_assigned"),
      v.literal("task_status_changed"),
      v.literal("comment_added"),
      v.literal("project_assigned"),
      v.literal("deadline_soon"),
    ),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    commentId: v.optional(v.id("comments")),
    title: v.string(),
    body: v.optional(v.string()),
    readAt: v.optional(v.number()),
    emailSentAt: v.optional(v.number()),
  })
    .index("by_recipient", ["recipientId"])
    .index("by_recipient_unread", ["recipientId", "readAt"]),

  taskWatchers: defineTable({
    taskId: v.id("tasks"),
    userId: v.id("users"),
  })
    .index("by_task", ["taskId"])
    .index("by_user", ["userId"])
    .index("by_task_and_user", ["taskId", "userId"]),

  commentReactions: defineTable({
    commentId: v.id("comments"),
    userId: v.id("users"),
    emoji: v.string(),
  })
    .index("by_comment", ["commentId"])
    .index("by_user_emoji", ["userId", "emoji"])
    .index("by_comment_user_emoji", ["commentId", "userId", "emoji"]),

  timeEntries: defineTable({
    userId: v.id("users"),
    projectId: v.id("projects"),
    taskId: v.optional(v.id("tasks")),
    startTime: v.number(),
    endTime: v.number(),
    hours: v.number(),
    note: v.optional(v.string()),
  })
    .index("by_user_start", ["userId", "startTime"])
    .index("by_project_start", ["projectId", "startTime"])
    .index("by_task", ["taskId"])
    .index("by_start", ["startTime"]),

  milestones: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    dueDate: v.number(),
    order: v.number(),
    status: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    approverId: v.id("users"),
    submittedBy: v.optional(v.id("users")),
    submittedAt: v.optional(v.number()),
    submitNote: v.optional(v.string()),
    decidedBy: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_order", ["projectId", "order"])
    .index("by_approver", ["approverId"])
    .index("by_approver_and_status", ["approverId", "status"])
    .index("by_due", ["dueDate"]),

  auditLog: defineTable({
    actorId: v.id("users"),
    action: v.string(),
    entityType: v.union(
      v.literal("project"),
      v.literal("task"),
      v.literal("comment"),
      v.literal("user"),
      v.literal("dependency"),
      v.literal("attachment"),
      v.literal("template"),
      v.literal("milestone"),
    ),
    entityId: v.string(),
    projectId: v.optional(v.id("projects")),
    summary: v.string(),
    details: v.optional(v.any()),
  })
    .index("by_actor", ["actorId"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_project", ["projectId"]),
});
