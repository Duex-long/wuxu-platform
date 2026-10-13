import type { ItemStatus } from "@wuxu/shared-types";

export const statusLabels: Record<ItemStatus, string> = {
  IN_USE: "使用中",
  UNUSED: "未使用",
  DAMAGED: "已损坏",
  CONSUMED: "已消耗",
};

export async function runWithConcurrency<T>(
  values: T[],
  limit: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const value = values[nextIndex];
      nextIndex += 1;
      if (value !== undefined) await worker(value);
    }
  });
  await Promise.all(runners);
}
