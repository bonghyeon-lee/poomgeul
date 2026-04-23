import { loadPrompt } from "./prompt-loader.js";

describe("loadPrompt", () => {
  it("loads translate.en-ko.v1.md with frontmatter and body", () => {
    const prompt = loadPrompt("translate.en-ko.v1.md");
    expect(prompt.frontmatter.name).toBe("translate.en-ko");
    expect(prompt.frontmatter.version).toBe(1);
    expect(prompt.frontmatter.modelHint).toBe("google/gemini-2.5-flash");
    expect(prompt.frontmatter.temperature).toBe(0.2);
    expect(prompt.frontmatter.maxOutputTokens).toBe(8192);
    expect(prompt.body).toContain("# System prompt");
    expect(prompt.versionId).toBe("translate.en-ko.v1");
    expect(prompt.hash).toMatch(/^[0-9a-f]{8}$/);
  });
});
