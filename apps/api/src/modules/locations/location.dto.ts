import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateLocationDto {
  @ApiProperty({ example: "书房左侧柜" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ example: "书房靠窗的白色五层柜" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @ApiProperty({ description: "管理员先通过图片接口上传得到的图片 ID" })
  @IsMongoId()
  photoImageId: string;
}

export class UpdateLocationDto extends PartialType(CreateLocationDto) {}
