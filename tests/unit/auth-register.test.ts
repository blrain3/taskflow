jest.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("@/lib/auth", () => ({ signIn: jest.fn(), signOut: jest.fn() }));
jest.mock("@/lib/client-ip", () => ({ clientIpKey: jest.fn().mockResolvedValue("203.0.113.10") }));
jest.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: jest.fn(),
  checkRateLimit: jest.fn(),
  recordRateLimitHit: jest.fn(),
  resetRateLimit: jest.fn(),
}));
jest.mock("@/lib/password", () => ({ hashPassword: jest.fn().mockResolvedValue("hash") }));
jest.mock("@/lib/env", () => ({
  env: {
    AUTH_REGISTER_RATE_LIMIT_PER_MINUTE: 5,
    AUTH_IP_RATE_LIMIT_PER_MINUTE: 30,
    AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: 10,
  },
}));

import { registerAccount } from "@/actions/auth";
import { getPrisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({ getPrisma: jest.fn() }));

describe("registerAccount concurrency", () => {
  test("maps a concurrent unique-email race to CONFLICT", async () => {
    let creates = 0;
    (getPrisma as jest.Mock).mockReturnValue({
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async () => {
          creates += 1;
          if (creates === 2) throw { code: "P2002" };
          return { id: "u1" };
        }),
      },
    });
    const form = () => {
      const data = new FormData();
      data.set("name", "Test User");
      data.set("email", "race@example.com");
      data.set("password", "Password1");
      return data;
    };
    const [first, second] = await Promise.all([
      registerAccount(null, form()),
      registerAccount(null, form()),
    ]);
    expect([first, second]).toContainEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "CONFLICT" }) })
    );
  });
});
