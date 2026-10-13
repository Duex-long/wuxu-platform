import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "user@wuxu.local" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "wuxu-user-123456" })
  @IsString()
  @MinLength(8)
  password: string;
}
