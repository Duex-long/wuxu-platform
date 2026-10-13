import type { UserRole } from "@wuxu/shared-types";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "users" })
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 190, unique: true })
  email: string;

  @Column({ name: "password_hash", type: "varchar", length: 255 })
  passwordHash: string;

  @Column({ name: "display_name", type: "varchar", length: 100 })
  displayName: string;

  @Column({ type: "enum", enum: ["USER", "ADMIN"], default: "USER" })
  role: UserRole;

  @Column({ type: "enum", enum: ["ACTIVE", "DISABLED"], default: "ACTIVE" })
  status: "ACTIVE" | "DISABLED";

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
