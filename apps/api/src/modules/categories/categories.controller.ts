import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { CategoryNode } from "@wuxu/shared-types";

import type { AuthenticatedUser } from "../../common/auth-user";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto, RenameCategoryDto } from "./category.dto";

@ApiTags("categories")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get("tree")
  tree(@CurrentUser() user: AuthenticatedUser): Promise<CategoryNode[]> {
    return this.categoriesService.tree(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateCategoryDto) {
    return this.categoriesService.create(user.id, input.name, input.parentId);
  }

  @Patch(":id")
  rename(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() input: RenameCategoryDto) {
    return this.categoriesService.rename(user.id, id, input.name);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<void> {
    await this.categoriesService.remove(user.id, id);
  }
}
