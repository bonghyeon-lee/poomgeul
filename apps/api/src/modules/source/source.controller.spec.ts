import type { ArxivClient, ArxivMetadata } from "./arxiv-client.js";
import { LicenseLookupService } from "./license-lookup.js";
import { SourceController } from "./source.controller.js";
import type { SourceRepository } from "./source.repository.js";
import type { CreateTranslationResult } from "./source.service.js";
import { SourceService } from "./source.service.js";

function stubArxiv(
  behavior: (bareId: string) => Promise<ArxivMetadata>,
): ArxivClient {
  return { fetchMetadata: behavior } as unknown as ArxivClient;
}

function stubRepo(): SourceRepository {
  return { findRegisteredByArxivBareId: async () => null } as unknown as SourceRepository;
}

function stubSourceService(
  result: CreateTranslationResult = {
    outcome: "created",
    sourceId: "s-1",
    translationId: "t-1",
    slug: "example",
    license: "CC-BY",
    title: "Example",
    version: "v1",
  },
): SourceService {
  return {
    createFromArxiv: async () => result,
  } as unknown as SourceService;
}

const CCBY_FIXTURE: ArxivMetadata = {
  bareId: "2310.12345",
  version: "v2",
  title: "Sparse Mixture-of-Experts for Low-Resource Machine Translation",
  authors: ["Sofía Restrepo"],
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
};

function makeController(opts?: {
  fetchMetadata?: (bareId: string) => Promise<ArxivMetadata>;
  sourceService?: SourceService;
}): SourceController {
  const lookup = new LicenseLookupService(
    stubArxiv(opts?.fetchMetadata ?? (async () => CCBY_FIXTURE)),
    stubRepo(),
  );
  return new SourceController(lookup, opts?.sourceService ?? stubSourceService());
}

describe("SourceController.lookupLicense", () => {
  it("resolves a bare arXiv ID via the service", async () => {
    const result = await makeController().lookupLicense("2310.12345");
    expect(result).toMatchObject({ outcome: "allowed", license: "CC-BY" });
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
    const result = await makeController({
      fetchMetadata: async () => ({
        ...CCBY_FIXTURE,
        bareId: "2506.00001",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      }),
    }).lookupLicense("https://arxiv.org/abs/2506.00001v1");
    expect(result).toMatchObject({ outcome: "allowed", license: "PD" });
  });

  it("tolerates Nest passing undefined for a missing query param", async () => {
    const result = await makeController().lookupLicense(
      undefined as unknown as string,
    );
    expect(result).toMatchObject({ outcome: "invalid-input", code: "empty" });
  });
});

describe("SourceController.createSource", () => {
  it("delegates to SourceService.createFromArxiv and forwards the result", async () => {
    const result = await makeController({
      sourceService: stubSourceService({
        outcome: "created",
        sourceId: "s-xyz",
        translationId: "t-xyz",
        slug: "my-paper",
        license: "CC-BY",
        title: "Paper",
        version: "v1",
      }),
    }).createSource({ input: "2310.12345" });
    expect(result).toMatchObject({ outcome: "created", slug: "my-paper" });
  });

  it("returns invalid-input for an empty body.input", async () => {
    const result = await makeController().createSource({ input: "" });
    expect(result).toMatchObject({ outcome: "invalid-input", code: "empty" });
  });

  it("returns invalid-input for gibberish", async () => {
    const result = await makeController().createSource({ input: "not-an-id" });
    expect(result).toMatchObject({ outcome: "invalid-input", code: "unsupported" });
  });

  it("returns unsupported-format for DOI input without calling the service", async () => {
    let serviceCalls = 0;
    const service = {
      createFromArxiv: async () => {
        serviceCalls += 1;
        throw new Error("should not be called");
      },
    } as unknown as SourceService;
    const controller = makeController({ sourceService: service });
    const result = await controller.createSource({ input: "10.1234/abcd.5678" });
    expect(result).toMatchObject({ outcome: "unsupported-format" });
    expect(serviceCalls).toBe(0);
  });

  it("passes blocked outcome through when the license service rejects", async () => {
    const result = await makeController({
      sourceService: stubSourceService({
        outcome: "blocked",
        license: "arxiv-default",
        title: "Non-CC",
        reason: "arxiv-default",
      }),
    }).createSource({ input: "2504.20451" });
    expect(result).toMatchObject({ outcome: "blocked", license: "arxiv-default" });
  });
});
