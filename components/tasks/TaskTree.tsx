"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/convex/_generated/api";
import { TaskRow } from "./TaskRow";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import { QuickAddTaskRow } from "./QuickAddTaskRow";
import { BulkTaskActionBar } from "./BulkTaskActionBar";
import { useToast } from "@/components/ui/toast";

interface Props {
  projectId: Id<"projects">;
  project: Doc<"projects">;
}

interface TreeNode {
  task: Doc<"tasks">;
  children: TreeNode[];
}

function buildTree(tasks: Doc<"tasks">[]): TreeNode[] {
  const byParent = new Map<string | "root", Doc<"tasks">[]>();
  for (const t of tasks) {
    const key = t.parentTaskId ?? "root";
    const arr = byParent.get(key) ?? [];
    arr.push(t);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a._creationTime - b._creationTime;
    });
  }
  function build(parentKey: "root" | Id<"tasks">): TreeNode[] {
    const list = byParent.get(parentKey) ?? [];
    return list.map((t) => ({ task: t, children: build(t._id) }));
  }
  return build("root");
}

export function TaskTree({ projectId, project }: Props) {
  const tasks = useQuery(api.tasks.listForProject, { projectId });
  const me = useQuery(api.users.me);
  const users = useQuery(api.users.list, {});
  const reorder = useMutation(api.tasks.reorder);
  const toast = useToast();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openTaskId, setOpenTaskId] = useState<Id<"tasks"> | null>(null);
  const [quickAddParent, setQuickAddParent] = useState<Id<"tasks"> | "root" | null>(null);
  const [filter, setFilter] = useState<"all" | "mine" | "active">("all");
  const searchParams = useSearchParams();
  const taskFromUrl = searchParams.get("task");

  useEffect(() => {
    if (taskFromUrl) setOpenTaskId(taskFromUrl as Id<"tasks">);
  }, [taskFromUrl]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(taskId: Id<"tasks">) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
    setSelectMode(false);
  }

  const userById = useMemo(() => {
    const m = new Map<string, Doc<"users">>();
    for (const u of users ?? []) m.set(u._id, u);
    return m;
  }, [users]);

  const commentCount = useQuery(
    api.comments.countsByTask,
    tasks ? { taskIds: tasks.map((t) => t._id) } : "skip",
  );
  const blockerCounts = useQuery(
    api.dependencies.blockerCounts,
    tasks ? { taskIds: tasks.map((t) => t._id) } : "skip",
  );
  const attachmentCounts = useQuery(
    api.attachments.counts,
    tasks ? { taskIds: tasks.map((t) => t._id) } : "skip",
  );

  const filteredTasks = useMemo(() => {
    if (!tasks) return null;
    let visible = tasks;
    if (filter === "mine" && me) visible = visible.filter((t) => t.assigneeId === me._id);
    if (filter === "active") visible = visible.filter((t) => t.status !== "done");
    if (filter !== "all") {
      const allowedIds = new Set(visible.map((t) => t._id));
      const fullSet = new Set<string>(allowedIds);
      const taskMap = new Map(tasks.map((t) => [t._id as string, t]));
      for (const t of tasks) {
        if (allowedIds.has(t._id)) {
          let cur: Doc<"tasks"> | undefined = t;
          while (cur && cur.parentTaskId) {
            const parentId = cur.parentTaskId as string;
            if (!fullSet.has(parentId)) fullSet.add(parentId);
            cur = taskMap.get(parentId);
          }
        }
      }
      return tasks.filter((t) => fullSet.has(t._id));
    }
    return visible;
  }, [tasks, filter, me]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (tasks === undefined) {
    return <div className="py-8 text-sm text-slate-500 dark:text-slate-400">Načítám úkoly…</div>;
  }
  if (!filteredTasks) return null;

  const tree = buildTree(filteredTasks);

  const canAddTopLevel = !!(
    me &&
    (me.role === "admin" ||
      me.role === "pm" ||
      (me.role === "department_lead" &&
        (project.department === "cross" || project.department === me.department)))
  );

  const canDeleteAnyTask = canAddTopLevel;
  const dragEnabled = canAddTopLevel && filter === "all" && !selectMode;

  function canEditTaskFor(task: Doc<"tasks">) {
    if (!me) return false;
    if (me.role === "admin" || me.role === "pm") return true;
    if (me.role === "department_lead") {
      return project.department === "cross" || project.department === me.department;
    }
    return task.assigneeId === me._id;
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const activeTask = tasks?.find((t) => t._id === activeId);
    const overTask = tasks?.find((t) => t._id === overId);
    if (!activeTask || !overTask) return;
    const activeParent = activeTask.parentTaskId ?? null;
    const overParent = overTask.parentTaskId ?? null;
    if (activeParent !== overParent) return;
    const siblings = (tasks ?? [])
      .filter((t) => (t.parentTaskId ?? null) === activeParent)
      .sort((a, b) => a.order - b.order || a._creationTime - b._creationTime);
    const oldIdx = siblings.findIndex((t) => t._id === activeId);
    const newIdx = siblings.findIndex((t) => t._id === overId);
    if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
    const next = arrayMove(siblings, oldIdx, newIdx);
    try {
      await reorder({
        projectId,
        parentTaskId: (activeParent ?? undefined) as Id<"tasks"> | undefined,
        orderedTaskIds: next.map((t) => t._id),
      });
    } catch (err) {
      toast.error("Přeuspořádání selhalo", err instanceof Error ? err.message : "Chyba");
    }
  }

  const renderNode = (node: TreeNode, depth: number) => {
    const isExpanded = expanded[node.task._id] !== false;
    const childCount = node.children.length;
    const taskCanEdit = canEditTaskFor(node.task);
    return (
      <SortableNode key={node.task._id} id={node.task._id} disabled={!dragEnabled}>
        {(handle) => (
          <>
            <TaskRow
              task={node.task}
              assignee={node.task.assigneeId ? userById.get(node.task.assigneeId) ?? null : null}
              childCount={childCount}
              commentCount={commentCount?.[node.task._id] ?? 0}
              attachmentCount={attachmentCounts?.[node.task._id] ?? 0}
              incompleteBlockers={blockerCounts?.[node.task._id]?.incomplete ?? 0}
              expanded={isExpanded}
              depth={depth}
              canEdit={taskCanEdit}
              canDelete={canDeleteAnyTask}
              canAddSub={canAddTopLevel}
              selectMode={selectMode}
              selected={selectedIds.has(node.task._id)}
              onToggleSelect={() => toggleSelect(node.task._id)}
              onToggle={() =>
                setExpanded((s) => ({ ...s, [node.task._id]: !(s[node.task._id] !== false) }))
              }
              onOpen={() => setOpenTaskId(node.task._id)}
              onAddSub={() => {
                setQuickAddParent(node.task._id);
                setExpanded((s) => ({ ...s, [node.task._id]: true }));
              }}
              dragHandle={dragEnabled ? handle : null}
            />
            {isExpanded && (
              <>
                {quickAddParent === node.task._id && (
                  <QuickAddTaskRow
                    projectId={projectId}
                    parentTaskId={node.task._id}
                    depth={depth + 1}
                    onCancel={() => setQuickAddParent(null)}
                    onCreated={() => setQuickAddParent(null)}
                  />
                )}
                {node.children.length > 0 && (
                  <SortableContext
                    items={node.children.map((c) => c.task._id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {node.children.map((c) => renderNode(c, depth + 1))}
                  </SortableContext>
                )}
              </>
            )}
          </>
        )}
      </SortableNode>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
          {[
            { value: "all", label: "Vše" },
            { value: "mine", label: "Moje" },
            { value: "active", label: "Aktivní" },
          ].map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value as typeof filter)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                filter === f.value
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {canAddTopLevel && (
            <button
              type="button"
              onClick={() => {
                setSelectMode((m) => !m);
                if (selectMode) setSelectedIds(new Set());
              }}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                selectMode
                  ? "border-slate-900 bg-slate-100 text-slate-900 dark:border-slate-100 dark:bg-slate-800 dark:text-slate-100"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {selectMode ? "Konec výběru" : "Hromadná úprava"}
            </button>
          )}
          {canAddTopLevel && quickAddParent !== "root" && !selectMode && (
            <button
              type="button"
              onClick={() => setQuickAddParent("root")}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              + Přidat úkol
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {quickAddParent === "root" && (
          <QuickAddTaskRow
            projectId={projectId}
            parentTaskId={undefined}
            depth={0}
            onCancel={() => setQuickAddParent(null)}
            onCreated={() => setQuickAddParent(null)}
          />
        )}
        {tree.length === 0 && quickAddParent !== "root" ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Žádné úkoly. Přidejte první úkol pomocí tlačítka výše.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tree.map((n) => n.task._id)}
              strategy={verticalListSortingStrategy}
            >
              {tree.map((node) => renderNode(node, 0))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {dragEnabled && tree.length > 0 && (
        <div className="text-[11px] text-slate-400 dark:text-slate-500">
          Tip: úkoly můžeš přetáhnout za úchyt nalevo (jen v rámci stejné úrovně).
        </div>
      )}

      {openTaskId && (
        <TaskDetailDrawer
          taskId={openTaskId}
          project={project}
          onClose={() => setOpenTaskId(null)}
        />
      )}
      {selectMode && selectedIds.size > 0 && (
        <BulkTaskActionBar
          selectedIds={Array.from(selectedIds) as Id<"tasks">[]}
          users={users ?? []}
          onCleared={clearSelection}
        />
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DragHandleProps = { attributes: any; listeners: any };

interface SortableNodeProps {
  id: string;
  disabled: boolean;
  children: (handle: DragHandleProps | null) => React.ReactNode;
}

function SortableNode({ id, disabled, children }: SortableNodeProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "z-10 relative" : undefined}>
      {children(disabled ? null : { attributes, listeners })}
    </div>
  );
}
