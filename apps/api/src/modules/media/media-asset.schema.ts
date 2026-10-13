import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type MediaAssetDocument = HydratedDocument<MediaAsset>;

@Schema({ collection: "media_assets", timestamps: true })
export class MediaAsset {
  @Prop({ required: true, index: true })
  ownerId: string;

  @Prop({ required: true, unique: true })
  objectKey: string;

  @Prop({ required: true, maxlength: 255 })
  originalName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true, min: 1 })
  size: number;

  @Prop({ required: true, index: true })
  checksumSha256: string;

  @Prop({ type: String, default: null, index: true })
  linkedItemId: string | null;

  @Prop({ type: String, default: null, index: true })
  linkedLocationId: string | null;

  @Prop({ type: Date, default: null, index: true })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const MediaAssetSchema = SchemaFactory.createForClass(MediaAsset);
MediaAssetSchema.index({ ownerId: 1, linkedItemId: 1, createdAt: 1 });
MediaAssetSchema.index({ ownerId: 1, linkedLocationId: 1, createdAt: 1 });
