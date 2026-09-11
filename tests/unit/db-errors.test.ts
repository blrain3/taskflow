import { isUniqueViolation } from "@/lib/db-errors";

describe("database error mapping", () => {
  test("recognizes Prisma P2002 for concurrent registration handling", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation({ code: "P2025" })).toBe(false);
    expect(isUniqueViolation(new Error("P2002"))).toBe(false);
  });
});
