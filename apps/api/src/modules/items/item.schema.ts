import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { ItemStatus } from "@wuxu/shared-types";
import { HydratedDocument } from "mongoose";

export type ItemDocument = HydratedDocument<Item>;

@Schema({ collection: "items", timestamps: true, versionKey: "version", optimisticConcurrency: true })
export class Item {
  @Prop({ required: true, index: true })
  ownerId: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name: string;

  @Prop({ required: true, index: true })
  bigCategoryId: string;

  @Prop({ type: String, default: null, trim: true, maxlength: 60 })
  bigCategoryName: string | null;

  @Prop({ type: String, default: null, index: true })
  smallCategoryId: string | null;

  @Prop({ type: String, default: null, trim: true, maxlength: 60 })
  smallCategoryName: string | null;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ required: true, trim: true, maxlength: 20 })
  unit: string;

  @Prop({ type: String, default: null, index: true })
  locationId: string | null;

  @Prop({ type: String, default: null, trim: true, maxlength: 200 })
  location: string | null;

  @Prop({ type: Date, default: null, index: true })
  expiresOn: Date | null;

  @Prop({ required: true, enum: ["IN_USE", "UNUSED", "DAMAGED", "CONSUMED"], index: true })
  status: ItemStatus;

  @Prop({ type: Boolean, default: false, index: true })
  isConsumable: boolean;

  @Prop({ type: Number, default: null, min: 1, max: 36500 })
  expectedConsumptionDays: number | null;

  @Prop({ type: Date, default: null, index: true })
  consumptionStartedAt: Date | null;

  @Prop({ type: [String], default: [] })
  imageIds: string[];

  @Prop({ type: String, default: null, trim: true, maxlength: 1000 })
  remark: string | null;

  @Prop({ type: Date, default: null, index: true })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export const ItemSchema = SchemaFactory.createForClass(Item);
ItemSchema.index({ ownerId: 1, createdAt: -1 });
ItemSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
ItemSchema.index({ ownerId: 1, isConsumable: 1, status: 1, consumptionStartedAt: 1 });
