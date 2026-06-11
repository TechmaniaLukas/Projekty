import { mutation } from "./_generated/server";
import { ConvexError } from "convex/values";
import { requireRole } from "./lib/auth";
import type { Id } from "./_generated/dataModel";

const SEED_USER_EMAILS = [
  "pm+test@techmania.cz",
  "it+test@techmania.cz",
  "facility+test@techmania.cz",
  "vyroba+test@techmania.cz",
  "member+test@techmania.cz",
];

const SEED_PROJECT_NAMES = [
  "Modernizace IT infrastruktury",
  "Údržba expozic – Q2",
  "Rekonstrukce expozice",
];

const SEED_TEMPLATE_NAMES = [
  "Vývoj nové expozice",
  "Nový exponát",
  "Stavební práce",
  "Vývoj exponátu (detailní)",
];

/**
 * Smaže VEŠKERÁ ukázková (seed) data — 5 test účtů, 3 ukázkové projekty a
 * 3 šablony, včetně všech navázaných entit (úkoly, komentáře, milníky,
 * závislosti, výkazy, přílohy, watchers, reakce, členové).
 * Reálná data (skuteční uživatelé a projekty) zůstanou nedotčená.
 */
export const purgeDevData = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin"]);

    let deletedProjects = 0;
    let deletedTasks = 0;
    let deletedUsers = 0;

    // 1) Najdi ukázkové projekty + šablony podle přesného názvu
    const allProjects = await ctx.db.query("projects").collect();
    const targetProjects = allProjects.filter(
      (p) =>
        SEED_PROJECT_NAMES.includes(p.name) ||
        (p.isTemplate && SEED_TEMPLATE_NAMES.includes(p.name)),
    );

    for (const project of targetProjects) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();

      for (const t of tasks) {
        // komentáře úkolu + reakce
        const comments = await ctx.db
          .query("comments")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        for (const c of comments) {
          const reactions = await ctx.db
            .query("commentReactions")
            .withIndex("by_comment", (q) => q.eq("commentId", c._id))
            .collect();
          for (const r of reactions) await ctx.db.delete(r._id);
          await ctx.db.delete(c._id);
        }
        // závislosti úkolů
        const depA = await ctx.db
          .query("taskDependencies")
          .withIndex("by_blocking", (q) => q.eq("blockingTaskId", t._id))
          .collect();
        const depB = await ctx.db
          .query("taskDependencies")
          .withIndex("by_blocked", (q) => q.eq("blockedTaskId", t._id))
          .collect();
        for (const d of [...depA, ...depB]) await ctx.db.delete(d._id);
        // přílohy
        const atts = await ctx.db
          .query("attachments")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        for (const a of atts) {
          try {
            await ctx.storage.delete(a.storageId);
          } catch {
            /* soubor už neexistuje */
          }
          await ctx.db.delete(a._id);
        }
        // watchers
        const watchers = await ctx.db
          .query("taskWatchers")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        for (const w of watchers) await ctx.db.delete(w._id);
        // výkazy navázané na úkol — odpoj (nemažeme čas, jen referenci)
        const tEntries = await ctx.db
          .query("timeEntries")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        for (const te of tEntries) await ctx.db.delete(te._id);
        // checklist položky úkolu
        const checklist = await ctx.db
          .query("checklistItems")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        for (const ci of checklist) await ctx.db.delete(ci._id);
        await ctx.db.delete(t._id);
        deletedTasks++;
      }

      // milníky projektu + jejich komentáře/závislosti
      const milestones = await ctx.db
        .query("milestones")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      for (const m of milestones) {
        const mComments = await ctx.db
          .query("milestoneComments")
          .withIndex("by_milestone", (q) => q.eq("milestoneId", m._id))
          .collect();
        for (const c of mComments) await ctx.db.delete(c._id);
        const mDepA = await ctx.db
          .query("milestoneDependencies")
          .withIndex("by_blocking", (q) =>
            q.eq("blockingMilestoneId", m._id),
          )
          .collect();
        const mDepB = await ctx.db
          .query("milestoneDependencies")
          .withIndex("by_blocked", (q) => q.eq("blockedMilestoneId", m._id))
          .collect();
        for (const d of [...mDepA, ...mDepB]) await ctx.db.delete(d._id);
        await ctx.db.delete(m._id);
      }

      // časové záznamy projektu (bez taskId)
      const projEntries = await ctx.db
        .query("timeEntries")
        .withIndex("by_project_start", (q) =>
          q.eq("projectId", project._id),
        )
        .collect();
      for (const te of projEntries) await ctx.db.delete(te._id);

      // členové projektu
      const members = await ctx.db
        .query("projectMembers")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      for (const pm of members) await ctx.db.delete(pm._id);

      // kontakty projektu
      const contacts = await ctx.db
        .query("projectContacts")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      for (const c of contacts) await ctx.db.delete(c._id);

      await ctx.db.delete(project._id);
      deletedProjects++;
    }

    // 2) Smaž test účty + jejich auth záznamy
    for (const email of SEED_USER_EMAILS) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .first();
      if (!user) continue;
      const accounts = await ctx.db
        .query("authAccounts")
        .filter((q) => q.eq(q.field("userId"), user._id))
        .collect();
      for (const a of accounts) await ctx.db.delete(a._id);
      const sessions = await ctx.db
        .query("authSessions")
        .filter((q) => q.eq(q.field("userId"), user._id))
        .collect();
      for (const s of sessions) await ctx.db.delete(s._id);
      // výkazy ke schválení a uložené pohledy test účtu
      const subs = await ctx.db
        .query("timesheetSubmissions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      for (const s of subs) await ctx.db.delete(s._id);
      const views = await ctx.db
        .query("savedViews")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      for (const sv of views) await ctx.db.delete(sv._id);
      await ctx.db.delete(user._id);
      deletedUsers++;
    }

    return { ok: true, deletedProjects, deletedTasks, deletedUsers };
  },
});

