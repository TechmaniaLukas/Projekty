"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ProjectFilters } from "@/components/projects/ProjectFilters";
import { ProjectList } from "@/components/projects/ProjectList";

export default function ProjectsPage() {
  const me = useQuery(api.users.me);
  const canCreate = me?.role === "admin" || me?.role === "pm" || me?.role === "department_lead";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Projekty</h1>
        {canCreate && (
          <Link href="/projekty/novy">
            <Button>
              <Plus className="h-4 w-4" />
              Nový projekt
            </Button>
          </Link>
        )}
      </div>
      <ProjectFilters />
      <ProjectList />
    </div>
  );
}
