import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { InventoryStatistics } from "@wuxu/shared-types";

import type { AuthenticatedUser } from "../../common/auth-user";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { ItemsService } from "../items/items.service";

@ApiTags("statistics")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("statistics")
export class StatisticsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get("overview")
  overview(@CurrentUser() user: AuthenticatedUser): Promise<InventoryStatistics> {
    return this.itemsService.statisticsForOwner(user.id);
  }
}

@ApiTags("admin")
@ApiBearerAuth()
@Roles("ADMIN")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/statistics")
export class AdminStatisticsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get("overview")
  overview(): Promise<InventoryStatistics> {
    return this.itemsService.statisticsForAdmin();
  }
}
