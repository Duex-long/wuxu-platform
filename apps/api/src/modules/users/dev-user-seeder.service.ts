import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hash } from "bcryptjs";

import { UsersService } from "./users.service";

@Injectable()
export class DevUserSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DevUserSeederService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>("SEED_DEV_USERS", "false") !== "true") return;

    await this.ensureUser(
      this.config.get<string>("DEV_USER_EMAIL", "user@wuxu.local"),
      this.config.get<string>("DEV_USER_PASSWORD", "wuxu-user-123456"),
      "普通用户",
      "USER",
    );
    await this.ensureUser(
      this.config.get<string>("DEV_ADMIN_EMAIL", "admin@wuxu.local"),
      this.config.get<string>("DEV_ADMIN_PASSWORD", "wuxu-admin-123456"),
      "系统管理员",
      "ADMIN",
    );
  }

  private async ensureUser(
    email: string,
    password: string,
    displayName: string,
    role: "USER" | "ADMIN",
  ): Promise<void> {
    if (await this.usersService.findByEmail(email)) return;

    await this.usersService.create({
      email,
      displayName,
      passwordHash: await hash(password, 12),
      role,
    });
    this.logger.log(`Seeded development ${role.toLowerCase()} account: ${email}`);
  }
}
