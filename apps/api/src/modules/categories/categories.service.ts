import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { CategoryNode } from "@wuxu/shared-types";
import { Model, Types } from "mongoose";

import { Category, type CategoryDocument, type CategoryLevel } from "./category.schema";

export interface ResolvedCategorySelection {
  bigCategoryId: string;
  bigCategoryName: string;
  smallCategoryId: string | null;
  smallCategoryName: string | null;
}

@Injectable()
export class CategoriesService {
  constructor(@InjectModel(Category.name) private readonly categoryModel: Model<Category>) {}

  async tree(): Promise<CategoryNode[]> {
    await this.ensureDefault();
    const categories = await this.categoryModel
      .find({ managedByAdmin: true, deletedAt: null })
      .sort({ level: 1, sortOrder: 1, createdAt: 1 })
      .exec();
    const smallByParent = new Map<string, Array<{ id: string; name: string }>>();
    for (const category of categories) {
      if (category.level !== "SMALL" || category.parentId === null) continue;
      const children = smallByParent.get(category.parentId) ?? [];
      children.push({ id: category.id, name: category.name });
      smallByParent.set(category.parentId, children);
    }
    return categories
      .filter((category) => category.level === "BIG")
      .map((category) => ({
        id: category.id,
        name: category.name,
        children: smallByParent.get(category.id) ?? [],
      }));
  }

  async create(ownerId: string, name: string, parentId?: string | null): Promise<CategoryNode | { id: string; name: string }> {
    const cleanName = name.trim();
    const parent = parentId ? await this.findManaged(parentId, "BIG") : null;
    const level: CategoryLevel = parent ? "SMALL" : "BIG";
    await this.assertUnique(level, parent?.id ?? null, cleanName);
    const category = await this.categoryModel.create({
      ownerId,
      managedByAdmin: true,
      level,
      parentId: parent?.id ?? null,
      name: cleanName,
      normalizedName: this.normalize(cleanName),
      sortOrder: Date.now(),
    });
    return level === "BIG"
      ? { id: category.id, name: category.name, children: [] }
      : { id: category.id, name: category.name };
  }

  async rename(id: string, name: string): Promise<{ id: string; name: string }> {
    const category = await this.findManaged(id);
    const cleanName = name.trim();
    await this.assertUnique(category.level, category.parentId, cleanName, category.id);
    category.name = cleanName;
    category.normalizedName = this.normalize(cleanName);
    await category.save();
    return { id: category.id, name: category.name };
  }

  async remove(id: string): Promise<void> {
    const category = await this.findManaged(id);
    if (category.level === "BIG") {
      const childCount = await this.categoryModel.countDocuments({
        managedByAdmin: true,
        parentId: category.id,
        deletedAt: null,
      });
      if (childCount > 0) throw new ConflictException("请先删除该大类目下的小类目");
    }
    category.deletedAt = new Date();
    await category.save();
  }

  async resolveSelection(bigCategoryId: string, smallCategoryId?: string | null): Promise<ResolvedCategorySelection> {
    const big = await this.findManaged(bigCategoryId, "BIG");
    if (smallCategoryId === undefined || smallCategoryId === null || smallCategoryId === "") {
      return {
        bigCategoryId: big.id,
        bigCategoryName: big.name,
        smallCategoryId: null,
        smallCategoryName: null,
      };
    }
    const small = await this.findManaged(smallCategoryId, "SMALL");
    if (small.parentId !== big.id) throw new BadRequestException("小类目不属于所选大类目");
    return {
      bigCategoryId: big.id,
      bigCategoryName: big.name,
      smallCategoryId: small.id,
      smallCategoryName: small.name,
    };
  }

  private async ensureDefault(): Promise<void> {
    const count = await this.categoryModel.countDocuments({ managedByAdmin: true, level: "BIG", deletedAt: null });
    if (count > 0) return;
    const name = "未分类";
    const existing = await this.categoryModel.findOne({
      ownerId: "system",
      managedByAdmin: true,
      level: "BIG",
      parentId: null,
      normalizedName: this.normalize(name),
    });
    if (existing) {
      existing.deletedAt = null;
      await existing.save();
      return;
    }
    await this.categoryModel.create({
      ownerId: "system",
      managedByAdmin: true,
      level: "BIG",
      parentId: null,
      name,
      normalizedName: this.normalize(name),
      sortOrder: 0,
    });
  }

  private async findManaged(id: string, level?: CategoryLevel): Promise<CategoryDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("类目不存在");
    const filter: Record<string, unknown> = {
      _id: new Types.ObjectId(id),
      managedByAdmin: true,
      deletedAt: null,
    };
    if (level !== undefined) filter.level = level;
    const category = await this.categoryModel.findOne(filter).exec();
    if (!category) throw new NotFoundException("类目不存在");
    return category;
  }

  private async assertUnique(
    level: CategoryLevel,
    parentId: string | null,
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      managedByAdmin: true,
      level,
      parentId,
      normalizedName: this.normalize(name),
      deletedAt: null,
    };
    if (excludedId !== undefined) filter._id = { $ne: new Types.ObjectId(excludedId) };
    if (await this.categoryModel.exists(filter)) throw new ConflictException("同级类目名称已存在");
  }

  private normalize(value: string): string {
    return value.trim().toLocaleLowerCase("zh-CN");
  }
}
