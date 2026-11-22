import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Branch } from "../../lib/types";

interface BranchState {
  branchId: number | null;
  branchName: string | null;
  branches: Branch[];
  setBranchId: (id: number) => void;
}

const BranchContext = createContext<BranchState | null>(null);
const STORAGE_KEY = "admin-pos-branch";

export function useBranch(): BranchState {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch outside BranchProvider");
  return ctx;
}

export function useBranchId(): number {
  const { branchId } = useBranch();
  if (branchId === null) throw new Error("branch not ready");
  return branchId;
}

function readStored(): number | null {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

// Cabang yang sedang dikelola. Default: KIOSK_DEFAULT_BRANCH di server (Jatibening), atau pilihan terakhir di browser ini.
export function BranchProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<number | null>(readStored);
  const { data } = useQuery({
    queryKey: ["branches"],
    queryFn: () => api.get<{ default_branch_id: number | null; branches: Branch[] }>("/branches"),
  });
  const branches = data?.branches ?? [];

  useEffect(() => {
    if (!data) return;
    if (selected && data.branches.some((b) => b.id === selected)) return;
    const fallback = data.default_branch_id ?? data.branches[0]?.id ?? null;
    if (fallback) setSelected(fallback);
  }, [data, selected]);

  const setBranchId = (id: number) => {
    setSelected(id);
    try {
      localStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      /* private mode */
    }
  };

  const branchId = selected && branches.some((b) => b.id === selected) ? selected : null;
  const branchName = branches.find((b) => b.id === branchId)?.name ?? null;
  return <BranchContext.Provider value={{ branchId, branchName, branches, setBranchId }}>{children}</BranchContext.Provider>;
}
