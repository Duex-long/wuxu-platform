import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthUser, ItemSummary, PaginatedResponse } from "@wuxu/shared-types";

import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { ListItemsQueryDto } from "../items/item.dto";
import { type ItemDetail, ItemsService } from "../items/items.service";
import { UsersService } from "../users/users.service";

export interface AdminItemSummary extends ItemSummary {
  owner: AuthUser | null;
}

export interface AdminItemDetail extends ItemDetail {
  owner: AuthUser | null;
}

@ApiTags("admin")
@ApiBearerAuth()
@Roles("ADMIN")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/items")
export class AdminController {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async list(@Query() query: ListItemsQueryDto): Promise<PaginatedResponse<AdminItemSummary>> {
    const result = await this.itemsService.listForAdmin(query);
    const users = await this.usersService.findSummaries(result.items.map((item) => item.ownerId));
    return {
      ...result,
      items: result.items.map((item) => ({ ...item, owner: users[item.ownerId] ?? null })),
    };
  }

  @Get(":id")
  async detail(@Param("id") id: string): Promise<AdminItemDetail> {
    const item = await this.itemsService.findForAdmin(id);
    const users = await this.usersService.findSummaries([item.ownerId]);
    return { ...item, owner: users[item.ownerId] ?? null };
  }
}
