/**
 * Storage abstraction for study resources. The resource row stores (storageProvider, locator);
 * a provider turns that into something the browser can open. Add S3/Noon CDN providers here
 * without touching pages.
 */
export type ResolvedResource = { href: string | null; reason: string | null };

export interface ResourceStorageProvider {
  readonly id: string;
  resolve(locator: string | null): ResolvedResource;
}

/** Plain https URL supplied by an admin. */
export const urlProvider: ResourceStorageProvider = {
  id: "url",
  resolve(locator) {
    if (!locator) return { href: null, reason: "لا يوجد رابط لهذا المصدر بعد." };
    try {
      const u = new URL(locator);
      if (u.protocol !== "https:") return { href: null, reason: "الرابط غير آمن." };
      return { href: u.toString(), reason: null };
    } catch {
      return { href: null, reason: "الرابط غير صالح." };
    }
  },
};

/** Development examples have no file at all — they exist only to show the layout. */
export const devExampleProvider: ResourceStorageProvider = {
  id: "dev_example",
  resolve: () => ({ href: null, reason: "مثال للتطوير — لا يوجد ملف حقيقي." }),
};

const PROVIDERS: Record<string, ResourceStorageProvider> = { url: urlProvider, dev_example: devExampleProvider };

export function resolveResource(storageProvider: string, locator: string | null): ResolvedResource {
  const p = PROVIDERS[storageProvider];
  return p ? p.resolve(locator) : { href: null, reason: "مزوّد التخزين غير مُعدّ." };
}

export const RESOURCE_TYPES = {
  pdf: "ملف PDF",
  slides: "شرائح",
  video: "فيديو",
  explanation: "شرح مكتوب",
  learning_path: "مسار تعلّم",
} as const;
export type ResourceType = keyof typeof RESOURCE_TYPES;
export const isResourceType = (v: string | null | undefined): v is ResourceType => !!v && v in RESOURCE_TYPES;
