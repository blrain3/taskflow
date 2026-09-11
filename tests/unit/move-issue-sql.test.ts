import { buildMoveIssueUpdate } from "@/lib/issues";

/**
 * P0-5 整列重写 SQL 构造的单测（对应 docs/03-development/p0-5-move-issue-bulk-rewrite.md §10.1）。
 *
 * 只断言构造结果，不连数据库：Prisma.Sql 暴露 .sql（? 占位符）与 .values（参数数组）。
 * 目标是证明「序号、参数顺序、转型、时区写法」都正确，为后续替换生产路径打底。
 */
describe("buildMoveIssueUpdate 整列重写 SQL 构造", () => {
  test("序号按数组下标以 100 为步长，参数顺序与占位符一一对应", () => {
    const query = buildMoveIssueUpdate({
      fullOrder: ["a", "b", "c"],
      toStatus: "IN_PROGRESS",
      workspaceId: "ws_1",
    });

    // 参数顺序固定：ids... → toStatus → workspaceId（N + 3 个）
    expect(query.values).toEqual(["a", "b", "c", "IN_PROGRESS", "ws_1"]);

    // 关键写法都在：WITH ORDINALITY、步长公式、枚举转型、UTC 时区
    expect(query.sql).toContain("WITH ORDINALITY");
    expect(query.sql).toContain("((o.ord - 1) * 100)::int");
    expect(query.sql).toContain('::"IssueStatus"');
    expect(query.sql).toContain("AT TIME ZONE 'UTC'");
    expect(query.sql).toContain('i."workspaceId" = ?');

    // 结构不变量：? 占位符个数 === 参数个数。错位时此断言必挂，是兜底最强的一行。
    expect((query.sql.match(/\?/g) ?? []).length).toBe(query.values.length);
    expect(query.values.length).toBe(5);
  });

  test("空列表拒绝构造", () => {
    expect(() =>
      buildMoveIssueUpdate({ fullOrder: [], toStatus: "DONE", workspaceId: "ws_1" })
    ).toThrow(/排序列表为空/);
  });

  test("单元素列表生成合法单成员数组", () => {
    const query = buildMoveIssueUpdate({
      fullOrder: ["solo"],
      toStatus: "TODO",
      workspaceId: "ws_2",
    });

    expect(query.values).toEqual(["solo", "TODO", "ws_2"]);
    expect(query.sql).toContain("ARRAY[?]::text[]");
    expect((query.sql.match(/\?/g) ?? []).length).toBe(query.values.length);
  });

  test("四种状态均可作为 toStatus，且都带枚举转型", () => {
    for (const status of ["BACKLOG", "TODO", "IN_PROGRESS", "DONE"] as const) {
      const query = buildMoveIssueUpdate({
        fullOrder: ["x"],
        toStatus: status,
        workspaceId: "ws",
      });
      // toStatus 是参数化的：值进 values，SQL 里只有 ?::"IssueStatus" 转型占位
      expect(query.sql).toContain('?::"IssueStatus"');
      expect(query.values).toContain(status);
      expect((query.sql.match(/\?/g) ?? []).length).toBe(query.values.length);
    }
  });
});
