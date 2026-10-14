import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ITEM_STATUSES, type InventoryStatistics, type ItemStatus, type ItemSummary, type PaginatedResponse } from "@wuxu/shared-types";
import { FilterQuery, Model, Types } from "mongoose";

import { CategoriesService } from "../categories/categories.service";
import { LocationsService } from "../locations/locations.service";
import { MediaService } from "../media/media.service";
import { CreateItemDto, ListItemsQueryDto, UpdateItemDto } from "./item.dto";
import { Item, type ItemDocument } from "./item.schema";
import { ItemStatusHistory } from "./item-status-history.schema";

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export interface ItemDetail extends ItemSummary {
  remark?: string;
  version: number;
}

@Injectable()
export class ItemsService {
  constructor(
    @InjectModel(Item.name) private readonly itemModel: Model<Item>,
    @InjectModel(ItemStatusHistory.name)
    private readonly historyModel: Model<ItemStatusHistory>,
    private readonly categoriesService: CategoriesService,
    private readonly locationsService: LocationsService,
    private readonly mediaService: MediaService,
  ) {}

  async create(ownerId: string, input: CreateItemDto): Promise<ItemDetail> {
    const category = await this.categoriesService.resolveSelection(input.bigCategoryId, input.smallCategoryId);
    const location = await this.locationsService.resolveSelection(input.locationId, ownerId);
    const imageIds = input.imageIds ?? [];
    const isConsumable = input.isConsumable ?? false;
    const expectedConsumptionDays = this.resolveExpectedConsumptionDays(
      isConsumable,
      input.expectedConsumptionDays ?? null,
    );
    await this.mediaService.validateOwnership(ownerId, imageIds);
    const item = await this.itemModel.create({
      ownerId,
      name: input.name.trim(),
      ...category,
      ...location,
      quantity: input.quantity,
      unit: input.unit.trim(),
      expiresOn: input.expiresOn ? new Date(input.expiresOn) : null,
      status: input.status,
      isConsumable,
      expectedConsumptionDays,
      consumptionStartedAt: isConsumable && input.status === "IN_USE" ? new Date() : null,
      imageIds,
      remark: input.remark?.trim() || null,
    });
    await this.mediaService.syncItemLinks(ownerId, item.id, [], imageIds);
    return this.toDetail(item);
  }

  listForOwner(ownerId: string, query: ListItemsQueryDto): Promise<PaginatedResponse<ItemSummary>> {
    return this.list({ ownerId }, query);
  }

  listForAdmin(query: ListItemsQueryDto): Promise<PaginatedResponse<ItemSummary>> {
    const baseFilter: FilterQuery<Item> = {};
    if (query.ownerId) baseFilter.ownerId = query.ownerId;
    return this.list(baseFilter, query);
  }

  async findForOwner(ownerId: string, id: string): Promise<ItemDetail> {
    const item = await this.findDocument({ _id: this.toObjectId(id), ownerId, deletedAt: null });
    return this.toDetail(item);
  }

  async findForAdmin(id: string): Promise<ItemDetail> {
    const item = await this.findDocument({ _id: this.toObjectId(id), deletedAt: null });
    return this.toDetail(item);
  }

