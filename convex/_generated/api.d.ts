/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attachments from "../attachments.js";
import type * as auditLog from "../auditLog.js";
import type * as auth from "../auth.js";
import type * as comments from "../comments.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as deadlines from "../deadlines.js";
import type * as dependencies from "../dependencies.js";
import type * as directorDashboard from "../directorDashboard.js";
import type * as email from "../email.js";
import type * as emailInternal from "../emailInternal.js";
import type * as http from "../http.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_scheduling from "../lib/scheduling.js";
import type * as notifications from "../notifications.js";
import type * as projects from "../projects.js";
import type * as reactions from "../reactions.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as tasks from "../tasks.js";
import type * as templates from "../templates.js";
import type * as timeEntries from "../timeEntries.js";
import type * as timeReminders from "../timeReminders.js";
import type * as users from "../users.js";
import type * as watchers from "../watchers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  attachments: typeof attachments;
  auditLog: typeof auditLog;
  auth: typeof auth;
  comments: typeof comments;
  constants: typeof constants;
  crons: typeof crons;
  deadlines: typeof deadlines;
  dependencies: typeof dependencies;
  directorDashboard: typeof directorDashboard;
  email: typeof email;
  emailInternal: typeof emailInternal;
  http: typeof http;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/notify": typeof lib_notify;
  "lib/permissions": typeof lib_permissions;
  "lib/scheduling": typeof lib_scheduling;
  notifications: typeof notifications;
  projects: typeof projects;
  reactions: typeof reactions;
  search: typeof search;
  seed: typeof seed;
  tasks: typeof tasks;
  templates: typeof templates;
  timeEntries: typeof timeEntries;
  timeReminders: typeof timeReminders;
  users: typeof users;
  watchers: typeof watchers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
