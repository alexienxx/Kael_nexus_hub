import { describe, expect, it } from "vitest";

import { identityDisplayName } from "@/lib/api/referencePhotos";

describe("reference photos identity labels", () => {
  it("maps canonical alexien slug to visible Alexièn label", () => {
    expect(identityDisplayName("alexien")).toBe("Alexièn");
  });

  it("keeps the canonical kael slug while displaying Arrakis", () => {
    expect(identityDisplayName("kael")).toBe("Arrakis");
  });
});
