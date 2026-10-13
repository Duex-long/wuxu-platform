import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { LocationSummary } from "@wuxu/shared-types";
import { Model, Types } from "mongoose";

import { Item } from "../items/item.schema";
import { MediaService } from "../media/media.service";
import { CreateLocationDto, UpdateLocationDto } from "./location.dto";
import { StorageLocation, type StorageLocationDocument } from "./location.schema";

@Injectable()
export class LocationsService {
  constructor(
    @InjectModel(StorageLocation.name) private readonly locationModel: Model<StorageLocation>,
    @InjectModel(Item.name) private readonly itemModel: Model<Item>,
    private readonly mediaService: MediaService,
  ) {}

  listForUser(ownerId: string): Promise<LocationSummary[]> {
    return this.list({ ownerId, deletedAt: null });
  }

  listForAdmin(): Promise<LocationSummary[]> {
    return this.list({ deletedAt: null });
  }

  async create(actorId: string, input: CreateLocationDto): Promise<LocationSummary> {
    const cleanName = input.name.trim();
    await this.assertUnique(cleanName);
    await this.mediaService.validateOwnership(actorId, [input.photoImageId]);
    const location = await this.locationModel.create({
      name: cleanName,
      normalizedName: this.normalize(cleanName),
      description: input.description?.trim() || null,
      photoImageId: input.photoImageId,
      createdBy: actorId,
    });
    await this.mediaService.syncLocationLink(actorId, location.id, null, input.photoImageId);
    return this.toSummary(location, 0);
  }

  async update(actorId: string, id: string, input: UpdateLocationDto): Promise<LocationSummary> {
    const location = await this.findActive(id);
    const previousPhotoId = location.photoImageId;
    if (input.name !== undefined) {
      const cleanName = input.name.trim();
      await this.assertUnique(cleanName, location.id);
      location.name = cleanName;
      location.normalizedName = this.normalize(cleanName);
    }
    if (input.description !== undefined) location.description = input.description?.trim() || null;
    if (input.photoImageId !== undefined && input.photoImageId !== previousPhotoId) {
      await this.mediaService.validateOwnership(actorId, [input.photoImageId]);
      location.photoImageId = input.photoImageId;
    }
    await location.save();
    if (location.name !== undefined) {
      await this.itemModel.updateMany(
        { locationId: location.id, deletedAt: null },
        { $set: { location: location.name } },
      );
    }
    if (location.photoImageId !== previousPhotoId) {
      await this.mediaService.syncLocationLink(actorId, location.id, previousPhotoId, location.photoImageId);
    }
    const itemCount = await this.itemModel.countDocuments({ locationId: location.id, deletedAt: null });
    return this.toSummary(location, itemCount);
  }

  async remove(actorId: string, id: string): Promise<void> {
    const location = await this.findActive(id);
    const itemCount = await this.itemModel.countDocuments({ locationId: location.id, deletedAt: null });
    if (itemCount > 0) throw new ConflictException("该位置仍有物品，清空或移动物品后才能删除");
    location.deletedAt = new Date();
    await location.save();
    await this.mediaService.syncLocationLink(actorId, location.id, location.photoImageId, null);
  }

  async resolveSelection(locationId?: string | null): Promise<{ locationId: string | null; location: string | null }> {
    if (locationId === undefined || locationId === null || locationId === "") {
      return { locationId: null, location: null };
    }
    const location = await this.findActive(locationId);
    return { locationId: location.id, location: location.name };
  }

  private async list(itemFilter: Record<string, unknown>): Promise<LocationSummary[]> {
    const [locations, counts] = await Promise.all([
      this.locationModel.find({ deletedAt: null }).sort({ name: 1, createdAt: 1 }).exec(),
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

  private async assertUnique(name: string, excludedId?: string): Promise<void> {
    if (name === "") throw new BadRequestException("位置名称不能为空");
    const filter: Record<string, unknown> = { normalizedName: this.normalize(name), deletedAt: null };
    if (excludedId !== undefined) filter._id = { $ne: new Types.ObjectId(excludedId) };
    if (await this.locationModel.exists(filter)) throw new ConflictException("存放位置名称已存在");
  }

  private normalize(value: string): string {
    return value.trim().toLocaleLowerCase("zh-CN");
  }

  private toSummary(location: StorageLocationDocument, itemCount: number): LocationSummary {
    const summary: LocationSummary = {
      id: location.id,
      name: location.name,
      photoImageId: location.photoImageId,
      itemCount,
      createdAt: location.createdAt.toISOString(),
      updatedAt: location.updatedAt.toISOString(),
    };
    if (location.description) summary.description = location.description;
    return summary;
  }
}
