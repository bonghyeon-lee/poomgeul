import { parseSourceInput } from "./input.js";
import { lookupLicense } from "./license-lookup.js";

describe("lookupLicense — outcome matrix", () => {
  it("returns 'allowed' for a CC BY arXiv fixture that is not yet registered", () => {
    const result = lookupLicense(parseSourceInput("2504.20451"));
    expect(result).toMatchObject({
      outcome: "allowed",
      license: "CC-BY-SA",
      translationLicense: "CC-BY-SA",
      shareAlike: true,
      alreadyRegistered: false,
    });
  });

  it("returns 'allowed' with alreadyRegistered=true for the sample reader bundle", () => {
    const result = lookupLicense(parseSourceInput("2310.12345"));
    expect(result).toMatchObject({
      outcome: "allowed",
      license: "CC-BY",
      translationLicense: "CC-BY",
      shareAlike: false,
      alreadyRegistered: true,
      registeredSlug: "sparse-moe-low-resource-mt",
    });
  });

  it("returns 'allowed' for a PD fixture", () => {
    const result = lookupLicense(parseSourceInput("2506.00001"));
    expect(result).toMatchObject({
      outcome: "allowed",
      license: "PD",
      shareAlike: false,
    });
  });

  it("returns 'blocked' for CC BY-ND", () => {
    const result = lookupLicense(parseSourceInput("2401.11112"));
    expect(result).toMatchObject({
      outcome: "blocked",
      license: "CC-BY-ND",
    });
  });

  it("returns 'not-found' for an unknown arXiv id with valid format", () => {
    const result = lookupLicense(parseSourceInput("2507.99999"));
    expect(result).toMatchObject({
      outcome: "not-found",
    });
  });

  it("returns 'unsupported-format' for DOI inputs", () => {
    const result = lookupLicense(parseSourceInput("10.1234/abcd.5678"));
    expect(result).toMatchObject({
      outcome: "unsupported-format",
    });
  });

  it("preserves shareAlike=false for plain CC BY", () => {
    const result = lookupLicense(parseSourceInput("2310.12345"));
    if (result.outcome !== "allowed") throw new Error("expected allowed");
    expect(result.shareAlike).toBe(false);
  });

  it("flips shareAlike to true for CC BY-SA", () => {
    const result = lookupLicense(parseSourceInput("2504.20451"));
    if (result.outcome !== "allowed") throw new Error("expected allowed");
    expect(result.shareAlike).toBe(true);
    expect(result.translationLicense).toBe("CC-BY-SA");
  });
});
