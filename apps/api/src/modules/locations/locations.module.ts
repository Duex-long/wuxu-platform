import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { AuthModule } from "../auth/auth.module";
import { Item, ItemSchema } from "../items/item.schema";
import { MediaModule } from "../media/media.module";
import { StorageLocation, StorageLocationSchema } from "./location.schema";
import { AdminLocationsController, LocationsController } from "./locations.controller";
import { LocationsService } from "./locations.service";

@Module({
  imports: [
    AuthModule,
    MediaModule,
    MongooseModule.forFeature([
      { name: StorageLocation.name, schema: StorageLocationSchema },
      { name: Item.name, schema: ItemSchema },
    ]),
  ],
  controllers: [LocationsController, AdminLocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
