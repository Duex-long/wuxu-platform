import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { LocationScope, LocationSummary } from "@wuxu/shared-types";
import { FilterQuery, Model, Types } from "mongoose";

import { Item } from "../items/item.schema";
import { MediaService } from "../media/media.service";
import { CreateLocationDto, ListLocationsQueryDto, UpdateLocationDto } from "./location.dto";
import { StorageLocation, type StorageLocationDocument } from "./location.schema";

@Injectable()
export class LocationsService {
  constructor(
    @InjectModel(StorageLocation.name) private readonly locationModel: Model<StorageLocation>,
    @InjectModel(Item.name) private readonly itemModel: Model<Item>,
    private readonly mediaService: MediaService,
  ) {}

  listForUser(ownerId: string, query: ListLocationsQueryDto): Promise<LocationSummary[]> {
    return this.list(
      {
        deletedAt: null,
        $or: [
          { scope: "GLOBAL" },
          { scope: { $exists: false } },
          { scope: "PERSONAL", ownerId },
        ],
      },
      { ownerId, deletedAt: null },
      query,
    );
  }

  listForAdmin(query: ListLocationsQueryDto): Promise<LocationSummary[]> {
    return this.list({ deletedAt: null }, { deletedAt: null }, query);
  }

  createGlobal(actorId: string, input: CreateLocationDto): Promise<LocationSummary> {
    return this.create(actorId, null, "GLOBAL", input);
  }

  createPersonal(ownerId: string, input: CreateLocationDto): Promise<LocationSummary> {
    return this.create(ownerId, ownerId, "PERSONAL", input);
  }

  async update(actorId: string, id: string, input: UpdateLocationDto): Promise<LocationSummary> {
    const location = await this.findActive(id);
    const previousPhotoId = location.photoImageId;
    if (input.name !== undefined) {
      const cleanName = input.name.trim();
      await this.assertUnique(cleanName, this.getScope(location), location.ownerId ?? null, location.id);
      location.name = cleanName;
      location.normalizedName = this.normalize(cleanName);
    }
    if (input.description !== undefined) location.description = input.description?.trim() || null;
    if (input.photoImageId !== undefined && input.photoImageId !== previousPhotoId) {
      await this.mediaService.validateOwnership(actorId, [input.photoImageId]);
      location.photoImageId = input.photoImageId;
    }
    await location.save();
    await this.itemModel.updateMany(
      { locationId: location.id, deletedAt: null },
      { $set: { location: location.name } },
    );
    if (location.photoImageId !== previousPhotoId) {
      await this.mediaService.syncLocationLink(
        actorId,
        location.id,
        location.ownerId ?? null,
        previousPhotoId,
        location.photoImageId,
      );
    }
    const itemCount = await this.itemModel.countDocuments({ locationId: location.id, deletedAt: null });
    return this.toSummary(location, itemCount);
  }

  removeAsAdmin(actorId: string, id: string): Promise<void> {
    return this.remove(actorId, id);
  }

  async removePersonal(ownerId: string, id: string): Promise<void> {
    const location = await this.findActive(id);
    if (this.getScope(location) !== "PERSONAL" || (location.ownerId ?? null) !== ownerId) {
      throw new NotFoundException("存放位置不存在");
    }
    await this.remove(ownerId, id, location);
  }

  async resolveSelection(
    locationId: string | null | undefined,
    ownerId: string,
  ): Promise<{ locationId: string | null; location: string | null }> {
    if (locationId === undefined || locationId === null || locationId === "") {
      return { locationId: null, location: null };
    }
    if (!Types.ObjectId.isValid(locationId)) throw new NotFoundException("存放位置不存在");
    const location = await this.locationModel.findOne({
      _id: new Types.ObjectId(locationId),
      deletedAt: null,
      $or: [
        { scope: "GLOBAL" },
        { scope: { $exists: false } },
        { scope: "PERSONAL", ownerId },
      ],
    }).exec();
    if (!location) throw new NotFoundException("存放位置不存在");
    return { locationId: location.id, location: location.name };
  }

