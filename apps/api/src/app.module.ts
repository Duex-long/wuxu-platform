import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { HealthModule } from "./modules/health/health.module";
import { ItemsModule } from "./modules/items/items.module";
import { LocationsModule } from "./modules/locations/locations.module";
import { MediaModule } from "./modules/media/media.module";
import { StatisticsModule } from "./modules/statistics/statistics.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "mysql" as const,
        host: config.get<string>("MYSQL_HOST", "mysql"),
        port: config.get<number>("MYSQL_PORT", 3306),
        database: config.get<string>("MYSQL_DATABASE", "wuxu"),
        username: config.get<string>("MYSQL_USER", "wuxu"),
        password: config.get<string>("MYSQL_PASSWORD", "wuxu_dev_password"),
        autoLoadEntities: true,
        synchronize: config.get<string>("MYSQL_SYNCHRONIZE", "false") === "true",
        retryAttempts: 20,
        retryDelay: 3000,
      }),
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>("MONGODB_URI", "mongodb://mongodb:27017/wuxu"),
        retryAttempts: 20,
        retryDelay: 3000,
      }),
    }),
    UsersModule,
    AuthModule,
    CategoriesModule,
    LocationsModule,
    ItemsModule,
    MediaModule,
    StatisticsModule,
    AdminModule,
    HealthModule,
  ],
})
export class AppModule {}
