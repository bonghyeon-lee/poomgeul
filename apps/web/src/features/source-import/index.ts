export {
  SourceInputError,
  parseSourceInput,
} from "./parse-source-input";
export type {
  ArxivId,
  DoiId,
  ParsedSource,
  SourceInputErrorCode,
} from "./parse-source-input";

export { lookupSourceLicense } from "./mock-license-lookup";
export type { LicenseLookupResult } from "./mock-license-lookup";
