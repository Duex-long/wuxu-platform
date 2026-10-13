export const ITEM_STATUSES = [
  "IN_USE",
  "UNUSED",
  "DAMAGED",
  "CONSUMED",
] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

export interface ItemSummary {
  id: string;
  ownerId: string;
  name: string;
  quantity: number;
  unit?: string;
  status: ItemStatus;
  bigCategoryId: string;
  smallCategoryId?: string;
  location?: string;
  expiresOn?: string;
  imageIds: string[];
  createdAt: string;
  updatedAt: string;
}

