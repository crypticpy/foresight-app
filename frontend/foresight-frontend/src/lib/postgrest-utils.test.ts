import { describe, it, expect } from "vitest";
import { sanitizeForOrIlike } from "./postgrest-utils";

describe("sanitizeForOrIlike", () => {
  it("passes through alphanumerics and whitespace", () => {
    expect(sanitizeForOrIlike("austin smart city")).toBe("austin smart city");
  });

  it("strips LIKE wildcard %", () => {
    expect(sanitizeForOrIlike("foo%bar")).toBe("foo bar");
  });

  it("strips LIKE wildcard _", () => {
    expect(sanitizeForOrIlike("foo_bar")).toBe("foo bar");
  });

  it("strips PostgREST alternate wildcard *", () => {
    expect(sanitizeForOrIlike("foo*bar")).toBe("foo bar");
  });

  it("strips LIKE escape character \\", () => {
    expect(sanitizeForOrIlike("foo\\bar")).toBe("foo bar");
  });

  it("strips OR-grammar comma", () => {
    expect(sanitizeForOrIlike("a,b")).toBe("a b");
  });

  it("strips OR-grammar parentheses", () => {
    expect(sanitizeForOrIlike("a(b)c")).toBe("a b c");
  });

  it("strips an attempted injection that escapes the .or() expression", () => {
    expect(sanitizeForOrIlike("x%,id.eq.123,name.ilike.")).toBe(
      "x  id.eq.123 name.ilike.",
    );
  });

  it("trims leading and trailing whitespace from the result", () => {
    expect(sanitizeForOrIlike("  hello  ")).toBe("hello");
  });

  it("returns empty string when input is entirely metacharacters", () => {
    expect(sanitizeForOrIlike("%_*\\,()")).toBe("");
  });
});
