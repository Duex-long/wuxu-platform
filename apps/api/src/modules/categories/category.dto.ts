import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCategoryDto {
  @ApiProperty({ example: "玩具" })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ nullable: true, description: "不传表示创建大类目，传入大类目 ID 表示创建小类目" })
  @IsOptional()
  @IsString()
  parentId?: string | null;
}

export class RenameCategoryDto {
  @ApiProperty({ example: "乐高" })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;
}
