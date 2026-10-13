import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ITEM_STATUSES, type ItemStatus } from "@wuxu/shared-types";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateItemDto {
  @ApiProperty({ example: "旅行收纳箱" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: "storage" })
  @IsString()
  @MinLength(1)
  bigCategoryId: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  smallCategoryId?: string | null;

  @ApiProperty({ example: 2 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;

  @ApiProperty({ example: "个" })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit: string;

  @ApiPropertyOptional({ nullable: true, description: "由管理后台创建的存放位置 ID" })
  @IsOptional()
  @IsMongoId()
  locationId?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "2027-10-01" })
  @IsOptional()
  @IsDateString()
  expiresOn?: string | null;

  @ApiProperty({ enum: ITEM_STATUSES, default: "UNUSED" })
  @IsIn(ITEM_STATUSES)
  status: ItemStatus;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageIds?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string | null;
}

export class UpdateItemDto extends PartialType(CreateItemDto) {}

export class UpdateItemStatusDto {
  @ApiProperty({ enum: ITEM_STATUSES })
  @IsIn(ITEM_STATUSES)
  status: ItemStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string | null;
}

export class ListItemsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  keyword?: string;

  @ApiPropertyOptional({ enum: ITEM_STATUSES })
  @IsOptional()
  @IsIn(ITEM_STATUSES)
  status?: ItemStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bigCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string;

  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsOptional()
  @IsMongoId()
  locationId?: string;
}
