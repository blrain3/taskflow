import "server-only";

import { compare, hash } from "bcryptjs";

/**
 * 密码哈希。选用 bcryptjs（纯 JS）而非 argon2 / bcrypt 原生绑定：
 * 原生模块在 Debian/Alpine 镜像里需要额外编译工具链，纯 JS 实现可直接运行，
 * 避免「本地能跑、容器里装不上」的环境差异。详见 adr-001 §4。
 */

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return compare(plain, passwordHash);
}
