jest.mock("@/lib/client-ip", () => ({
  clientIpKey: jest.fn(),
}));

import { clientIpKey } from "@/lib/client-ip";
import {
  assertLoginAllowed,
  clearLoginFailures,
  consumeLoginAttempt,
  consumeRegisterAttempt,
  recordLoginFailure,
} from "@/lib/auth-rate-limit";

const mockedClientIpKey = jest.mocked(clientIpKey);

/** 用独立邮箱/IP 隔离模块级桶状态，避免用例间互相污染 */
const uniqueEmail = (tag: string) => `ratelimit-${tag}-${Date.now()}-${Math.random()}@test.local`;

describe("认证限流共享逻辑", () => {
  beforeAll(() => {
    process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = "3";
    process.env.AUTH_IP_RATE_LIMIT_PER_MINUTE = "50";
    process.env.AUTH_REGISTER_RATE_LIMIT_PER_MINUTE = "2";
  });

  test("登录失败累计到额度后，下一次尝试被拒", async () => {
    mockedClientIpKey.mockResolvedValue("10.0.0.1");
    const email = uniqueEmail("failure");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const gate = await consumeLoginAttempt(email);
      recordLoginFailure(gate);
    }

    await expect(consumeLoginAttempt(email)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  test("成功登录（clearLoginFailures）会重置邮箱失败桶", async () => {
    mockedClientIpKey.mockResolvedValue("10.0.0.2");
    const email = uniqueEmail("clear");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const gate = await consumeLoginAttempt(email);
      recordLoginFailure(gate);
    }
    await expect(consumeLoginAttempt(email)).rejects.toMatchObject({ code: "RATE_LIMITED" });

    clearLoginFailures({ ipKey: null, emailKey: `auth:login:email:${email}:10.0.0.2` });
    await expect(consumeLoginAttempt(email)).resolves.toBeTruthy();
  });

  test("IP 维度不可信（null）时跳过 IP 桶，邮箱失败桶仍然生效", async () => {
    mockedClientIpKey.mockResolvedValue(null);
    const email = uniqueEmail("untrusted");

    // 生产未信任代理：IP 桶不参与，拒绝只来自邮箱失败桶（3 次）
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const gate = await consumeLoginAttempt(email);
      recordLoginFailure(gate);
    }
    await expect(consumeLoginAttempt(email)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  test("assertLoginAllowed 只查不计数：多次调用不推进任何桶", async () => {
    mockedClientIpKey.mockResolvedValue("10.0.0.3");
    const email = uniqueEmail("precheck");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(assertLoginAllowed(email)).resolves.toBeUndefined();
    }
    // 只查不计数：额度原封不动，计数路径仍可完整使用
    const gate = await consumeLoginAttempt(email);
    expect(gate.ipKey).toBe("auth:login:ip:10.0.0.3");
    expect(gate.emailKey).toContain(email);
  });

  test("注册尝试按 IP 计数，额度内放行、超限拒绝", async () => {
    mockedClientIpKey.mockResolvedValue("10.0.0.4");

    await consumeRegisterAttempt();
    await consumeRegisterAttempt();
    await expect(consumeRegisterAttempt()).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  test("IP 不可信时注册限流整体跳过（不能退化为全局桶）", async () => {
    mockedClientIpKey.mockResolvedValue(null);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await expect(consumeRegisterAttempt()).resolves.toBeUndefined();
    }
  });
});
