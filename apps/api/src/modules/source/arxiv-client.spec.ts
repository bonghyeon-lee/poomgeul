import { ArxivClient, ArxivNotFoundError, ArxivUpstreamError, normalizeLicenseUrl } from "./arxiv-client.js";

// Atom 샘플은 실제 arXiv Query API 응답에서 발췌·축약했다. entry 하나짜리 형태가
// 우리 사용 패턴(id_list=하나) 전부이므로 이 셋이 충분하다.
const ATOM_NO_LICENSE = `
<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2504.20451v1</id>
    <title>Team ACK at SemEval-2025 Task 2: Beyond Word-for-Word Machine Translation for English-Korean Pairs</title>
    <updated>2025-04-29T05:58:19Z</updated>
    <author><name>Daniel Lee</name></author>
    <author><name>Harsh Sharma</name></author>
  </entry>
</feed>`;

const ATOM_CCBY = `
<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2310.12345v2</id>
    <title>Sparse Mixture-of-Experts for Low-Resource Machine Translation</title>
    <link href="https://arxiv.org/abs/2310.12345v2" rel="alternate" type="text/html"/>
    <link href="http://creativecommons.org/licenses/by/4.0/" rel="license"/>
    <author><name>Sofia Restrepo</name></author>
    <author><name>Arjun Iyer</name></author>
  </entry>
</feed>`;

const ATOM_CCBYSA = `
<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2201.00001v1</id>
    <title>Sample CC BY-SA Paper</title>
    <link href="https://creativecommons.org/licenses/by-sa/4.0/" rel="license" type="text/html"/>
    <author><name>Some Author</name></author>
  </entry>
</feed>`;

const ATOM_EMPTY = `
<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <opensearch:totalResults>0</opensearch:totalResults>
</feed>`;

function mockFetchOnce(body: string, init: Partial<Response> = {}): void {
  globalThis.fetch = jest.fn(async () => {
    const status = init.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    } as Response;
  });
}

describe("normalizeLicenseUrl", () => {
  it.each([
    ["https://creativecommons.org/licenses/by/4.0/", "CC-BY"],
    ["https://creativecommons.org/licenses/by-sa/4.0/", "CC-BY-SA"],
    ["http://creativecommons.org/licenses/by-nd/4.0/", "CC-BY-ND"],
    ["https://creativecommons.org/licenses/by-nc-nd/4.0/", "CC-BY-NC-ND"],
    ["https://creativecommons.org/licenses/by-nc/4.0/", "CC-BY-NC"],
    ["http://creativecommons.org/licenses/by-nc-sa/4.0/", "CC-BY-NC-SA"],
    ["https://creativecommons.org/publicdomain/zero/1.0/", "PD"],
  ])("maps %s → %s", (url, expected) => {
    expect(normalizeLicenseUrl(url)).toBe(expected);
  });

  it("returns null for non-CC URLs (arXiv default)", () => {
    expect(normalizeLicenseUrl("http://arxiv.org/licenses/nonexclusive-distrib/1.0/")).toBeNull();
  });

  it("returns null when the URL is missing", () => {
    expect(normalizeLicenseUrl(null)).toBeNull();
  });
});

describe("ArxivClient.fetchMetadata", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("parses title, version, authors and CC BY license link", async () => {
    mockFetchOnce(ATOM_CCBY);
    const client = new ArxivClient();
    const meta = await client.fetchMetadata("2310.12345");
    expect(meta).toMatchObject({
      bareId: "2310.12345",
      version: "v2",
      title: "Sparse Mixture-of-Experts for Low-Resource Machine Translation",
      authors: ["Sofia Restrepo", "Arjun Iyer"],
      licenseUrl: "http://creativecommons.org/licenses/by/4.0/",
    });
  });

  it("extracts CC BY-SA license url", async () => {
    mockFetchOnce(ATOM_CCBYSA);
    const meta = await new ArxivClient().fetchMetadata("2201.00001");
    expect(normalizeLicenseUrl(meta.licenseUrl)).toBe("CC-BY-SA");
  });

  it("returns licenseUrl=null when neither Atom nor abs HTML has a license link", async () => {
    mockFetchOnce(ATOM_NO_LICENSE);
    const meta = await new ArxivClient().fetchMetadata("2504.20451");
    expect(meta.licenseUrl).toBeNull();
    expect(meta.authors).toEqual(["Daniel Lee", "Harsh Sharma"]);
  });

  it("falls back to abs HTML when Atom has no license link (observed: 2604.00030)", async () => {
    // 1st fetch → Atom 없는 license, 2nd fetch → abs HTML with abs-license div.
    const absHtml = `<html><body>
      <div class="abs-license"><a href="http://creativecommons.org/licenses/by-nc-sa/4.0/" title="Rights to this article" class="has_license">view license</a></div>
      </body></html>`;
    let call = 0;
    globalThis.fetch = jest.fn(async () => {
      call += 1;
      const body = call === 1 ? ATOM_NO_LICENSE : absHtml;
      return {
        ok: true,
        status: 200,
        text: async () => body,
      } as Response;
    });
    const meta = await new ArxivClient().fetchMetadata("2604.00030");
    expect(meta.licenseUrl).toBe("http://creativecommons.org/licenses/by-nc-sa/4.0/");
    expect(call).toBe(2);
  });

  it("still returns null when abs HTML also lacks abs-license", async () => {
    const absHtml = "<html><body><h1>paper</h1></body></html>";
    let call = 0;
    globalThis.fetch = jest.fn(async () => {
      call += 1;
      return {
        ok: true,
        status: 200,
        text: async () => (call === 1 ? ATOM_NO_LICENSE : absHtml),
      } as Response;
    });
    const meta = await new ArxivClient().fetchMetadata("2504.20451");
    expect(meta.licenseUrl).toBeNull();
  });

  it("throws ArxivNotFoundError on 404", async () => {
    mockFetchOnce("", { status: 404 });
    await expect(new ArxivClient().fetchMetadata("9999.99999")).rejects.toBeInstanceOf(
      ArxivNotFoundError,
    );
  });

  it("throws ArxivNotFoundError when the feed has no entry", async () => {
    mockFetchOnce(ATOM_EMPTY);
    await expect(new ArxivClient().fetchMetadata("9999.99999")).rejects.toBeInstanceOf(
      ArxivNotFoundError,
    );
  });

  it("throws ArxivUpstreamError on non-2xx non-404 status", async () => {
    mockFetchOnce("", { status: 503 });
    await expect(new ArxivClient().fetchMetadata("2310.12345")).rejects.toBeInstanceOf(
      ArxivUpstreamError,
    );
  });

  it("throws ArxivUpstreamError on network failure", async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(new ArxivClient().fetchMetadata("2310.12345")).rejects.toBeInstanceOf(
      ArxivUpstreamError,
    );
  });

  it("throws ArxivUpstreamError when the request is aborted (timeout)", async () => {
    globalThis.fetch = jest.fn(async () => {
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    });
    await expect(
      new ArxivClient({ timeoutMs: 1 }).fetchMetadata("2310.12345"),
    ).rejects.toThrow(/timed out/);
  });
});
