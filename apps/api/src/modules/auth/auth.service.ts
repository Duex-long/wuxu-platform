import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { LoginResponse } from "@wuxu/shared-types";
import { compare } from "bcryptjs";

import type { JwtPayload } from "../../common/auth-user";
import { UsersService } from "../users/users.service";
import { LoginDto } from "./login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(input: LoginDto): Promise<LoginResponse> {
    const user = await this.usersService.findByEmail(input.email);
    if (!user || user.status !== "ACTIVE" || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException("邮箱或密码错误");
    }

    const authUser = this.usersService.toAuthUser(user);
    const payload: JwtPayload = {
      sub: authUser.id,
      email: authUser.email,
      displayName: authUser.displayName,
      role: authUser.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: authUser,
    };
  }
}
