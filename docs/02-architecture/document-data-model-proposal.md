# Document 数据模型提案

> 状态：提案，待 ADR-007 确认
> 版本：v1.0
> 最后更新：2026-09-13
> 说明：本文件只定义第一阶段模型，不修改当前 `prisma/schema.prisma`

## 1. 设计原则

- 文档必须绑定 Workspace，所有查询先校验成员权限。
- 当前正文保存在 Document，历史不可变内容保存在 DocumentVersion。
- 使用 `contentVersion` 做乐观并发控制；过期保存返回冲突，不静默覆盖。
- 删除第一阶段采用软删除字段，避免版本历史失去引用。
- 不为实时协作引入操作日志、光标表或 CRDT 状态。

## 2. Prisma Schema 提案

```prisma
enum DocumentStatus {
  DRAFT
  ARCHIVED
}

enum DocumentContentFormat {
  MARKDOWN
  RICH_TEXT
}

model Document {
  id            String               @id @default(cuid())
  workspaceId   String
  authorId      String
  title         String               @db.VarChar(200)
  content       String               @db.Text
  summary       String?              @db.Text
  format        DocumentContentFormat @default(MARKDOWN)
  status        DocumentStatus       @default(DRAFT)
  contentVersion Int                 @default(1)
  deletedAt     DateTime?
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt

  workspace     Workspace            @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  author        User                 @relation(fields: [authorId], references: [id], onDelete: Restrict)
  versions      DocumentVersion[]

  @@index([workspaceId, updatedAt, id])
  @@index([authorId, updatedAt])
  @@index([workspaceId, status, updatedAt])
}

model DocumentVersion {
  id            String   @id @default(cuid())
  documentId    String
  version       Int
  title         String   @db.VarChar(200)
  content       String   @db.Text
  summary       String?  @db.Text
  format        DocumentContentFormat
  createdById   String
  createdAt     DateTime @default(now())

  document      Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  createdBy     User     @relation(fields: [createdById], references: [id], onDelete: Restrict)

  @@unique([documentId, version])
  @@index([documentId, version])
}
```

## 3. 现有模型需要的关系补充

```prisma
model Workspace {
  documents Document[]
}

model User {
  authoredDocuments Document[] @relation("DocumentAuthor")
  documentVersions  DocumentVersion[] @relation("DocumentVersionCreator")
}
```

实际实现时必须在 `Document.author`、`Document.createdBy` 等关系上补充与上述 relation 名一致的双向字段，并先运行 `prisma format`、`prisma validate` 和迁移评审。

## 4. 保存事务语义

1. 校验 Session、WorkspaceMember、文档编辑权限。
2. 校验客户端传入的 `baseVersion === document.contentVersion`。
3. 在同一事务内更新 Document 并创建 DocumentVersion。
4. 将 `contentVersion` 加一；冲突时返回 `CONFLICT`，不创建版本。
5. 自动保存和手动保存共享同一 Action，避免两套语义。

## 5. 迁移注意事项

- 第一阶段不修改或删除 Issue 表。
- 不把旧 Issue 数据自动转换为 Document，除非另开数据迁移任务并可回滚。
- 迁移 Job 必须先通过影子环境验证，生产发布前独立执行。
