import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type StorageLocationDocument = HydratedDocument<StorageLocation>;

@Schema({ collection: "storage_locations", timestamps: true })
export class StorageLocation {
  @Prop({ required: true, trim: true, maxlength: 80 })
  name: string;

  @Prop({ required: true, maxlength: 80, index: true })
  normalizedName: string;

  @Prop({ type: String, default: null, trim: true, maxlength: 300 })
  description: string | null;

  @Prop({ required: true })
  photoImageId: string;

  @Prop({ required: true })
  createdBy: string;

  @Prop({ enum: ["GLOBAL", "PERSONAL"], default: "GLOBAL", index: true })
  scope: "GLOBAL" | "PERSONAL";

  @Prop({ type: String, default: null, index: true })
  ownerId: string | null;

  @Prop({ type: Date, default: null, index: true })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const StorageLocationSchema = SchemaFactory.createForClass(StorageLocation);
StorageLocationSchema.index({ normalizedName: 1, deletedAt: 1 });
StorageLocationSchema.index({ scope: 1, ownerId: 1, deletedAt: 1, normalizedName: 1 });
