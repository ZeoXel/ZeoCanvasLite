export function removeItemWithTombstone<T extends { id: string }>(
  items: T[],
  deletedItems: Record<string, number>,
  itemId: string,
  now: number = Date.now()
): {
  items: T[];
  deletedItems: Record<string, number>;
} {
  const nextItems = items.filter((item) => item.id !== itemId);
  const existingTs = deletedItems[itemId] || 0;

  return {
    items: nextItems,
    deletedItems: {
      ...deletedItems,
      [itemId]: Math.max(existingTs, now),
    },
  };
}
