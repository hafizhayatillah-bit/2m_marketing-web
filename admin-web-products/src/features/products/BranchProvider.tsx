import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminBranch, SuperBranch, SuperBranchesResponse } from "@2m/shared";
import { api } from "../../lib/api";

interface BranchState {
  branchId: string | null;
  branchName: string | null;
  branches: AdminBranch[];
  setBranchId: (id: string) => void;
}

const BranchContext = createContext<BranchState | null>(null);

export const BRANCH_CONTEXT_KEY = "branch-context";

export function useBranch(): BranchState {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch outside BranchProvider");
  return ctx;
}

const fetchAllBranches = async (): Promise<SuperBranch[]> => (await api.get<SuperBranchesResponse>("/admin/branches")).data.branches;

// Every branch. Shares the cache entry the switcher reads.
export function useAllBranches() {
  return useQuery({ queryKey: [BRANCH_CONTEXT_KEY], queryFn: fetchAllBranches });
}

// Branch whose prices and stock are edited. Login and roles belong to the host project:
// pass `branchId` to pin one branch (for a branch admin), or leave it out to pick from every branch.
export function BranchProvider({ branchId: pinned, children }: { branchId?: string; children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useAllBranches();
  const branches = data ?? [];

  useEffect(() => {
    if (!pinned && !selected && branches.length > 0) setSelected(branches[0]!.id);
  }, [pinned, selected, branches]);

  const branchId = pinned ?? selected;
  const branchName = branches.find((b) => b.id === branchId)?.name ?? null;
  return (
    <BranchContext.Provider value={{ branchId, branchName, branches, setBranchId: setSelected }}>{children}</BranchContext.Provider>
  );
}
