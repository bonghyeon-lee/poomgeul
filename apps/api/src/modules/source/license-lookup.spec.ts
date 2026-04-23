import type { ArxivClient, ArxivMetadata } from "./arxiv-client.js";
import { ArxivNotFoundError, ArxivUpstreamError } from "./arxiv-client.js";
import { parseSourceInput } from "./input.js";
import { LicenseLookupService } from "./license-lookup.js";

function makeStubClient(
  behavior: (bareId: string) => Promise<ArxivMetadata>,
): ArxivClient {
  return { fetchMetadata: behavior } as unknown as ArxivClient;
}

function metadataFixture(overrides: Partial<ArxivMetadata>): ArxivMetadata {
  return {
    bareId: "2310.12345",
    version: "v2",
    title: "Sample Paper",
    authors: ["A Author"],
    licenseUrl: null,
    ...overrides,
  };
}

describe("LicenseLookupService.lookup", () => {
  it("returns unsupported-format for DOIs without hitting arXiv", async () => {
    const client = makeStubClient(async () => {
      throw new Error("should not be called");
    });
    const service = new LicenseLookupService(client);
    const result = await service.lookup(parseSourceInput("10.1234/abcd.5678"));
    expect(result).toMatchObject({ outcome: "unsupported-format" });
  });

  it("allows CC BY and sets shareAlike=false", async () => {
    const client = makeStubClient(async () =>
      metadataFixture({
        bareId: "2504.20451",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        title: "CC BY paper",
        authors: ["First", "Second"],
        version: "v1",
      }),
    );
    const service = new LicenseLookupService(client);
    const result = await service.lookup(parseSourceInput("2504.20451"));
    expect(result).toMatchObject({
      outcome: "allowed",
      license: "CC-BY",
      translationLicense: "CC-BY",
      shareAlike: false,
      alreadyRegistered: false,
      title: "CC BY paper",
      authors: ["First", "Second"],
      version: "v1",
    });
  });

  it("locks translationLicense to CC-BY-SA and flips shareAlike=true for CC BY-SA", async () => {
    const client = makeStubClient(async () =>
      metadataFixture({
        bareId: "2201.00001",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      }),
    );
    const result = await new LicenseLookupService(client).lookup(
      parseSourceInput("2201.00001"),
    );
    expect(result).toMatchObject({
      outcome: "allowed",
      license: "CC-BY-SA",
      translationLicense: "CC-BY-SA",
      shareAlike: true,
    });
  });

  it("marks alreadyRegistered=true for the sample reader bundle slug", async () => {
    const client = makeStubClient(async () =>
      metadataFixture({
        bareId: "2310.12345",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      }),
    );
    const result = await new LicenseLookupService(client).lookup(
      parseSourceInput("2310.12345"),
    );
    expect(result).toMatchObject({
      outcome: "allowed",
      alreadyRegistered: true,
      registeredSlug: "sparse-moe-low-resource-mt",
    });
  });

  it("blocks CC BY-ND", async () => {
    const client = makeStubClient(async () =>
      metadataFixture({
        licenseUrl: "https://creativecommons.org/licenses/by-nd/4.0/",
      }),
    );
    const result = await new LicenseLookupService(client).lookup(
      parseSourceInput("2310.12345"),
    );
    expect(result).toMatchObject({ outcome: "blocked", license: "CC-BY-ND" });
  });

  it("blocks arXiv default (no CC license link)", async () => {
    const client = makeStubClient(async () =>
      metadataFixture({ licenseUrl: null }),
    );
    const result = await new LicenseLookupService(client).lookup(
      parseSourceInput("2310.12345"),
    );
    expect(result).toMatchObject({
      outcome: "blocked",
      license: "arxiv-default",
    });
  });

  it("returns not-found when arXiv has no entry", async () => {
    const client = makeStubClient(async () => {
      throw new ArxivNotFoundError("9999.99999");
    });
    const result = await new LicenseLookupService(client).lookup(
      parseSourceInput("9999.99999"),
    );
    expect(result).toMatchObject({ outcome: "not-found" });
  });

  it("returns upstream-error when arXiv is unreachable", async () => {
    const client = makeStubClient(async () => {
      throw new ArxivUpstreamError("arXiv request timed out after 8000ms");
    });
    const result = await new LicenseLookupService(client).lookup(
      parseSourceInput("2310.12345"),
    );
    expect(result).toMatchObject({ outcome: "upstream-error" });
  });

  it("allows PD", async () => {
    const client = makeStubClient(async () =>
      metadataFixture({
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      }),
    );
    const result = await new LicenseLookupService(client).lookup(
      parseSourceInput("2506.00001"),
    );
    expect(result).toMatchObject({ outcome: "allowed", license: "PD", shareAlike: false });
  });
});
