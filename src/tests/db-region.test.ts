import { describe, expect, it } from "vitest";
import { dbRegionOf, regionVerdict } from "@/lib/db-region";

describe("dbRegionOf", () => {
  it("reads the region out of a Neon address and nothing else", () => {
    expect(dbRegionOf("postgresql://u:secret@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require")).toBe("eu-central-1");
    expect(dbRegionOf("postgresql://u:p@ep-x.us-east-2.aws.neon.tech:5432/db")).toBe("us-east-2");
    expect(dbRegionOf("postgresql://u:p@ep-x.westeurope.azure.neon.tech/db")).toBe("unknown");
  });
  it("is unknown for other hosts and for nothing", () => {
    expect(dbRegionOf("postgresql://postgres:postgres@127.0.0.1:5433/postgres")).toBe("unknown");
    expect(dbRegionOf(undefined)).toBe("unknown");
  });
});

describe("regionVerdict", () => {
  it("says close only for the same side of the ocean, and far for a database in Frankfurt and functions in Washington", () => {
    expect(regionVerdict("eu-central-1", "fra1")).toBe("close");
    expect(regionVerdict("eu-central-1", "iad1")).toBe("far");
    expect(regionVerdict("us-east-2", "iad1")).toBe("close");
    expect(regionVerdict("us-east-2", "fra1")).toBe("far");
  });
  it("does not guess without the facts", () => {
    expect(regionVerdict("unknown", "fra1")).toBe("unknown");
    expect(regionVerdict("eu-central-1", undefined)).toBe("unknown");
  });
});