export const seedDevData = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireRole(ctx, ["admin"]);

    const ensureUser = async (
      email: string,
      name: string,
      role: "admin" | "pm" | "department_lead" | "member",
      department?: "it" | "facility" | "vyroba",
    ): Promise<Id<"users">> => {
      const existing = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          role,
          department,
          isActive: true,
          name,
        });
        return existing._id;
      }
      return await ctx.db.insert("users", {
        email,
        name,
        role,
        department,
        isActive: true,
      });
    };

    const pmId = await ensureUser("pm+test@techmania.cz", "Petr Manažer", "pm");
    const itLeadId = await ensureUser(
      "it+test@techmania.cz",
      "Iveta Tichá",
      "department_lead",
      "it",
    );
    const facilityLeadId = await ensureUser(
      "facility+test@techmania.cz",
      "Filip Stavební",
      "department_lead",
      "facility",
    );
    const vyrobaLeadId = await ensureUser(
      "vyroba+test@techmania.cz",
      "Veronika Výroba",
      "department_lead",
      "vyroba",
    );
    const memberId = await ensureUser(
      "member+test@techmania.cz",
      "Marek Člen",
      "member",
      "it",
    );

    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const ensureProject = async (name: string, args: {
      department: "it" | "facility" | "vyroba" | "cross";
      ownerId: Id<"users">;
      deadline?: number;
      priority?: "low" | "medium" | "high" | "critical";
    }): Promise<Id<"projects">> => {
      const existing = await ctx.db
        .query("projects")
        .filter((q) => q.eq(q.field("name"), name))
        .first();
      if (existing) return existing._id;
      return await ctx.db.insert("projects", {
        name,
        description: `Ukázkový projekt: ${name}`,
        ownerId: args.ownerId,
        department: args.department,
        status: "active",
        priority: args.priority ?? "medium",
        deadline: args.deadline,
        createdBy: admin._id,
      });
    };

    const project1 = await ensureProject("Modernizace IT infrastruktury", {
      department: "it",
      ownerId: pmId,
      deadline: now + 30 * day,
      priority: "high",
    });

    const project2 = await ensureProject("Údržba expozic – Q2", {
      department: "facility",
      ownerId: pmId,
      deadline: now + 45 * day,
      priority: "medium",
    });

    const project3 = await ensureProject("Rekonstrukce expozice", {
      department: "cross",
      ownerId: pmId,
      deadline: now + 60 * day,
      priority: "high",
    });

    const ensureTask = async (
      projectId: Id<"projects">,
      title: string,
      args: {
        parentTaskId?: Id<"tasks">;
        assigneeId?: Id<"users">;
        deadline?: number;
        order: number;
        status?: "todo" | "in_progress" | "blocked" | "review" | "done";
        priority?: "low" | "medium" | "high" | "critical";
      },
    ): Promise<Id<"tasks">> => {
      const all = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
      const existing = all.find((t) => t.title === title && t.parentTaskId === args.parentTaskId);
      if (existing) return existing._id;
      return await ctx.db.insert("tasks", {
        projectId,
        parentTaskId: args.parentTaskId,
        title,
        assigneeId: args.assigneeId,
        status: args.status ?? "todo",
        priority: args.priority ?? "medium",
        deadline: args.deadline,
        order: args.order,
        createdBy: admin._id,
      });
    };

    await ensureTask(project1, "Inventura serveroven", {
      assigneeId: itLeadId,
      deadline: now + 7 * day,
      order: 0,
      priority: "high",
    });
    const networkTask = await ensureTask(project1, "Síťová infrastruktura", {
      assigneeId: itLeadId,
      deadline: now + 14 * day,
      order: 1,
    });
    await ensureTask(project1, "Audit přepínačů", {
      parentTaskId: networkTask,
      assigneeId: memberId,
      deadline: now + 10 * day,
      order: 0,
    });
    await ensureTask(project1, "Zálohovací řešení", {
      assigneeId: memberId,
      status: "in_progress",
      deadline: now + 21 * day,
      order: 2,
    });

    await ensureTask(project2, "Revize osvětlení", {
      assigneeId: facilityLeadId,
      deadline: now + 10 * day,
      order: 0,
    });
    await ensureTask(project2, "Klimatizace – servis", {
      assigneeId: facilityLeadId,
      deadline: now + 20 * day,
      order: 1,
    });

    const demolitionTask = await ensureTask(project3, "Demontáž", {
      assigneeId: vyrobaLeadId,
      deadline: now + 14 * day,
      order: 0,
      priority: "high",
    });
    await ensureTask(project3, "Demontáž panelů", {
      parentTaskId: demolitionTask,
      assigneeId: memberId,
      deadline: now + 7 * day,
      order: 0,
    });
    await ensureTask(project3, "Odvoz materiálu", {
      parentTaskId: demolitionTask,
      assigneeId: memberId,
      deadline: now + 10 * day,
      order: 1,
    });
    await ensureTask(project3, "Elektro instalace", {
      assigneeId: itLeadId,
      deadline: now + 30 * day,
      order: 1,
      priority: "high",
    });
    await ensureTask(project3, "Montáž nových panelů", {
      assigneeId: facilityLeadId,
      deadline: now + 50 * day,
      order: 2,
    });

    const ensureTemplate = async (
      name: string,
      args: {
        description: string;
        department: "it" | "facility" | "vyroba" | "cross";
      },
    ): Promise<Id<"projects">> => {
      const existing = await ctx.db
        .query("projects")
        .filter((q) => q.eq(q.field("name"), name))
        .first();
      if (existing) return existing._id;
      return await ctx.db.insert("projects", {
        name,
        description: args.description,
        ownerId: admin._id,
        department: args.department,
        status: "planning",
        priority: "medium",
        createdBy: admin._id,
        isTemplate: true,
      });
    };

    const ensureTemplateTask = async (
      templateId: Id<"projects">,
      title: string,
      args: {
        parentTaskId?: Id<"tasks">;
        order: number;
        priority?: "low" | "medium" | "high" | "critical";
        description?: string;
      },
    ): Promise<Id<"tasks">> => {
      const all = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", templateId))
        .collect();
      const existing = all.find(
        (t) => t.title === title && t.parentTaskId === args.parentTaskId,
      );
      if (existing) return existing._id;
      return await ctx.db.insert("tasks", {
        projectId: templateId,
        parentTaskId: args.parentTaskId,
        title,
        description: args.description,
        status: "todo",
        priority: args.priority ?? "medium",
        order: args.order,
        createdBy: admin._id,
      });
    };

    const tplExpozice = await ensureTemplate("Vývoj nové expozice", {
      description:
        "Typový proces od konceptu po otevření. Použij pro velké expoziční projekty napříč odděleními.",
      department: "cross",
    });
    const koncept = await ensureTemplateTask(tplExpozice, "1. Koncept a schválení", {
      order: 0,
      priority: "high",
    });
    await ensureTemplateTask(tplExpozice, "Sběr požadavků a brief", {
      parentTaskId: koncept,
      order: 0,
    });
    await ensureTemplateTask(tplExpozice, "Návrh expozice + vizualizace", {
      parentTaskId: koncept,
      order: 1,
    });
    await ensureTemplateTask(tplExpozice, "Schválení vedení + rozpočet", {
      parentTaskId: koncept,
      order: 2,
      priority: "critical",
    });
    const priprava = await ensureTemplateTask(tplExpozice, "2. Příprava prostoru", {
      order: 1,
    });
    await ensureTemplateTask(tplExpozice, "Demontáž stávající expozice", {
      parentTaskId: priprava,
      order: 0,
    });
    await ensureTemplateTask(tplExpozice, "Stavební úpravy", {
      parentTaskId: priprava,
      order: 1,
    });
    await ensureTemplateTask(tplExpozice, "Elektroinstalace + síť", {
      parentTaskId: priprava,
      order: 2,
    });
    const vyroba = await ensureTemplateTask(tplExpozice, "3. Výroba a kompletace", {
      order: 2,
    });
    await ensureTemplateTask(tplExpozice, "Výroba exponátů (subdodávka / vlastní dílna)", {
      parentTaskId: vyroba,
      order: 0,
    });
    await ensureTemplateTask(tplExpozice, "Grafika a popisky", {
      parentTaskId: vyroba,
      order: 1,
    });
    await ensureTemplateTask(tplExpozice, "Multimédia + AV technika", {
      parentTaskId: vyroba,
      order: 2,
    });
    const finis = await ensureTemplateTask(tplExpozice, "4. Instalace + spuštění", {
      order: 3,
      priority: "high",
    });
    await ensureTemplateTask(tplExpozice, "Instalace na místě", {
      parentTaskId: finis,
      order: 0,
    });
    await ensureTemplateTask(tplExpozice, "Testování + revize bezpečnosti", {
      parentTaskId: finis,
      order: 1,
      priority: "high",
    });
    await ensureTemplateTask(tplExpozice, "Školení průvodců", {
      parentTaskId: finis,
      order: 2,
    });
    await ensureTemplateTask(tplExpozice, "Soft-opening + final fixes", {
      parentTaskId: finis,
      order: 3,
    });

    const tplExponat = await ensureTemplate("Nový exponát", {
      description:
        "Vývoj jednoho exponátu od nápadu po umístění do expozice. Menší rozsah než celá expozice.",
      department: "vyroba",
    });
    await ensureTemplateTask(tplExponat, "Návrh + skicy", { order: 0 });
    await ensureTemplateTask(tplExponat, "Konstrukční dokumentace", { order: 1 });
    await ensureTemplateTask(tplExponat, "Materiály — objednávka", { order: 2 });
    await ensureTemplateTask(tplExponat, "Výroba prototypu", {
      order: 3,
      priority: "high",
    });
    await ensureTemplateTask(tplExponat, "Testování + úpravy", { order: 4 });
    await ensureTemplateTask(tplExponat, "Finální výroba", { order: 5 });
    await ensureTemplateTask(tplExponat, "Grafika + popisky", { order: 6 });
    await ensureTemplateTask(tplExponat, "Instalace v expozici", {
      order: 7,
      priority: "high",
    });

    const tplStavba = await ensureTemplate("Stavební práce", {
      description:
        "Typový stavební projekt — rekonstrukce prostoru, úprava místnosti, větší údržba.",
      department: "facility",
    });
    await ensureTemplateTask(tplStavba, "Zaměření a fotodokumentace", { order: 0 });
    await ensureTemplateTask(tplStavba, "Cenová poptávka u dodavatelů", { order: 1 });
    await ensureTemplateTask(tplStavba, "Výběr dodavatele + smlouva", {
      order: 2,
      priority: "high",
    });
    await ensureTemplateTask(tplStavba, "Vyklizení prostoru", { order: 3 });
    await ensureTemplateTask(tplStavba, "Stavební práce — průběh", {
      order: 4,
      description: "Pravidelné kontroly + fotodokumentace.",
    });
    await ensureTemplateTask(tplStavba, "Předání + reklamační lhůta", {
      order: 5,
      priority: "high",
    });
    await ensureTemplateTask(tplStavba, "Úklid + uvedení do provozu", { order: 6 });

    return {
      ok: true,
      users: { admin: admin._id, pm: pmId, itLead: itLeadId, facilityLead: facilityLeadId, vyrobaLead: vyrobaLeadId, member: memberId },
      projects: { project1, project2, project3 },
      templates: { tplExpozice, tplExponat, tplStavba },
    };
  },
});

