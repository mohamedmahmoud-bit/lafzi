import "server-only";
import { readFileSync } from "node:fs";
import { env } from "@/lib/env";
import { FileQuestionBankProvider, HttpQuestionBankProvider, MockQuestionBankProvider, NoQuestionBankProvider } from "./index";
import type { NoonQuestionBankProvider, NoonQuestionDTO } from "../types";

let provider: NoonQuestionBankProvider | undefined;

export function getQuestionBankProvider(): NoonQuestionBankProvider {
  if (provider) return provider;
  const e = env();
  switch (e.NOON_QB_PROVIDER) {
    case "mock":
      provider = e.NODE_ENV === "production"
        ? new NoQuestionBankProvider("Mock question bank is refused in production")
        : new MockQuestionBankProvider();
      break;
    case "http":
      provider = new HttpQuestionBankProvider({
        baseUrl: e.NOON_QB_BASE_URL || undefined,
        token: e.NOON_QB_TOKEN || undefined,
        searchPath: e.NOON_QB_SEARCH_PATH || undefined,
        detailPath: e.NOON_QB_DETAIL_PATH,
        subjectId: 249,
        timeoutMs: 15_000,
      });
      break;
    case "file":
      try {
        const data = JSON.parse(readFileSync(e.NOON_QB_IMPORT_FILE!, "utf8")) as NoonQuestionDTO[] | { data: NoonQuestionDTO[] };
        provider = new FileQuestionBankProvider(Array.isArray(data) ? data : data.data);
      } catch {
        provider = new NoQuestionBankProvider("NOON_QB_IMPORT_FILE missing or unreadable");
      }
      break;
    default:
      provider = new NoQuestionBankProvider();
  }
  return provider;
}

/** Tests / admin import can swap the source. */
export function setQuestionBankProvider(p: NoonQuestionBankProvider | undefined) {
  provider = p;
}
