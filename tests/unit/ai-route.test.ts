jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));
jest.mock("@/lib/ai", () => ({
  breakdownSubtasks: jest.fn(),
}));

import { POST } from "@/app/api/ai/breakdown/route";
import { breakdownSubtasks } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";

const mockUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockBreakdown = breakdownSubtasks as jest.MockedFunction<typeof breakdownSubtasks>;

describe("POST /api/ai/breakdown", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns 401 before parsing body when unauthenticated", async () => {
    mockUser.mockResolvedValue(null);
    const response = await POST(
      new Request("http://localhost/api/ai/breakdown", { method: "POST" })
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(mockBreakdown).not.toHaveBeenCalled();
  });

  test("returns 400 for an invalid prompt", async () => {
    mockUser.mockResolvedValue({ id: "u1", email: "u@test.local", name: "User" });
    const response = await POST(
      new Request("http://localhost/api/ai/breakdown", {
        method: "POST",
        body: JSON.stringify({ prompt: "too short" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(response.status).toBe(400);
    expect(mockBreakdown).not.toHaveBeenCalled();
  });

  test("maps AI timeout to 504 and does not expose internals", async () => {
    mockUser.mockResolvedValue({ id: "u1", email: "u@test.local", name: "User" });
    mockBreakdown.mockRejectedValue(
      new AppError("AI_TIMEOUT", { detail: "secret upstream detail" })
    );
    const response = await POST(
      new Request("http://localhost/api/ai/breakdown", {
        method: "POST",
        body: JSON.stringify({ prompt: "请拆解一个足够长的任务描述" }),
      })
    );
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "AI_TIMEOUT", message: "AI 响应超时，请重试" },
    });
  });
});
