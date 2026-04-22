import { SourceInputError, parseSourceInput } from "./input.js";

describe("parseSourceInput — bare arXiv ID", () => {
  it("parses a modern arXiv id without version", () => {
    expect(parseSourceInput("2504.20451")).toEqual({
      kind: "arxiv",
      id: "2504.20451",
      bareId: "2504.20451",
      version: undefined,
    });
  });

  it("parses a versioned arXiv id", () => {
    expect(parseSourceInput("2504.20451v2")).toEqual({
      kind: "arxiv",
      id: "2504.20451v2",
      bareId: "2504.20451",
      version: 2,
    });
  });

  it("strips surrounding whitespace", () => {
    expect(parseSourceInput("  2504.20451  ")).toMatchObject({
      kind: "arxiv",
      bareId: "2504.20451",
    });
  });

  it("accepts the 'arXiv:' prefix (case-insensitive)", () => {
    expect(parseSourceInput("arXiv:2504.20451")).toMatchObject({
      kind: "arxiv",
      id: "2504.20451",
      bareId: "2504.20451",
    });
    expect(parseSourceInput("ARXIV:2504.20451v3")).toMatchObject({
      kind: "arxiv",
      id: "2504.20451v3",
      bareId: "2504.20451",
      version: 3,
    });
  });
});

describe("parseSourceInput — arXiv URLs", () => {
  it.each([
    ["abs URL", "https://arxiv.org/abs/2504.20451"],
    ["abs URL with version", "https://arxiv.org/abs/2504.20451v2"],
    ["pdf URL", "https://arxiv.org/pdf/2504.20451"],
    ["pdf URL with .pdf suffix", "https://arxiv.org/pdf/2504.20451v2.pdf"],
    ["ar5iv URL", "https://ar5iv.labs.arxiv.org/html/2504.20451"],
    ["http (not https)", "http://arxiv.org/abs/2504.20451"],
  ])("parses %s", (_label, url) => {
    const result = parseSourceInput(url);
    expect(result.kind).toBe("arxiv");
    expect((result as { bareId: string }).bareId).toBe("2504.20451");
  });

  it("preserves the version when present in the URL", () => {
    expect(parseSourceInput("https://arxiv.org/abs/2504.20451v2")).toMatchObject({
      bareId: "2504.20451",
      version: 2,
    });
  });

  it("drops URL query strings and fragments", () => {
    expect(
      parseSourceInput("https://arxiv.org/abs/2504.20451?context=cs.CL#section-2"),
    ).toMatchObject({
      bareId: "2504.20451",
    });
  });
});

describe("parseSourceInput — DOI", () => {
  it("parses a bare DOI", () => {
    expect(parseSourceInput("10.1234/abcd.5678")).toEqual({
      kind: "doi",
      id: "10.1234/abcd.5678",
    });
  });

  it("parses a DOI URL (https://doi.org/...)", () => {
    expect(parseSourceInput("https://doi.org/10.1234/abcd.5678")).toEqual({
      kind: "doi",
      id: "10.1234/abcd.5678",
    });
  });

  it("parses a 'doi:' prefix (case-insensitive)", () => {
    expect(parseSourceInput("doi:10.1234/abcd.5678")).toEqual({
      kind: "doi",
      id: "10.1234/abcd.5678",
    });
    expect(parseSourceInput("DOI:10.1234/abcd.5678")).toEqual({
      kind: "doi",
      id: "10.1234/abcd.5678",
    });
  });

  it("lowercases the DOI (DOIs are case-insensitive per spec)", () => {
    expect(parseSourceInput("10.1234/AbCd.5678")).toEqual({
      kind: "doi",
      id: "10.1234/abcd.5678",
    });
  });
});

describe("parseSourceInput — errors", () => {
  it("throws SourceInputError('empty') on empty input", () => {
    expect(() => parseSourceInput("")).toThrow(SourceInputError);
    try {
      parseSourceInput("");
    } catch (err) {
      expect(err).toBeInstanceOf(SourceInputError);
      expect((err as SourceInputError).code).toBe("empty");
    }
  });

  it("throws 'empty' on whitespace-only input", () => {
    expect(() => parseSourceInput("   ")).toThrow(expect.objectContaining({ code: "empty" }));
  });

  it("throws 'unsupported' on a random URL", () => {
    expect(() => parseSourceInput("https://example.com/paper/42")).toThrow(
      expect.objectContaining({ code: "unsupported" }),
    );
  });

  it("throws 'unsupported' on legacy arXiv ids (cs.AI/0601001)", () => {
    expect(() => parseSourceInput("cs.AI/0601001")).toThrow(
      expect.objectContaining({ code: "unsupported" }),
    );
  });

  it("throws 'unsupported' on gibberish", () => {
    expect(() => parseSourceInput("not-an-id")).toThrow(
      expect.objectContaining({ code: "unsupported" }),
    );
  });
});
