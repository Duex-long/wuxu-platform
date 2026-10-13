import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ItemsModule } from "../items/items.module";
import { UsersModule } from "../users/users.module";
import { AdminController } from "./admin.controller";

@Module({
  imports: [AuthModule, ItemsModule, UsersModule],
  controllers: [AdminController],
})
export class AdminModule {}
