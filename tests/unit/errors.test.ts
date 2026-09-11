import { AppError, messageFor, toActionError } from "@/lib/errors";

describe("error mapping", () => {
  test("keeps safe AppError code and message", () => {
    const result = toActionError(new AppError("UNAUTHORIZED"));
    expect(result).toEqual({ code: "UNAUTHORIZED", message: messageFor("UNAUTHORIZED") });
  });

  test("hides unexpected error details", () => {
    const result = toActionError(new Error("database password=secret"));
    expect(result).toEqual({ code: "INTERNAL", message: messageFor("INTERNAL") });
  });
});
