import { describe, it, expect } from "vitest";
import { buildMarketQuery, parseMarketParams, mergeMarketParams } from "./marketQuery";

describe("buildMarketQuery", () => {
  it("omits defaults so a clean browse produces an empty string", () => {
    expect(buildMarketQuery({ page: 1, sort: "newest" })).toBe("");
    expect(buildMarketQuery({ categoryIds: [], conditions: [] })).toBe("");
  });

  it("serializes filters, joining multi-value params with commas", () => {
    const q = buildMarketQuery({
      q: "brake pads",
      sort: "price_asc",
      categoryIds: ["c1", "c2"],
      conditions: ["NEW", "GOOD"],
      minPrice: 10,
      maxPrice: 100,
      modelId: "m1",
      year: 2005,
      page: 3,
    });
    const sp = new URLSearchParams(q.slice(1));
    expect(sp.get("q")).toBe("brake pads");
    expect(sp.get("sort")).toBe("price_asc");
    expect(sp.get("categoryIds")).toBe("c1,c2");
    expect(sp.get("conditions")).toBe("NEW,GOOD");
    expect(sp.get("minPrice")).toBe("10");
    expect(sp.get("modelId")).toBe("m1");
    expect(sp.get("year")).toBe("2005");
    expect(sp.get("page")).toBe("3");
  });

  it("keeps a zero minPrice (0 is a real bound, not a missing value)", () => {
    expect(buildMarketQuery({ minPrice: 0 })).toBe("?minPrice=0");
  });
});

describe("parseMarketParams", () => {
  it("round-trips with buildMarketQuery", () => {
    const original = {
      q: "engine",
      sort: "price_desc" as const,
      categoryIds: ["c1"],
      conditions: ["USED" as never].filter(() => false), // start empty
      modelId: "m9",
      year: 2010,
    };
    const parsed = parseMarketParams(new URLSearchParams(buildMarketQuery(original).slice(1)));
    expect(parsed.q).toBe("engine");
    expect(parsed.sort).toBe("price_desc");
    expect(parsed.categoryIds).toEqual(["c1"]);
    expect(parsed.modelId).toBe("m9");
    expect(parsed.year).toBe(2010);
    expect(parsed.page).toBe(1);
  });

  it("defaults sort to newest and drops unknown sort/condition values", () => {
    const parsed = parseMarketParams(new URLSearchParams("sort=cheapest&conditions=NEW,BOGUS"));
    expect(parsed.sort).toBe("newest");
    expect(parsed.conditions).toEqual(["NEW"]);
  });
});

describe("mergeMarketParams", () => {
  it("resets to page 1 on any filter change", () => {
    const merged = mergeMarketParams({ page: 5, q: "x" }, { modelId: "m1" });
    expect(merged.page).toBe(1);
    expect(merged.modelId).toBe("m1");
    expect(merged.q).toBe("x");
  });

  it("honours an explicit page in the patch (pagination)", () => {
    const merged = mergeMarketParams({ page: 1 }, { page: 2 });
    expect(merged.page).toBe(2);
  });
});
