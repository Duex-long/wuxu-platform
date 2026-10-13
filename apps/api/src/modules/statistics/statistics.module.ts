import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ItemsModule } from "../items/items.module";
import { AdminStatisticsController, StatisticsController } from "./statistics.controller";

@Module({
  imports: [AuthModule, ItemsModule],
  controllers: [StatisticsController, AdminStatisticsController],
})
export class StatisticsModule {}
