export const ITEM_STATUSES = [
  "IN_USE",
  "UNUSED",
  "DAMAGED",
  "CONSUMED",
] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const USER_ROLES = ["USER", "ADMIN"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface ConsumptionProgress {
  elapsedDays: number;
  expectedDays: number;
  percent: number;
  estimatedDailyConsumption: number;
  expectedFinishedOn: string;
  dueForCheck: boolean;
}

export interface ItemSummary {
  id: string;
  ownerId: string;
  name: string;
  quantity: number;
  unit?: string;
  status: ItemStatus;
  isConsumable: boolean;
  expectedConsumptionDays?: number;
  consumptionStartedAt?: string;
  consumptionProgress?: ConsumptionProgress;
  bigCategoryId: string;
  bigCategoryName: string;
  smallCategoryId?: string;
  smallCategoryName?: string;
  locationId?: string;
  location?: string;
  expiresOn?: string;
  imageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CategoryNode {
  id: string;
  name: string;
  children: Array<{
    id: string;
    name: string;
  }>;
}

export interface ImageAssetSummary {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  checksumSha256: string;
  createdAt: string;
}

export interface LocationSummary {
  id: string;
  name: string;
  description?: string;
  photoImageId: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryStatistic {
  categoryId: string;
  categoryName: string;
  count: number;
}

export interface InventoryStatistics {
  totalRecords: number;
  totalQuantity: number;
  statusCounts: Record<ItemStatus, number>;
  categoryCounts: CategoryStatistic[];
  expiringSoon: number;
  expired: number;
  consumablesDueForCheck: number;
  userCount?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  service: "wuxu-api";
  version: string;
  timestamp: string;
  dependencies?: Record<string, "up" | "down">;
}

