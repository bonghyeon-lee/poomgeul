import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

/**
 * prompts/translate.en-ko.v1.md 같은 파일을 읽어 frontmatter와 본문을 분리.
 * DB·설정 서버 경유 없이 파일 경로로 직접 로드한다(guides/llm-integration.md §프롬프트 버저닝).
 *
 * frontmatter는 단순 YAML 하위집합(string/number/null 스칼라)만 다룬다. 복잡한 매핑은
 * 이 프롬프트 계약에 없다.
 */

export type PromptFrontmatter = {
  name: string;
  version: number;
  modelHint?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export type LoadedPrompt = {
  frontmatter: PromptFrontmatter;
  /** System prompt 본문 — "# System prompt" 등 원문 그대로. LLM에 systemInstruction으로 전달. */
  body: string;
  /** 프롬프트 전체 SHA-256 해시 8자. 관측·감사용. */
  hash: string;
  /** `name.version` 형태 식별자. TranslationSegment.aiDraftSource.version 등에 저장. */
  versionId: string;
};

const PROMPT_ROOT = process.env.PROMPT_ROOT ?? resolve(process.cwd(), "../../prompts");

export function loadPrompt(filename: string): LoadedPrompt {
  const path = resolve(PROMPT_ROOT, filename);
  const raw = readFileSync(path, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`prompt file ${filename} has no frontmatter block`);
  }
  const [, yaml, body] = match;
  const frontmatter = parseFrontmatter(yaml!);
  const hash = createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 8);
  return {
    frontmatter,
    body: body!.trim(),
    hash,
    versionId: `${frontmatter.name}.v${frontmatter.version}`,
  };
}

function parseFrontmatter(yaml: string): PromptFrontmatter {
  const lines = yaml.split("\n");
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([a-zA-Z_][\w]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    const value = (rest ?? "").trim();
    // 리스트나 중첩 매핑 시작 라인은 무시(스칼라만 쓴다).
    if (value === "" || value.startsWith("-") || value === "|" || value === ">") continue;
    fields[key!] = stripQuotes(value);
  }
  if (!fields.name || !fields.version) {
    throw new Error("prompt frontmatter requires 'name' and 'version'");
  }
  const result: PromptFrontmatter = {
    name: fields.name,
    version: Number(fields.version),
  };
  if (fields.model_hint) result.modelHint = fields.model_hint;
  if (fields.temperature) result.temperature = Number(fields.temperature);
  if (fields.max_output_tokens) result.maxOutputTokens = Number(fields.max_output_tokens);
  return result;
}

function stripQuotes(s: string): string {
  if ((s.startsWith("\"") && s.endsWith("\"")) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}
