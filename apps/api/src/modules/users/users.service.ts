import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { AuthUser, UserRole } from "@wuxu/shared-types";
import { In, Repository } from "typeorm";

import { UserEntity } from "./user.entity";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({ where: { email: email.toLowerCase() } });
  }

  async findSummaries(ids: string[]): Promise<Record<string, AuthUser>> {
    if (ids.length === 0) return {};
    const users = await this.usersRepository.find({ where: { id: In([...new Set(ids)]) } });
    return Object.fromEntries(users.map((user) => [user.id, this.toAuthUser(user)]));
  }

  async create(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<UserEntity> {
    return this.usersRepository.save(
      this.usersRepository.create({
        email: input.email.toLowerCase(),
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        role: input.role,
        status: "ACTIVE",
      }),
    );
  }

  toAuthUser(user: UserEntity): AuthUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }
}
