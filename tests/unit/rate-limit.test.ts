import { AppError } from "@/lib/errors";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";

describe("in-memory rate limit", () => {
  afterEach(() => resetRateLimit("test:key"));

  test("rejects the request after the configured number of calls", () => {
    consumeRateLimit({ key: "test:key", limit: 2, windowMs: 60_000 });
    consumeRateLimit({ key: "test:key", limit: 2, windowMs: 60_000 });

    expect(() => consumeRateLimit({ key: "test:key", limit: 2, windowMs: 60_000 })).toThrow(
      AppError
    );
  });
});
