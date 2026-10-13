import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { DevUserSeederService } from "./dev-user-seeder.service";
import { UserEntity } from "./user.entity";
import { UsersService } from "./users.service";

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [UsersService, DevUserSeederService],
  exports: [UsersService],
})
export class UsersModule {}
