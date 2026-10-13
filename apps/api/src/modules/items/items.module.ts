import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { AuthModule } from "../auth/auth.module";
import { CategoriesModule } from "../categories/categories.module";
import { LocationsModule } from "../locations/locations.module";
import { MediaModule } from "../media/media.module";
import { Item, ItemSchema } from "./item.schema";
import { ItemStatusHistory, ItemStatusHistorySchema } from "./item-status-history.schema";
import { ItemsController } from "./items.controller";
import { ItemsService } from "./items.service";

@Module({
  imports: [
    AuthModule,
    CategoriesModule,
    LocationsModule,
    MediaModule,
    MongooseModule.forFeature([
      { name: Item.name, schema: ItemSchema },
      { name: ItemStatusHistory.name, schema: ItemStatusHistorySchema },
    ]),
  ],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
