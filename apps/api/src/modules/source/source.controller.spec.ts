import type { ArxivClient, ArxivMetadata } from "./arxiv-client.js";
import { LicenseLookupService } from "./license-lookup.js";
import { SourceController } from "./source.controller.js";

function stubArxiv(
  behavior: (bareId: string) => Promise<ArxivMetadata>,
): ArxivClient {
  return { fetchMetadata: behavior } as unknown as ArxivClient;
}

const CCBY_FIXTURE: ArxivMetadata = {
  bareId: "2310.12345",
  version: "v2",
  title: "Sparse Mixture-of-Experts for Low-Resource Machine Translation",
  authors: ["Sofía Restrepo"],
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
};

function makeController(
  behavior: (bareId: string) => Promise<ArxivMetadata> = async () => CCBY_FIXTURE,
): SourceController {
  const service = new LicenseLookupService(stubArxiv(behavior));
  return new SourceController(service);
}

describe("SourceController.lookupLicense", () => {
  it("resolves a bare arXiv ID via the service", async () => {
    const result = await makeController().lookupLicense("2310.12345");
    expect(result).toMatchObject({
      outcome: "allowed",
      license: "CC-BY",
      alreadyRegistered: true,
    });
  });

  it("returns 'invalid-input' with code='empty' for empty string", async () => {
    const result = await makeController().lookupLicense("");
    expect(result).toMatchObject({ outcome: "invalid-input", code: "empty" });
  });

  it("returns 'invalid-input' with code='empty' for whitespace", async () => {
    const result = await makeController().lookupLicense("   ");
    expect(result).toMatchObject({ outcome: "invalid-input", code: "empty" });
  });

  it("returns 'invalid-input' with code='unsupported' for gibberish", async () => {
    const result = await makeController().lookupLicense("not-an-id");
    expect(result).toMatchObject({
      outcome: "invalid-input",
      code: "unsupported",
    });
  });

  it("forwards arXiv URLs to the parser", async () => {
    const result = await makeController(async () => ({
      ...CCBY_FIXTURE,
      bareId: "2506.00001",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    })).lookupLicense("https://arxiv.org/abs/2506.00001v1");
    expect(result).toMatchObject({ outcome: "allowed", license: "PD" });
  });

  it("tolerates Nest passing undefined for a missing query param", async () => {
    const result = await makeController().lookupLicense(
      undefined as unknown as string,
    );
    expect(result).toMatchObject({ outcome: "invalid-input", code: "empty" });
  });
});
