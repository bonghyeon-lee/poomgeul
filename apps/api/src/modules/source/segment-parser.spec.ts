import { parseAr5ivHtml, splitSentences } from "./segment-parser.js";

describe("splitSentences", () => {
  it("splits on . ! ? followed by space + uppercase", () => {
    const text = "First sentence. Second sentence! Third? Fourth one.";
    expect(splitSentences(text)).toEqual([
      "First sentence.",
      "Second sentence!",
      "Third?",
      "Fourth one.",
    ]);
  });

  it("respects known abbreviations (e.g., i.e.)", () => {
    const text = "We use LLMs (e.g., GPT-4) for this task. Results follow.";
    const out = splitSentences(text);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("e.g.");
  });

  it("keeps an inline MATH placeholder inside the sentence", () => {
    const text = "The loss ⟦MATH⟧ is minimized. It converges.";
    expect(splitSentences(text)).toEqual(["The loss ⟦MATH⟧ is minimized.", "It converges."]);
  });

  it("returns empty for empty input", () => {
    expect(splitSentences("")).toEqual([]);
  });
});

describe("parseAr5ivHtml — abstract + body + references + footnote", () => {
  const SAMPLE = `
  <html>
  <head><title>irrelevant</title><script>noise</script></head>
  <body>
    <h1 class="ltx_title ltx_title_document">Title</h1>
    <div class="ltx_abstract">
      <h6 class="ltx_title ltx_title_abstract">Abstract</h6>
      <p class="ltx_p">We study routing sparsity. Results show gains on four pairs.</p>
    </div>
    <section class="ltx_section">
      <p class="ltx_p">The rest of this paper is organized as follows. §2 situates the work.</p>
      <div class="ltx_equation">
        <math>e = mc^2</math>
      </div>
      <p class="ltx_p">The loss <math>\\mathcal{L}</math> is balanced. It converges to zero.</p>
      <span class="ltx_note ltx_role_footnote">
        <span class="ltx_note_content">We release training logs under CC BY 4.0.</span>
      </span>
    </section>
    <section class="ltx_bibliography">
      <ul>
        <li class="ltx_bibitem">Shazeer, N. (2017). Outrageously Large Neural Networks. ICLR.</li>
        <li class="ltx_bibitem">Fedus, W. (2022). Switch Transformers. JMLR.</li>
      </ul>
    </section>
  </body>
  </html>
  `;

  const segments = parseAr5ivHtml(SAMPLE);

  it("extracts at least one abstract sentence as body", () => {
    const firstTwo = segments.slice(0, 2);
    expect(firstTwo.every((s) => s.kind === "body")).toBe(true);
    expect(firstTwo[0]!.text).toContain("routing sparsity");
  });

  it("splits body paragraphs into sentences", () => {
    const bodyTexts = segments.filter((s) => s.kind === "body").map((s) => s.text);
    // abstract 2 문장 + body 두 단락의 문장들 + equation 1개(body kind로)
    expect(bodyTexts).toEqual(
      expect.arrayContaining([
        "We study routing sparsity.",
        "The rest of this paper is organized as follows.",
      ]),
    );
  });

  it("replaces inline <math> with a placeholder and keeps the sentence intact", () => {
    const ref = segments.find((s) => s.text.includes("⟦MATH⟧"));
    expect(ref).toBeDefined();
    expect(ref!.text).toContain("loss");
  });

  it("keeps equation blocks as separate body segments (not swallowed)", () => {
    const eqLike = segments.find((s) => /e\s*=\s*mc/.test(s.text));
    expect(eqLike).toBeDefined();
  });

  it("extracts bibliography entries as reference segments in order", () => {
    const refs = segments.filter((s) => s.kind === "reference");
    expect(refs).toHaveLength(2);
    expect(refs[0]!.text).toContain("Shazeer");
    expect(refs[1]!.text).toContain("Fedus");
  });

  it("extracts footnote content", () => {
    const notes = segments.filter((s) => s.kind === "footnote");
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes[0]!.text).toContain("training logs");
  });

  it("assigns monotonically increasing order starting at 0", () => {
    for (let i = 0; i < segments.length; i += 1) {
      expect(segments[i]!.order).toBe(i);
    }
  });
});

describe("parseAr5ivHtml — edge cases", () => {
  it("returns [] for HTML without any ltx_p / ltx_bibitem", () => {
    expect(parseAr5ivHtml("<html><body><p>nope</p></body></html>")).toEqual([]);
  });

  it("drops paragraphs shorter than minChars (noise filter)", () => {
    const html = `<div class="ltx_abstract"><p class="ltx_p">OK.</p><p class="ltx_p">This is a longer sentence that should stay.</p></div>`;
    const out = parseAr5ivHtml(html, { minChars: 10 });
    expect(out.every((s) => s.text.length >= 10)).toBe(true);
    expect(out.length).toBe(1);
  });
});
