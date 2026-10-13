import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection } from "@nestjs/mongoose";
import type { HealthResponse } from "@wuxu/shared-types";
import type { Connection } from "mongoose";
import { DataSource } from "typeorm";

@Controller("health")
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @InjectConnection() private readonly mongoConnection: Connection,
    private readonly config: ConfigService,
  ) {}

  @Get("live")
  live(): HealthResponse {
    return {
      status: "ok",
      service: "wuxu-api",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async ready(): Promise<HealthResponse> {
    const [mysql, mongodb, objectStorage] = await Promise.all([
      this.mysqlStatus(),
      this.mongodbStatus(),
      this.objectStorageStatus(),
    ]);
    const dependencies = { mysql, mongodb, objectStorage } as const;
    return {
      status: Object.values(dependencies).every((status) => status === "up") ? "ok" : "degraded",
      service: "wuxu-api",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }

  private async mysqlStatus(): Promise<"up" | "down"> {
    try {
      await this.dataSource.query("SELECT 1");
      return "up";
    } catch {
      return "down";
    }
  }

  private async mongodbStatus(): Promise<"up" | "down"> {
    try {
      await this.mongoConnection.db?.admin().ping();
      return "up";
    } catch {
      return "down";
    }
  }

  private async objectStorageStatus(): Promise<"up" | "down"> {
    try {
      const response = await fetch(this.config.get<string>("S3_ENDPOINT", "http://object-storage:8333"), {
        signal: AbortSignal.timeout(2000),
      });
      return response.status < 500 ? "up" : "down";
    } catch {
      return "down";
    }
  }
}
