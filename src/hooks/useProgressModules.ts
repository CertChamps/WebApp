import { useCallback, useContext, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { UserContext } from "../context/UserContext";

export type ProgressModuleType = "paper-ring" | "paper-bar" | "question-heatmap" | "text" | "drawing";

export const MODULE_TYPE_LABELS: Record<ProgressModuleType, string> = {
  "paper-ring": "Paper Completion Ring",
  "paper-bar": "Paper Completion Bar",
  "question-heatmap": "Question Heatmap",
  "text": "Text Note",
  "drawing": "Drawing Note",
};

export const MODULE_TYPE_DESCRIPTIONS: Record<ProgressModuleType, string> = {
  "paper-ring": "Shows how many questions you've ticked off across all papers for a subject.",
  "paper-bar": "A horizontal bar showing completion progress across all papers for a subject.",
  "question-heatmap": "A grid of every question across all papers. Shows drawn-on and completed status.",
  "text": "A free-form text note you can place on your dashboard.",
  "drawing": "A canvas to draw on. Edit in dashboard edit mode.",
};

export const MODULE_SIZES: Record<ProgressModuleType, { w: number; h: number }> = {
  "paper-ring": { w: 1, h: 1 },
  "paper-bar": { w: 2, h: 1 },
  "question-heatmap": { w: 4, h: 3 },
  "text": { w: 3, h: 1 },
  "drawing": { w: 3, h: 2 },
};

export const MODULE_CATEGORIES: Record<string, ProgressModuleType[]> = {
  "Subject total completion": ["paper-ring", "paper-bar"],
  "Question completion": ["question-heatmap"],
  "Visual": ["text", "drawing"],
};

const GRID_COLS = 12;

export type ProgressModuleConfig = {
  id: string;
  type: ProgressModuleType;
  subject: string;
  level: string;
  x: number;
  y: number;
  text?: string;
  drawing?: string;
  w?: number;
  h?: number;
};

export function getModuleSize(mod: ProgressModuleConfig): { w: number; h: number } {
  return {
    w: mod.w ?? MODULE_SIZES[mod.type].w,
    h: mod.h ?? MODULE_SIZES[mod.type].h,
  };
}

function generateId(): string {
  return `mod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function findEmptySpot(
  existing: ProgressModuleConfig[],
  w: number,
  h: number,
  maxRows = 100
): { x: number; y: number } {
  const occupied = new Set<string>();
  for (const mod of existing) {
    const size = getModuleSize(mod);
    for (let dy = 0; dy < size.h; dy++) {
      for (let dx = 0; dx < size.w; dx++) {
        occupied.add(`${mod.x + dx},${mod.y + dy}`);
      }
    }
  }

  const rowLimit = Math.max(1, maxRows - h + 1);
  for (let row = 0; row < rowLimit; row++) {
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
    if (m.type === "paper-heatmap") continue;
    const mod: ProgressModuleConfig = {
      id: m.id as string,
      type: m.type as ProgressModuleType,
      subject: (m.subject as string) ?? "",
      level: (m.level as string) ?? "",
      x: typeof m.x === "number" ? m.x : -1,
      y: typeof m.y === "number" ? m.y : -1,
      ...(typeof m.text === "string" ? { text: m.text } : {}),
      ...(typeof m.drawing === "string" ? { drawing: m.drawing } : {}),
      ...(typeof m.w === "number" ? { w: m.w } : {}),
      ...(typeof m.h === "number" ? { h: m.h } : {}),
    };
    modules.push(mod);
  }

  let needsMigration = false;
  for (const mod of modules) {
    if (mod.x < 0 || mod.y < 0) {
      const size = getModuleSize(mod);
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

        const hadMigration =
          raw.some((r: Record<string, unknown>) => typeof r.x !== "number" || typeof r.y !== "number") ||
          raw.some((r: Record<string, unknown>) => r.type === "paper-heatmap");

        setModules(list);
        if (hadMigration) setNeedsPersist(true);
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
    (type: ProgressModuleType, subject: string, level: string, customSize?: { w: number; h: number }, maxRows?: number) => {
      const size = customSize ?? MODULE_SIZES[type];
      const spot = findEmptySpot(modules, size.w, size.h, maxRows);
      const mod: ProgressModuleConfig = {
        id: generateId(),
        type,
        subject,
        level,
        x: spot.x,
        y: spot.y,
        ...(customSize ? { w: customSize.w, h: customSize.h } : {}),
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
    (layouts: { i: string; x: number; y: number; w: number; h: number }[]) => {
      const map = new Map(layouts.map((l) => [l.i, l]));
      let changed = false;
      const next = modules.map((m) => {
        const l = map.get(m.id);
        if (!l) return m;
        const curSize = getModuleSize(m);
        const posChanged = l.x !== m.x || l.y !== m.y;
        const sizeChanged = l.w !== curSize.w || l.h !== curSize.h;
        if (posChanged || sizeChanged) {
          changed = true;
          return {
            ...m,
            x: l.x,
            y: l.y,
            ...(sizeChanged ? { w: l.w, h: l.h } : {}),
          };
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

  const updateModuleText = useCallback(
    (id: string, text: string) => {
      const next = modules.map((m) => (m.id === id ? { ...m, text } : m));
      setModules(next);
      persist(next);
    },
    [modules, persist]
  );

  const updateModuleDrawing = useCallback(
    (id: string, drawing: string) => {
      const next = modules.map((m) => (m.id === id ? { ...m, drawing } : m));
      setModules(next);
      persist(next);
    },
    [modules, persist]
  );

  return { modules, loading, addModule, removeModule, updateLayouts, updateModuleText, updateModuleDrawing };
}
