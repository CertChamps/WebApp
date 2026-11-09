import { useEffect, useMemo, useState } from "react";
import { listCatalogueLevels, listCatalogueTopics } from "../lib/firestoreImageCatalogue";
import { getStorageFolderName } from "../data/practiceHubSubjects";

export type DiscoverTopicOption = {
  id: string;
  label: string;
  levels: string[];
};

function normaliseLevel(value: string): string {
  return value.trim().toLowerCase();
}

export function discoverTopicUrl(subjectId: string, topicId: string, level: string): string {
  const params = new URLSearchParams({
    subject: subjectId,
    level,
    cycle: "leaving",
    browse: "topic",
    topic: topicId,
  });
  return `/practice?${params.toString()}`;
}

export function useDiscoverTopics(subjectId: string | null, selectedLevels: string[]) {
  const [topics, setTopics] = useState<DiscoverTopicOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const levelKey = useMemo(
    () => selectedLevels.map(normaliseLevel).sort().join("|"),
    [selectedLevels]
  );

  useEffect(() => {
    let cancelled = false;
    if (!subjectId) {
      setTopics([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const storageSubject = getStorageFolderName(subjectId);

    void (async () => {
      try {
        const availableLevels = await listCatalogueLevels(storageSubject);
        const requestedLevels = new Set(levelKey.split("|").filter(Boolean));
        const levels = requestedLevels.size > 0
          ? availableLevels.filter((level) => requestedLevels.has(normaliseLevel(level)))
          : availableLevels;
        const topicLists = await Promise.all(
          levels.map(async (level) => ({
            level,
            topics: await listCatalogueTopics(storageSubject, level),
          }))
        );
        if (cancelled) return;

        const byId = new Map<string, DiscoverTopicOption>();
        for (const group of topicLists) {
          for (const topic of group.topics) {
            const existing = byId.get(topic.name);
            if (existing) {
              if (!existing.levels.includes(group.level)) existing.levels.push(group.level);
            } else {
              byId.set(topic.name, {
                id: topic.name,
                label: topic.displayName,
                levels: [group.level],
              });
            }
          }
        }
        setTopics(
          [...byId.values()].sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
          )
        );
      } catch (reason) {
        if (cancelled) return;
        setTopics([]);
        setError(reason instanceof Error ? reason.message : "Could not load topics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [subjectId, levelKey]);

  return { topics, loading, error };
}