  private async create(
    actorId: string,
    ownerId: string | null,
    scope: LocationScope,
    input: CreateLocationDto,
  ): Promise<LocationSummary> {
    const cleanName = input.name.trim();
    await this.assertUnique(cleanName, scope, ownerId);
    await this.mediaService.validateOwnership(actorId, [input.photoImageId]);
    const location = await this.locationModel.create({
      name: cleanName,
      normalizedName: this.normalize(cleanName),
      description: input.description?.trim() || null,
      photoImageId: input.photoImageId,
      createdBy: actorId,
      scope,
      ownerId,
    });
    await this.mediaService.syncLocationLink(actorId, location.id, ownerId, null, input.photoImageId);
    return this.toSummary(location, 0);
  }

  private async remove(
    actorId: string,
    id: string,
    existingLocation?: StorageLocationDocument,
  ): Promise<void> {
    const location = existingLocation ?? await this.findActive(id);
    const itemCount = await this.itemModel.countDocuments({ locationId: location.id, deletedAt: null });
    if (itemCount > 0) throw new ConflictException("该位置仍有物品，清空或移动物品后才能删除");
    location.deletedAt = new Date();
    await location.save();
    await this.mediaService.syncLocationLink(
      actorId,
      location.id,
      location.ownerId ?? null,
      location.photoImageId,
      null,
    );
  }

  private async list(
    locationFilter: FilterQuery<StorageLocation>,
    itemFilter: Record<string, unknown>,
    query: ListLocationsQueryDto,
  ): Promise<LocationSummary[]> {
    const keyword = query.keyword?.trim();
    const resolvedLocationFilter: FilterQuery<StorageLocation> = { ...locationFilter };
    if (keyword) {
      const pattern = new RegExp(this.escapeRegExp(keyword), "i");
      resolvedLocationFilter.$and = [{ $or: [{ name: pattern }, { description: pattern }] }];
    }
    const [locations, counts] = await Promise.all([
      this.locationModel.find(resolvedLocationFilter).sort({ name: 1, createdAt: 1 }).exec(),
      this.itemModel.aggregate<{ _id: string; count: number }>([
        { $match: itemFilter },
        { $match: { locationId: { $ne: null } } },
        { $group: { _id: "$locationId", count: { $sum: 1 } } },
      ]).exec(),
    ]);
    const countByLocation = new Map(counts.map((row) => [row._id, row.count]));
    return locations.map((location) => this.toSummary(location, countByLocation.get(location.id) ?? 0));
  }

  private async findActive(id: string): Promise<StorageLocationDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("存放位置不存在");
    const location = await this.locationModel.findOne({ _id: new Types.ObjectId(id), deletedAt: null }).exec();
    if (!location) throw new NotFoundException("存放位置不存在");
    return location;
  }

  private async assertUnique(
    name: string,
    scope: LocationScope,
    ownerId: string | null,
    excludedId?: string,
  ): Promise<void> {
    if (name === "") throw new BadRequestException("位置名称不能为空");
    const normalizedName = this.normalize(name);
    const filter: FilterQuery<StorageLocation> = { normalizedName, deletedAt: null };
    if (scope === "PERSONAL") {
      filter.$or = [
        { scope: "GLOBAL" },
        { scope: { $exists: false } },
        { scope: "PERSONAL", ownerId },
      ];
    }
    if (excludedId !== undefined) filter._id = { $ne: new Types.ObjectId(excludedId) };
    if (await this.locationModel.exists(filter)) throw new ConflictException("可见范围内已存在同名存放位置");
  }

  private normalize(value: string): string {
    return value.trim().toLocaleLowerCase("zh-CN");
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private getScope(location: StorageLocationDocument): LocationScope {
    return location.scope === "PERSONAL" ? "PERSONAL" : "GLOBAL";
  }

  private toSummary(location: StorageLocationDocument, itemCount: number): LocationSummary {
    const scope = this.getScope(location);
    const summary: LocationSummary = {
      id: location.id,
      name: location.name,
      photoImageId: location.photoImageId,
      scope,
      itemCount,
      createdAt: location.createdAt.toISOString(),
      updatedAt: location.updatedAt.toISOString(),
    };
    if (location.description) summary.description = location.description;
    if (scope === "PERSONAL" && location.ownerId) summary.ownerId = location.ownerId;
    return summary;
  }
}