  async update(ownerId: string, id: string, input: UpdateItemDto): Promise<ItemDetail> {
    const item = await this.findDocument({ _id: this.toObjectId(id), ownerId, deletedAt: null });

    if (input.bigCategoryId !== undefined || input.smallCategoryId !== undefined) {
      const bigCategoryId = input.bigCategoryId ?? item.bigCategoryId;
      const smallCategoryId = input.bigCategoryId !== undefined && input.smallCategoryId === undefined
        ? null
        : input.smallCategoryId ?? item.smallCategoryId;
      const category = await this.categoriesService.resolveSelection(bigCategoryId, smallCategoryId);
      item.bigCategoryId = category.bigCategoryId;
      item.bigCategoryName = category.bigCategoryName;
      item.smallCategoryId = category.smallCategoryId;
      item.smallCategoryName = category.smallCategoryName;
    }

    if (input.locationId !== undefined) {
      const location = await this.locationsService.resolveSelection(input.locationId, ownerId);
      item.locationId = location.locationId;
      item.location = location.location;
    }

    const previousImageIds = [...item.imageIds];
    if (input.imageIds !== undefined) await this.mediaService.validateOwnership(
      ownerId,
      input.imageIds.filter((imageId) => !previousImageIds.includes(imageId)),
    );

    if (input.name !== undefined) item.name = input.name.trim();
    if (input.quantity !== undefined) item.quantity = input.quantity;
    if (input.unit !== undefined) item.unit = input.unit.trim();
    if (input.expiresOn !== undefined) item.expiresOn = input.expiresOn ? new Date(input.expiresOn) : null;
    if (input.imageIds !== undefined) item.imageIds = input.imageIds;
    if (input.remark !== undefined) item.remark = input.remark?.trim() || null;

    const nextStatus = input.status ?? item.status;
    const nextIsConsumable = input.isConsumable ?? Boolean(item.isConsumable);
    const wasActivelyConsumed = Boolean(item.isConsumable)
      && item.status === "IN_USE"
      && item.consumptionStartedAt instanceof Date;
    const expectedConsumptionDays = this.resolveExpectedConsumptionDays(
      nextIsConsumable,
      input.expectedConsumptionDays ?? item.expectedConsumptionDays ?? null,
    );
    if (nextStatus !== item.status) {
      await this.recordStatusChange(item, nextStatus, ownerId, null);
    }
    item.status = nextStatus;
    item.isConsumable = nextIsConsumable;
    item.expectedConsumptionDays = expectedConsumptionDays;
    if (nextIsConsumable && nextStatus === "IN_USE") {
      if (!wasActivelyConsumed) item.consumptionStartedAt = new Date();
    } else {
      item.consumptionStartedAt = null;
    }

    await item.save();
    if (input.imageIds !== undefined) {
      await this.mediaService.syncItemLinks(ownerId, item.id, previousImageIds, input.imageIds);
    }
    return this.toDetail(item);
  }

  statisticsForOwner(ownerId: string): Promise<InventoryStatistics> {
    return this.statistics({ ownerId });
  }

  statisticsForAdmin(): Promise<InventoryStatistics> {
    return this.statistics({});
  }

  async updateStatus(
    ownerId: string,
    id: string,
    status: ItemStatus,
    reason: string | null,
    requestedExpectedConsumptionDays: number | null,
  ): Promise<ItemDetail> {
    const item = await this.findDocument({ _id: this.toObjectId(id), ownerId, deletedAt: null });
    const expectedConsumptionDays = this.resolveExpectedConsumptionDays(
      Boolean(item.isConsumable),
      requestedExpectedConsumptionDays ?? item.expectedConsumptionDays ?? null,
    );
    const wasActivelyConsumed = Boolean(item.isConsumable)
      && item.status === "IN_USE"
      && item.consumptionStartedAt instanceof Date;
    let shouldSave = false;
    if (item.status !== status) {
      await this.recordStatusChange(item, status, ownerId, reason);
      item.status = status;
      shouldSave = true;
    }
    if (item.isConsumable) {
      if (item.expectedConsumptionDays !== expectedConsumptionDays) shouldSave = true;
      item.expectedConsumptionDays = expectedConsumptionDays;
      if (status === "IN_USE") {
        if (!wasActivelyConsumed) {
          item.consumptionStartedAt = new Date();
          shouldSave = true;
        }
      } else if (item.consumptionStartedAt != null) {
        item.consumptionStartedAt = null;
        shouldSave = true;
      }
    } else if (item.expectedConsumptionDays != null || item.consumptionStartedAt != null) {
      item.expectedConsumptionDays = null;
      item.consumptionStartedAt = null;
      shouldSave = true;
    }
    if (shouldSave) await item.save();
    return this.toDetail(item);
  }

