-- 把 WorkspaceMember.role 从裸 String 收紧为数据库枚举（架构评审 P1-8）。
--
-- 为什么不用 `prisma migrate dev` 生成的默认 DDL：Prisma 对 String → Enum 的差异判定是
-- 「DROP COLUMN + ADD COLUMN」，会把既有成员的角色全部重置为默认值 OWNER —— 任何 EDITOR
-- 都会被静默降级为 OWNER，属于权限数据丢失。这里改为原地改写类型并显式转型。
--
-- 语句顺序有硬性要求，不要调整：
--   1) 先建枚举类型（否则下一步的转型目标不存在）；
--   2) 先摘掉旧的文本默认值（列上的默认值表达式必须在改类型前解除）；
--   3) 再改类型，用 USING 显式转型；
--   4) 最后挂回枚举默认值。

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'EDITOR');

-- 迁移前自检：发现枚举外的角色值时中止迁移，并报出具体取值。
-- 宁可中止，也不要静默把未知角色改写成 OWNER —— 那等于凭空放大权限。
-- 注意：下面的 USING 转型本身也会因非法值而报错，这段 DO 块的价值是给出**可定位**的错误信息，
-- 而不仅仅是一句「invalid input value for enum」。
DO $$
DECLARE
  unexpected text;
BEGIN
  SELECT string_agg(DISTINCT "role", ', ')
    INTO unexpected
    FROM "WorkspaceMember"
   WHERE "role" IS DISTINCT FROM 'OWNER'
     AND "role" IS DISTINCT FROM 'EDITOR';

  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION
      'WorkspaceMember.role 存在枚举外的值（%）。请先确认这些成员应有的角色，再重新执行迁移。',
      unexpected;
  END IF;
END
$$;

-- AlterTable：原地改写类型，保住既有数据
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "WorkspaceMember"
  ALTER COLUMN "role" TYPE "WorkspaceRole"
  USING ("role"::text::"WorkspaceRole");

ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" SET DEFAULT 'OWNER';
