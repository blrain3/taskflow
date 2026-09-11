import { parseClientIp } from "@/lib/client-ip";

describe("client IP parsing", () => {
  test("takes the first address from a proxy chain", () => {
    expect(parseClientIp("203.0.113.8, 10.0.0.2")).toBe("203.0.113.8");
  });

  test("returns null for an empty or whitespace-only header", () => {
    expect(parseClientIp("")).toBeNull();
    expect(parseClientIp("   ")).toBeNull();
    expect(parseClientIp(undefined)).toBeNull();
  });
});
