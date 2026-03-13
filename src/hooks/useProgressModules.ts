import { useCallback, useContext, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { UserContext } from "../context/UserContext";

export type ProgressModuleType = "paper-ring" | "paper-heatmap" | "question-heatmap";

export const MODULE_TYPE_LABELS: Record<ProgressModuleType, string> = {
  "paper-ring": "Paper Completion Ring",
  "paper-heatmap": "Paper Heatmap",
  "question-heatmap": "Question Heatmap",
};

export const MODULE_TYPE_DESCRIPTIONS: Record<ProgressModuleType, string> = {
  "paper-ring": "Shows how many questions you've ticked off across all papers for a subject.",
  "paper-heatmap": "A grid where each box is a paper, shaded by how much you've completed.",
  "question-heatmap": "A grid of every question across all papers. Shows drawn-on and completed status.",
};

export const MODULE_SIZES: Record<ProgressModuleType, { w: number; h: number }> = {
  "paper-ring": { w: 2, h: 2 },
  "paper-heatmap": { w: 4, h: 3 },
  "question-heatmap": { w: 4, h: 3 },
};

const GRID_COLS = 12;

export type ProgressModuleConfig = {
  id: string;
  type: ProgressModuleType;
  subject: string;
  level: string;
  x: number;
  y: number;
};

function generateId(): string {
  return `mod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function findEmptySpot(
  existing: ProgressModuleConfig[],
  w: number,
  h: number
): { x: number; y: number } {
  const occupied = new Set<string>();
  for (const mod of existing) {
    const size = MODULE_SIZES[mod.type];
    for (let dy = 0; dy < size.h; dy++) {
      for (let dx = 0; dx < size.w; dx++) {
        occupied.add(`${mod.x + dx},${mod.y + dy}`);
      }
    }
  }

  for (let row = 0; row < 100; row++) {
    for (let col = 0; col <= GRID_COLS - w; col++) {
      let fits = true;
      for (let dy = 0; dy < h && fits; dy++) {
        for (let dx = 0; dx < w && fits; dx++) {
          if (occupied.has(`${col + dx},${row + dy}`)) fits = false;
        }
      }
      if (fits) return { x: col, y: row };
    }
  }

  return { x: 0, y: 0 };
}

function migrateModules(raw: unknown[]): ProgressModuleConfig[] {
  const modules: ProgressModuleConfig[] = [];
  for (const item of raw) {
    const m = item as Record<string, unknown>;
    if (!m.id || !m.type) continue;
    const mod: ProgressModuleConfig = {
      id: m.id as string,
      type: m.type as ProgressModuleType,
      subject: (m.subject as string) ?? "",
      level: (m.level as string) ?? "",
      x: typeof m.x === "number" ? m.x : -1,
      y: typeof m.y === "number" ? m.y : -1,
    };
    modules.push(mod);
  }

  let needsMigration = false;
  for (const mod of modules) {
    if (mod.x < 0 || mod.y < 0) {
      const size = MODULE_SIZES[mod.type];
      const placed = modules.filter((m) => m !== mod && m.x >= 0 && m.y >= 0);
      const spot = findEmptySpot(placed, size.w, size.h);
      mod.x = spot.x;
      mod.y = spot.y;
      needsMigration = true;
    }
  }

  return needsMigration ? modules : modules;
}

export function useProgressModules() {
  const { user } = useContext(UserContext);
  const [modules, setModules] = useState<ProgressModuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsPersist, setNeedsPersist] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setModules([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const ref = doc(db, "user-data", user.uid, "settings", "progress-modules");
        const snap = await getDoc(ref);
        if (cancelled) return;
        const data = snap.exists() ? snap.data() : null;
        const raw = Array.isArray(data?.modules) ? data.modules : [];
        const list = migrateModules(raw);

        const hadMigration = raw.some(
          (r: Record<string, unknown>) => typeof r.x !== "number" || typeof r.y !== "number"
        );

        setModules(list);
        if (hadMigration && list.length > 0) setNeedsPersist(true);
      } catch {
        if (!cancelled) setModules([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.uid]);

  const persist = useCallback(
    async (next: ProgressModuleConfig[]) => {
      if (!user?.uid) return;
      try {
        const ref = doc(db, "user-data", user.uid, "settings", "progress-modules");
        await setDoc(ref, { modules: next });
      } catch (err) {
        console.error("Failed to save progress modules:", err);
      }
    },
    [user?.uid]
  );

  useEffect(() => {
    if (needsPersist && modules.length > 0) {
      setNeedsPersist(false);
      persist(modules);
    }
  }, [needsPersist, modules, persist]);

  const addModule = useCallback(
    (type: ProgressModuleType, subject: string, level: string) => {
      const size = MODULE_SIZES[type];
      const spot = findEmptySpot(modules, size.w, size.h);
      const mod: ProgressModuleConfig = {
        id: generateId(),
        type,
        subject,
        level,
        x: spot.x,
        y: spot.y,
      };
      const next = [...modules, mod];
      setModules(next);
      persist(next);
    },
    [modules, persist]
  );

  const removeModule = useCallback(
    (id: string) => {
      const next = modules.filter((m) => m.id !== id);
      setModules(next);
      persist(next);
    },
    [modules, persist]
  );

  const updateLayouts = useCallback(
    (layouts: { i: string; x: number; y: number }[]) => {
      const posMap = new Map(layouts.map((l) => [l.i, { x: l.x, y: l.y }]));
      let changed = false;
      const next = modules.map((m) => {
        const pos = posMap.get(m.id);
        if (pos && (pos.x !== m.x || pos.y !== m.y)) {
          changed = true;
          return { ...m, x: pos.x, y: pos.y };
        }
        return m;
      });
      if (changed) {
        setModules(next);
        persist(next);
      }
    },
    [modules, persist]
  );

  return { modules, loading, addModule, removeModule, updateLayouts };
}