/**
 * Detailní šablona "Vývoj exponátu" — realistická struktura podle workflow
 * Techmania (9 fází, ~30 úkolů s odhady, akceptační checklisty u klíčových
 * úkolů). Idempotentní — opakované spuštění doplní jen chybějící úkoly.
 */
export const seedExhibitTemplate = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireRole(ctx, ["admin"]);
    const NAME = "Vývoj exponátu (detailní)";

    let tpl = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("name"), NAME))
      .first();
    if (!tpl) {
      const id = await ctx.db.insert("projects", {
        name: NAME,
        description:
          "Kompletní workflow vývoje nového exponátu od konceptu po předání do provozu. 9 fází, milníky M1–M6 doplň v UI podle konkrétního projektu.",
        ownerId: admin._id,
        department: "cross",
        status: "planning",
        priority: "medium",
        createdBy: admin._id,
        isTemplate: true,
      });
      tpl = await ctx.db.get(id);
    }
    if (!tpl) throw new Error("template insert failed");
    const tplId = tpl._id;

    const ensureTask = async (
      title: string,
      args: {
        parentTaskId?: Id<"tasks">;
        order: number;
        priority?: "low" | "medium" | "high" | "critical";
        description?: string;
        estimateHours?: number;
        skill?:
          | "truhlar"
          | "kovak"
          | "elektro"
          | "montaz"
          | "konstrukce"
          | "sw"
          | "grafika"
          | "av";
      },
    ): Promise<Id<"tasks">> => {
      const all = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", tplId))
        .collect();
      const existing = all.find(
        (t) => t.title === title && t.parentTaskId === args.parentTaskId,
      );
      if (existing) {
        // Doplň odhad/popis/skill, kdyby chybělo
        const patch: Record<string, unknown> = {};
        if (
          args.estimateHours !== undefined &&
          existing.estimateHours === undefined
        )
          patch.estimateHours = args.estimateHours;
        if (args.description && !existing.description)
          patch.description = args.description;
        if (args.skill && !existing.skill) patch.skill = args.skill;
        if (Object.keys(patch).length > 0) await ctx.db.patch(existing._id, patch);
        return existing._id;
      }
      return await ctx.db.insert("tasks", {
        projectId: tplId,
        parentTaskId: args.parentTaskId,
        title,
        description: args.description,
        status: "todo",
        priority: args.priority ?? "medium",
        order: args.order,
        estimateHours: args.estimateHours,
        skill: args.skill,
        createdBy: admin._id,
      });
    };

    const ensureChecklist = async (
      taskId: Id<"tasks">,
      items: string[],
    ) => {
      const existing = await ctx.db
        .query("checklistItems")
        .withIndex("by_task", (q) => q.eq("taskId", taskId))
        .collect();
      if (existing.length > 0) return; // už nějaký checklist je → nenahrazuj
      let order = 0;
      for (const text of items) {
        await ctx.db.insert("checklistItems", {
          taskId,
          text,
          done: false,
          order: order++,
          createdBy: admin._id,
        });
      }
    };

    // Fáze 1 — Koncept
    const f1 = await ensureTask("1. Koncept a schválení", {
      order: 0,
      priority: "high",
    });
    const brief = await ensureTask("Sběr požadavků a brief", {
      parentTaskId: f1,
      order: 0,
      estimateHours: 8,
      skill: "konstrukce",
    });
    await ensureChecklist(brief, [
      "Definovaný cílový věk návštěvníků",
      "Vzdělávací cíl exponátu",
      "Předpokládaný prostor v expozici",
      "Rozpočtový rámec",
    ]);
    await ensureTask("Návrh exponátu + vizualizace", {
      parentTaskId: f1,
      order: 1,
      estimateHours: 16,
      skill: "konstrukce",
    });
    const norm = await ensureTask("Bezpečnostní a normové posouzení", {
      parentTaskId: f1,
      order: 2,
      estimateHours: 4,
      skill: "konstrukce",
    });
    await ensureChecklist(norm, [
      "ČSN EN 71 (bezpečnost hraček) — relevantní body",
      "Elektrobezpečnost (pokud relevantní)",
      "Hořlavost materiálů",
      "Ochrana před úrazem (ostré hrany, skřípnutí)",
    ]);
    await ensureTask("Schválení vedení + rozpočet (M1)", {
      parentTaskId: f1,
      order: 3,
      priority: "critical",
      estimateHours: 4,
      description:
        "Milník M1 — Schválený koncept. Po dokončení založ v záložce Milníky a přiřaď ředitele jako schvalovatele.",
    });

    // Fáze 2 — Konstrukce
    const f2 = await ensureTask("2. Konstrukční dokumentace", { order: 1 });
    await ensureTask("Konstrukční dokumentace (CAD)", {
      parentTaskId: f2,
      order: 0,
      estimateHours: 40,
      skill: "konstrukce",
    });
    const bom = await ensureTask("Specifikace materiálu a komponent (BOM)", {
      parentTaskId: f2,
      order: 1,
      estimateHours: 8,
      skill: "konstrukce",
    });
    await ensureChecklist(bom, [
      "Hlavní materiály a rozměry",
      "Spojovací materiál",
      "Povrchové úpravy",
      "Certifikáty / atesty",
    ]);
    await ensureTask("Elektrodokumentace", {
      parentTaskId: f2,
      order: 2,
      estimateHours: 16,
      skill: "elektro",
      description: "Pouze pokud exponát obsahuje elektronické / silnoproudé části.",
    });
    await ensureTask("Vlastní výroba vs. subdodávka — rozhodnutí", {
      parentTaskId: f2,
      order: 3,
      estimateHours: 4,
      skill: "konstrukce",
    });
    await ensureTask("Schválení konstrukce (M2)", {
      parentTaskId: f2,
      order: 4,
      priority: "high",
      description:
        "Milník M2 — Schvaluje vedoucí Výroby. Vytvoř milník a přiřaď.",
    });

    // Fáze 3 — Materiál
    const f3 = await ensureTask("3. Materiál a subdodávky", { order: 2 });
    await ensureTask("Cenová poptávka u dodavatelů", {
      parentTaskId: f3,
      order: 0,
      estimateHours: 8,
      skill: "konstrukce",
      description:
        "Min. 3 nabídky, srovnání kvalita/cena/termín. Dodavatele přidej do záložky Kontakty.",
    });
    await ensureTask("Výběr dodavatelů + smlouvy", {
      parentTaskId: f3,
      order: 1,
      estimateHours: 4,
      skill: "konstrukce",
    });
    await ensureTask("Objednávka materiálu", {
      parentTaskId: f3,
      order: 2,
      estimateHours: 2,
      skill: "konstrukce",
    });
    await ensureTask("Sledování dodacích termínů", {
      parentTaskId: f3,
      order: 3,
      description: "Průběžně — kontaktuj dodavatele 2× týdně.",
    });

    // Fáze 4 — Prototyp
    const f4 = await ensureTask("4. Výroba prototypu", { order: 3 });
    await ensureTask("Výroba mechanických částí", {
      parentTaskId: f4,
      order: 0,
      estimateHours: 40,
      skill: "truhlar",
    });
    await ensureTask("Výroba elektroniky / zapojení", {
      parentTaskId: f4,
      order: 1,
      estimateHours: 24,
      skill: "elektro",
    });
    await ensureTask("Vývoj SW / interakce", {
      parentTaskId: f4,
      order: 2,
      estimateHours: 40,
      skill: "sw",
      description: "Pouze u digitálních exponátů. Řešitel: IT oddělení.",
    });
    await ensureTask("Kompletace prototypu", {
      parentTaskId: f4,
      order: 3,
      estimateHours: 16,
      skill: "montaz",
    });

    // Fáze 5 — Testování
    const f5 = await ensureTask("5. Testování", { order: 4 });
    const funcTest = await ensureTask("Funkční test", {
      parentTaskId: f5,
      order: 0,
      estimateHours: 8,
      skill: "montaz",
    });
    await ensureChecklist(funcTest, [
      "Všechny scénáře interakce projdou",
      "Krajní stavy (overload, opakování)",
      "Reset / návrat do výchozího stavu funguje",
      "Spotřeba a tepelný režim v normě",
    ]);
    const safetyTest = await ensureTask("Bezpečnostní revize", {
      parentTaskId: f5,
      order: 1,
      priority: "critical",
      estimateHours: 4,
      skill: "elektro",
      description: "Externí revizní technik — přidej kontakt do záložky Kontakty.",
    });
    await ensureChecklist(safetyTest, [
      "Elektrorevize (pokud relevantní)",
      "Mechanická bezpečnost",
      "Revizní protokol jako příloha",
    ]);
    const userTest = await ensureTask(
      "Uživatelský test s návštěvníky",
      { parentTaskId: f5, order: 2, estimateHours: 16, skill: "konstrukce" },
    );
    await ensureChecklist(userTest, [
      "Min. 10 dětí ve 3 věkových skupinách",
      "Dotazník po interakci",
      "Strukturované pozorování",
      "Sepsání zjištění",
    ]);
    await ensureTask("Vyhodnocení a seznam úprav", {
      parentTaskId: f5,
      order: 3,
      estimateHours: 4,
      skill: "konstrukce",
    });
    await ensureTask("Prototyp prošel testy (M3)", {
      parentTaskId: f5,
      order: 4,
      priority: "high",
      description:
        "Milník M3 — Schvaluje vedoucí Výroby (+ vedoucí IT pokud SW).",
    });

    // Fáze 6 — Úpravy a finální výroba
    const f6 = await ensureTask("6. Úpravy a finální výroba", { order: 5 });
    await ensureTask("Zapracování úprav", {
      parentTaskId: f6,
      order: 0,
      estimateHours: 16,
      skill: "truhlar",
    });
    await ensureTask("Finální výroba sériových dílů", {
      parentTaskId: f6,
      order: 1,
      estimateHours: 60,
      skill: "truhlar",
    });
    await ensureTask("Povrchové úpravy a finalizace", {
      parentTaskId: f6,
      order: 2,
      estimateHours: 16,
      skill: "truhlar",
    });
    await ensureTask("Finální výroba dokončena (M4)", {
      parentTaskId: f6,
      order: 3,
      description: "Milník M4 — Schvaluje vedoucí Výroby.",
    });

    // Fáze 7 — Grafika a obsah
    const f7 = await ensureTask("7. Grafika a obsah", { order: 6 });
    const texts = await ensureTask("Texty CS + EN", {
      parentTaskId: f7,
      order: 0,
      estimateHours: 8,
      skill: "grafika",
    });
    await ensureChecklist(texts, [
      "Vhodný věk a srozumitelnost (ověřeno popularizátorem)",
      "Dvojjazyčně CS / EN",
      "Klíčové bezpečnostní pokyny",
    ]);
    await ensureTask("Grafický design popisků", {
      parentTaskId: f7,
      order: 1,
      estimateHours: 12,
      skill: "grafika",
    });
    await ensureTask("Tisk a aplikace popisků", {
      parentTaskId: f7,
      order: 2,
      estimateHours: 4,
      skill: "grafika",
    });
    await ensureTask("Multimédia (video/audio)", {
      parentTaskId: f7,
      order: 3,
      estimateHours: 16,
      skill: "av",
      description: "Pouze pokud relevantní.",
    });

    // Fáze 8 — Instalace
    const f8 = await ensureTask("8. Instalace v expozici", {
      order: 7,
      priority: "high",
    });
    await ensureTask("Příprava místa v expozici", {
      parentTaskId: f8,
      order: 0,
      estimateHours: 8,
      skill: "montaz",
      description: "Facility.",
    });
    await ensureTask("Elektrická / síťová příprava", {
      parentTaskId: f8,
      order: 1,
      estimateHours: 4,
      skill: "elektro",
      description: "IT + Facility.",
    });
    await ensureTask("Instalace exponátu na místě", {
      parentTaskId: f8,
      order: 2,
      estimateHours: 16,
      skill: "montaz",
    });
    await ensureTask("Finální seřízení a kalibrace", {
      parentTaskId: f8,
      order: 3,
      estimateHours: 4,
      skill: "montaz",
    });
    await ensureTask("Instalace dokončena (M5)", {
      parentTaskId: f8,
      order: 4,
      description: "Milník M5 — Schvaluje vedoucí Facility.",
    });

    // Fáze 9 — Akceptace a předání
    const f9 = await ensureTask("9. Akceptace a předání", { order: 8 });
    await ensureTask("Bezpečnostní revize na místě + protokol", {
      parentTaskId: f9,
      order: 0,
      priority: "critical",
      estimateHours: 4,
      skill: "elektro",
    });
    await ensureTask("Soft-opening (interní pilot)", {
      parentTaskId: f9,
      order: 1,
      estimateHours: 8,
      skill: "montaz",
    });
    const training = await ensureTask("Školení průvodců", {
      parentTaskId: f9,
      order: 2,
      estimateHours: 4,
      skill: "konstrukce",
    });
    await ensureChecklist(training, [
      "Použití a interakce s exponátem",
      "Časté otázky návštěvníků",
      "Krizové scénáře (porucha, úraz)",
      "Reset / restart exponátu",
    ]);
    await ensureTask("Údržbová dokumentace", {
      parentTaskId: f9,
      order: 3,
      estimateHours: 4,
      skill: "konstrukce",
    });
    await ensureTask("Akceptace a předání do provozu (M6)", {
      parentTaskId: f9,
      order: 4,
      priority: "high",
      description: "Milník M6 — Schvaluje ředitel. Závisí na M5.",
    });

    return { ok: true, templateId: tplId };
  },
});
