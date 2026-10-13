import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { ItemSummary, PaginatedResponse } from "@wuxu/shared-types";

import type { AuthenticatedUser } from "../../common/auth-user";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { CreateItemDto, ListItemsQueryDto, UpdateItemDto, UpdateItemStatusDto } from "./item.dto";
import { type ItemDetail, ItemsService } from "./items.service";

@ApiTags("items")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("items")
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListItemsQueryDto,
  ): Promise<PaginatedResponse<ItemSummary>> {
    return this.itemsService.listForOwner(user.id, query);
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<ItemDetail> {
    return this.itemsService.findForOwner(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateItemDto): Promise<ItemDetail> {
    return this.itemsService.create(user.id, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() input: UpdateItemDto,
  ): Promise<ItemDetail> {
    return this.itemsService.update(user.id, id, input);
  }

  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() input: UpdateItemStatusDto,
  ): Promise<ItemDetail> {
    return this.itemsService.updateStatus(user.id, id, input.status, input.reason ?? null);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<void> {
    await this.itemsService.softDelete(user.id, id);
  }
}
