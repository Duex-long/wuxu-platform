import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { CategoryNode } from "@wuxu/shared-types";

import type { AuthenticatedUser } from "../../common/auth-user";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto, RenameCategoryDto } from "./category.dto";

@ApiTags("categories")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get("tree")
  tree(): Promise<CategoryNode[]> {
    return this.categoriesService.tree();
  }

  @Post()
  @Roles("ADMIN")
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateCategoryDto) {
    return this.categoriesService.create(user.id, input.name, input.parentId);
  }

  @Patch(":id")
  @Roles("ADMIN")
  rename(@Param("id") id: string, @Body() input: RenameCategoryDto) {
    return this.categoriesService.rename(id, input.name);
  }

  @Delete(":id")
  @Roles("ADMIN")
  @HttpCode(204)
  async remove(@Param("id") id: string): Promise<void> {
    await this.categoriesService.remove(id);
  }
}
