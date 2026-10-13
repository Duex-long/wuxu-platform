import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { ItemStatus } from "@wuxu/shared-types";
import { HydratedDocument } from "mongoose";

export type ItemStatusHistoryDocument = HydratedDocument<ItemStatusHistory>;

@Schema({ collection: "item_status_history", timestamps: { createdAt: true, updatedAt: false } })
export class ItemStatusHistory {
  @Prop({ required: true, index: true })
  itemId: string;

  @Prop({ required: true, index: true })
  ownerId: string;

  @Prop({ required: true })
  fromStatus: ItemStatus;

  @Prop({ required: true })
  toStatus: ItemStatus;

  @Prop({ type: String, default: null, maxlength: 300 })
  reason: string | null;

  @Prop({ required: true })
  actorId: string;

  createdAt: Date;
}

export const ItemStatusHistorySchema = SchemaFactory.createForClass(ItemStatusHistory);
ItemStatusHistorySchema.index({ itemId: 1, createdAt: -1 });
