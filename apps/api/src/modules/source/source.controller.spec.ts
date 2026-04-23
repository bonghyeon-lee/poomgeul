import { SourceController } from "./source.controller.js";

describe("SourceController.lookupLicense", () => {
  const controller = new SourceController();

  it("resolves a bare arXiv ID", () => {
    const result = controller.lookupLicense("2310.12345");
    expect(result).toMatchObject({
      outcome: "allowed",
      license: "CC-BY",
      alreadyRegistered: true,
    });
  });

  it("returns 'invalid-input' with code='empty' for empty string", () => {
    expect(controller.lookupLicense("")).toMatchObject({
      outcome: "invalid-input",
      code: "empty",
    });
  });

  it("returns 'invalid-input' with code='empty' for whitespace", () => {
    expect(controller.lookupLicense("   ")).toMatchObject({
      outcome: "invalid-input",
      code: "empty",
    });
  });

  it("returns 'invalid-input' with code='unsupported' for gibberish", () => {
    expect(controller.lookupLicense("not-an-id")).toMatchObject({
      outcome: "invalid-input",
      code: "unsupported",
    });
  });

  it("forwards arXiv URLs to the parser", () => {
    const result = controller.lookupLicense("https://arxiv.org/abs/2506.00001v1");
    expect(result).toMatchObject({
      outcome: "allowed",
      license: "PD",
    });
  });

  it("tolerates Nest passing undefined for a missing query param", () => {
    expect(
      controller.lookupLicense(undefined as unknown as string),
    ).toMatchObject({
      outcome: "invalid-input",
      code: "empty",
    });
  });
});