  async softDelete(ownerId: string, id: string): Promise<void> {
    const item = await this.findDocument({ _id: this.toObjectId(id), ownerId, deletedAt: null });
    item.deletedAt = new Date();
    await item.save();
  }

  private async list(
    baseFilter: FilterQuery<Item>,
    query: ListItemsQueryDto,
  ): Promise<PaginatedResponse<ItemSummary>> {
    const filter: FilterQuery<Item> = { ...baseFilter, deletedAt: null };
    if (query.keyword) filter.name = { $regex: this.escapeRegex(query.keyword), $options: "i" };
    if (query.status) filter.status = query.status;
    if (query.bigCategoryId) filter.bigCategoryId = query.bigCategoryId;
    if (query.locationId) filter.locationId = query.locationId;
    if (query.consumable === true) filter.isConsumable = true;
    if (query.consumable === false) {
      filter.$or = [{ isConsumable: false }, { isConsumable: { $exists: false } }];
    }
    if (query.dueForCheck === true) {
      filter.isConsumable = true;
      filter.status = "IN_USE";
      filter.expectedConsumptionDays = { $gte: 1 };
      filter.consumptionStartedAt = { $ne: null };
      filter.$expr = {
        $lte: [
          { $add: ["$consumptionStartedAt", { $multiply: ["$expectedConsumptionDays", DAY_IN_MILLISECONDS] }] },
          new Date(),
        ],
      };
    }

    const [documents, total] = await Promise.all([
      this.itemModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.itemModel.countDocuments(filter).exec(),
    ]);

    return {
      items: documents.map((item) => this.toSummary(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  private async findDocument(filter: FilterQuery<Item>): Promise<ItemDocument> {
    const item = await this.itemModel.findOne(filter).exec();
    if (!item) throw new NotFoundException("物品不存在");
    return item;
  }

  private async recordStatusChange(
    item: ItemDocument,
    toStatus: ItemStatus,
    actorId: string,
    reason: string | null,
  ): Promise<void> {
    await this.historyModel.create({
      itemId: item.id,
      ownerId: item.ownerId,
      fromStatus: item.status,
      toStatus,
      actorId,
      reason,
    });
  }

  private toSummary(item: ItemDocument): ItemSummary {
    const summary: ItemSummary = {
      id: item.id,
      ownerId: item.ownerId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      status: item.status,
      isConsumable: Boolean(item.isConsumable),
      bigCategoryId: item.bigCategoryId,
      bigCategoryName: item.bigCategoryName || item.bigCategoryId,
      imageIds: item.imageIds,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
    if (item.smallCategoryId) summary.smallCategoryId = item.smallCategoryId;
    if (item.smallCategoryName) summary.smallCategoryName = item.smallCategoryName;
    if (item.locationId) summary.locationId = item.locationId;
    if (item.location) summary.location = item.location;
    if (item.expiresOn) summary.expiresOn = item.expiresOn.toISOString().slice(0, 10);
    if (item.isConsumable && typeof item.expectedConsumptionDays === "number") {
      summary.expectedConsumptionDays = item.expectedConsumptionDays;
    }
    if (item.isConsumable && item.consumptionStartedAt instanceof Date) {
      summary.consumptionStartedAt = item.consumptionStartedAt.toISOString();
    }
    if (
      item.isConsumable
      && item.status === "IN_USE"
      && typeof item.expectedConsumptionDays === "number"
      && item.consumptionStartedAt instanceof Date
    ) {
      const elapsedDays = Math.max(
        0,
        Math.floor((Date.now() - item.consumptionStartedAt.getTime()) / DAY_IN_MILLISECONDS),
      );
      const expectedFinishedAt = new Date(
        item.consumptionStartedAt.getTime() + item.expectedConsumptionDays * DAY_IN_MILLISECONDS,
      );
      summary.consumptionProgress = {
        elapsedDays,
        expectedDays: item.expectedConsumptionDays,
        percent: Math.min(100, Math.round((elapsedDays / item.expectedConsumptionDays) * 100)),
        estimatedDailyConsumption: item.quantity / item.expectedConsumptionDays,
        expectedFinishedOn: expectedFinishedAt.toISOString().slice(0, 10),
        dueForCheck: elapsedDays >= item.expectedConsumptionDays,
      };
    }
    return summary;
  }

  private toDetail(item: ItemDocument): ItemDetail {
    const detail: ItemDetail = { ...this.toSummary(item), version: item.version };
    if (item.remark) detail.remark = item.remark;
    return detail;
  }

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("物品不存在");
    return new Types.ObjectId(id);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private async statistics(baseFilter: FilterQuery<Item>): Promise<InventoryStatistics> {
    const now = new Date();
    const inThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [result, ownerIds] = await Promise.all([
      this.itemModel.aggregate<{
        totals: Array<{ totalRecords: number; totalQuantity: number }>;
        statuses: Array<{ _id: ItemStatus; count: number }>;
        categories: Array<{ _id: { categoryId: string; categoryName: string }; count: number }>;
        expiration: Array<{ expiringSoon: number; expired: number; consumablesDueForCheck: number }>;
      }>([
        { $match: { ...baseFilter, deletedAt: null } },
        {
          $facet: {
            totals: [{ $group: { _id: null, totalRecords: { $sum: 1 }, totalQuantity: { $sum: "$quantity" } } }],
            statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
            categories: [
              {
                $group: {
                  _id: {
                    categoryId: "$bigCategoryId",
                    categoryName: { $ifNull: ["$bigCategoryName", "$bigCategoryId"] },
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1 } },
              { $limit: 12 },
            ],
            expiration: [
              {
                $group: {
                  _id: null,
                  expiringSoon: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $ne: ["$status", "CONSUMED"] },
                            { $ne: ["$expiresOn", null] },
                            { $gte: ["$expiresOn", now] },
                            { $lte: ["$expiresOn", inThirtyDays] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  expired: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $ne: ["$status", "CONSUMED"] },
                            { $ne: ["$expiresOn", null] },
                            { $lt: ["$expiresOn", now] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  consumablesDueForCheck: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: ["$isConsumable", true] },
                            { $eq: ["$status", "IN_USE"] },
                            { $gte: ["$expectedConsumptionDays", 1] },
                            { $ne: ["$consumptionStartedAt", null] },
                            {
                              $lte: [
                                {
                                  $add: [
                                    "$consumptionStartedAt",
                                    { $multiply: ["$expectedConsumptionDays", DAY_IN_MILLISECONDS] },
                                  ],
                                },
                                now,
                              ],
                            },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      ]).exec(),
      this.itemModel.distinct("ownerId", { ...baseFilter, deletedAt: null }),
    ]);
    const summary = result[0];
    const statusCounts = Object.fromEntries(ITEM_STATUSES.map((status) => [status, 0])) as Record<ItemStatus, number>;
    for (const row of summary?.statuses ?? []) statusCounts[row._id] = row.count;
    const totals = summary?.totals[0];
    const expiration = summary?.expiration[0];
    return {
      totalRecords: totals?.totalRecords ?? 0,
      totalQuantity: totals?.totalQuantity ?? 0,
      statusCounts,
      categoryCounts: (summary?.categories ?? []).map((row) => ({
        categoryId: row._id.categoryId,
        categoryName: row._id.categoryName,
        count: row.count,
      })),
      expiringSoon: expiration?.expiringSoon ?? 0,
      expired: expiration?.expired ?? 0,
      consumablesDueForCheck: expiration?.consumablesDueForCheck ?? 0,
      userCount: ownerIds.length,
    };
  }

  private resolveExpectedConsumptionDays(
    isConsumable: boolean,
    expectedConsumptionDays: number | null,
  ): number | null {
    if (!isConsumable) return null;
    if (
      expectedConsumptionDays === null
      || !Number.isInteger(expectedConsumptionDays)
      || expectedConsumptionDays < 1
      || expectedConsumptionDays > 36500
    ) {
      throw new BadRequestException("消耗品必须填写 1 到 36500 天的预计使用天数");
    }
    return expectedConsumptionDays;
  }
}
