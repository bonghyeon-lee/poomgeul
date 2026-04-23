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

export { createSource, lookupSourceLicense } from "./api-license-lookup";
export type { CreateSourceResult, LicenseLookupResult } from "./api-license-lookup";
