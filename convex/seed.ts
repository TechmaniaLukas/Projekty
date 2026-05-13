import { mutation } from "./_generated/server";
import { ConvexError } from "convex/values";
import { requireRole } from "./lib/auth";
import type { Id } from "./_generated/dataModel";

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
