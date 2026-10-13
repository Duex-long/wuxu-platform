import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { LocationSummary } from "@wuxu/shared-types";

import type { AuthenticatedUser } from "../../common/auth-user";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { CreateLocationDto, ListLocationsQueryDto, UpdateLocationDto } from "./location.dto";
import { LocationsService } from "./locations.service";

@ApiTags("locations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("locations")
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListLocationsQueryDto,
  ): Promise<LocationSummary[]> {
    return this.locationsService.listForUser(user.id, query);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateLocationDto): Promise<LocationSummary> {
    return this.locationsService.createPersonal(user.id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<void> {
    await this.locationsService.removePersonal(user.id, id);
  }
}

@ApiTags("admin")
@ApiBearerAuth()
@Roles("ADMIN")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/locations")
export class AdminLocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  list(@Query() query: ListLocationsQueryDto): Promise<LocationSummary[]> {
    return this.locationsService.listForAdmin(query);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateLocationDto): Promise<LocationSummary> {
    return this.locationsService.createGlobal(user.id, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() input: UpdateLocationDto,
  ): Promise<LocationSummary> {
    return this.locationsService.update(user.id, id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<void> {
    await this.locationsService.removeAsAdmin(user.id, id);
  }
}
