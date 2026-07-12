import { describe, expect, it } from "vitest";
import { assertDemoPrefix } from "../scripts/seed-demo.js";

describe("seed-demo prefix confinement", () => {
  const prefix = "lab3-demo-";

  it("accepts values within the demo prefix", () => {
    expect(() =>
      assertDemoPrefix("lab3-demo-group", prefix, "group"),
    ).not.toThrow();
    expect(() =>
      assertDemoPrefix("lab3-demo-alice@example.com", prefix, "login"),
    ).not.toThrow();
  });

  it("refuses values outside the demo prefix", () => {
    expect(() => assertDemoPrefix("other-group", prefix, "group")).toThrow(
      /prefix confinement refused/,
    );
    expect(() =>
      assertDemoPrefix("alice@example.com", prefix, "login"),
    ).toThrow(/prefix confinement refused/);
  });
});
