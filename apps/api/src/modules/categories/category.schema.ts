import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type CategoryDocument = HydratedDocument<Category>;
export type CategoryLevel = "BIG" | "SMALL";

@Schema({ collection: "categories", timestamps: true })
export class Category {
  @Prop({ required: true, index: true })
  ownerId: string;

  @Prop({ required: true, default: false, index: true })
  managedByAdmin: boolean;

  @Prop({ required: true, enum: ["BIG", "SMALL"], index: true })
  level: CategoryLevel;

  @Prop({ type: String, default: null, index: true })
  parentId: string | null;

  @Prop({ required: true, trim: true, maxlength: 60 })
  name: string;

  @Prop({ required: true, maxlength: 60 })
  normalizedName: string;

  @Prop({ required: true, default: 0 })
  sortOrder: number;

  @Prop({ type: Date, default: null, index: true })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
CategorySchema.index({ managedByAdmin: 1, level: 1, parentId: 1, normalizedName: 1 });
CategorySchema.index({ managedByAdmin: 1, level: 1, sortOrder: 1, createdAt: 1 });
