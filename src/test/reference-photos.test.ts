import { describe, expect, it } from "vitest";

import { identityDisplayName } from "@/lib/api/referencePhotos";

describe("reference photos identity labels", () => {
  it("maps canonical alexien slug to visible Alexièn label", () => {
    expect(identityDisplayName("alexien")).toBe("Alexièn");
  });

  it("maps canonical kael slug to visible Kael label", () => {
    expect(identityDisplayName("kael")).toBe("Kael");
  });
});