// The product catalogue the agents may talk about, and searching it.
//
// Products arrive from Shopify (webhooks and the one-off import) or are typed
// in on the Products screen. Each gets an embedding — a list of numbers that
// captures what it is — so a customer asking "anything for dry skin under
// 1,000?" can be matched to the right few products by meaning rather than by
// exact words. The agent is then handed those products with their real price
// and stock, instead of being left to make something up (docs/Rules.md §5).
//
// Embedding calls the AI provider, which is slow and can fail, so it never
// happens inside a webhook: saving a product queues a `catalog.embed` job.
// A hash of the embedded text means an unchanged product is not re-embedded
// every time Shopify re-sends it.
//
// The `embedding` column is a pgvector type Prisma can't express, so the few
// queries that touch it are raw SQL, each commented (docs/Rules.md §1).
//
// Relative .ts imports: runs in jobs and the message router on the
// always-on host.

import "server-only";

import { createHash } from "node:crypto";

import { db } from "./db.ts";
import { embedText } from "./ai-client.ts";
import { readGeminiApiKey } from "./ai-credentials.ts";
import { enqueueJob } from "./jobs.ts";
import { isFeatureEnabled } from "./features.ts";

type ShopRef = { id: string; businessId: string; shopDomain: string };

type ShopifyVariant = {
  price?: string | null;
  inventory_quantity?: number | null;
  inventory_management?: string | null;
};

type ShopifyProduct = {
  id?: number | string;
  title?: string | null;
  body_html?: string | null;
  vendor?: string | null;
  product_type?: string | null;
  handle?: string | null;
  tags?: string | string[] | null;
  status?: string | null;
  variants?: ShopifyVariant[] | null;
  image?: { src?: string | null } | null;
  images?: { src?: string | null }[] | null;
};

export type ProductInput = {
  externalId: string;
  title: string;
  description?: string;
  vendor?: string | null;
  productType?: string | null;
  tags?: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string | null;
  inventory?: number | null;
  available?: boolean;
  url?: string | null;
  imageUrl?: string | null;
};

/** Turns Shopify's product into ours. Exported for the import job. */
export function productFromShopify(shopDomain: string, product: ShopifyProduct): ProductInput | null {
  if (product.id === undefined || product.id === null || !product.title) return null;

  const variants = product.variants ?? [];
  const prices = variants
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price));

  // Stock is only meaningful for variants the store actually tracks.
  const tracked = variants.filter((variant) => variant.inventory_management);
  const inventory = tracked.length
    ? tracked.reduce((sum, variant) => sum + Math.max(0, variant.inventory_quantity ?? 0), 0)
    : null;

  const tags = Array.isArray(product.tags)
    ? product.tags
    : (product.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);

  return {
    externalId: String(product.id),
    title: product.title.slice(0, 250),
    description: stripHtml(product.body_html ?? "").slice(0, 4_000),
    vendor: product.vendor || null,
    productType: product.product_type || null,
    tags: tags.slice(0, 30),
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    inventory,
    available: (product.status ?? "active") === "active" && (inventory === null || inventory > 0),
    url: product.handle ? `https://${shopDomain}/products/${product.handle}` : null,
    imageUrl: product.image?.src ?? product.images?.[0]?.src ?? null,
  };
}

/** Saves a product from a Shopify webhook or the import. */
export async function upsertShopifyProduct(shop: ShopRef, payload: Record<string, unknown>) {
  const product = productFromShopify(shop.shopDomain, payload as ShopifyProduct);

  if (!product) return null;

  return saveProduct(shop.businessId, "SHOPIFY", product);
}

/** Shopify says a product was deleted. */
export async function removeShopifyProduct(shop: ShopRef, payload: Record<string, unknown>) {
  const id = (payload as { id?: number | string }).id;

  if (id === undefined || id === null) return;

  await db.product.deleteMany({
    where: { businessId: shop.businessId, source: "SHOPIFY", externalId: String(id) },
  });
}

/** Creates or updates one product, and queues it for indexing if it changed. */
export async function saveProduct(
  businessId: string,
  source: "SHOPIFY" | "MANUAL",
  product: ProductInput,
) {
  const data = {
    title: product.title,
    description: product.description ?? "",
    vendor: product.vendor ?? null,
    productType: product.productType ?? null,
    tags: product.tags ?? [],
    priceMin: product.priceMin ?? null,
    priceMax: product.priceMax ?? null,
    currency: product.currency ?? null,
    inventory: product.inventory ?? null,
    available: product.available ?? true,
    url: product.url ?? null,
    imageUrl: product.imageUrl ?? null,
  };

  const saved = await db.product.upsert({
    where: { businessId_source_externalId: { businessId, source, externalId: product.externalId } },
    create: { businessId, source, externalId: product.externalId, ...data },
    update: data,
    select: { id: true, embeddedHash: true },
  });

  const hash = embeddingHash(data);

  if (saved.embeddedHash !== hash && isFeatureEnabled("catalogSearch")) {
    await enqueueJob({
      businessId,
      jobType: "catalog.embed",
      // Per version of the text: an edit queues a new job, a re-sent webhook
      // with the same text does not.
      dedupeKey: `catalog.embed:${saved.id}:${hash}`,
      payload: { productId: saved.id },
    });
  }

  return saved;
}

/** The text a product is known by for search. Price and stock are left out: they change often and are read live. */
function embeddingText(product: {
  title: string;
  description: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
}): string {
  return [
    product.title,
    product.productType,
    product.vendor ? `by ${product.vendor}` : null,
    product.tags.length ? `Tags: ${product.tags.join(", ")}` : null,
    product.description,
  ]
    .filter(Boolean)
    .join("\n");
}

function embeddingHash(product: Parameters<typeof embeddingText>[0]): string {
  return createHash("sha256").update(embeddingText(product)).digest("hex").slice(0, 32);
}

/**
 * Indexes one product for search. The `catalog.embed` job calls this.
 * Returns "retry" when the AI provider is busy, so the job tries again later.
 */
export async function embedProduct(businessId: string, productId: string): Promise<"done" | "gone" | "retry" | "failed"> {
  const product = await db.product.findFirst({
    where: { id: productId, businessId },
    select: { id: true, title: true, description: true, vendor: true, productType: true, tags: true, embeddedHash: true },
  });

  if (!product) return "gone";

  const hash = embeddingHash(product);

  if (product.embeddedHash === hash) return "done";

  const result = await embedText({
    text: embeddingText(product),
    purpose: "document",
    apiKey: await readGeminiApiKey(businessId),
  });

  if (!result.ok) return result.reason === "busy" ? "retry" : "failed";

  // Raw SQL: Prisma cannot write a pgvector column.
  await db.$executeRaw`
    UPDATE "products"
    SET "embedding" = ${vectorLiteral(result.values)}::vector,
        "embeddedHash" = ${hash},
        "updatedAt" = NOW()
    WHERE "id" = ${product.id} AND "businessId" = ${businessId}
  `;

  return "done";
}

export type ProductMatch = {
  id: string;
  title: string;
  description: string;
  priceMin: string | null;
  priceMax: string | null;
  currency: string | null;
  inventory: number | null;
  available: boolean;
  url: string | null;
  /** 0–1, higher is closer. */
  score: number;
};

/**
 * The products closest in meaning to what a customer asked, best first.
 *
 * Empty (never an error) when search is switched off, nothing is indexed yet
 * or the AI provider is unavailable — the agent then answers without a
 * catalogue, exactly as it did before this existed.
 */
export async function searchProducts(
  businessId: string,
  query: string,
  options: { limit?: number; apiKey?: string | null; minScore?: number } = {},
): Promise<ProductMatch[]> {
  if (!isFeatureEnabled("catalogSearch") || !query.trim()) return [];

  const embedded = await embedText({
    text: query,
    purpose: "query",
    apiKey: options.apiKey ?? (await readGeminiApiKey(businessId)),
  });

  if (!embedded.ok) return [];

  const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
  const vector = vectorLiteral(embedded.values);

  // Raw SQL: ordering by vector distance (`<=>`, cosine) is pgvector's own
  // operator, which Prisma cannot express. The hnsw index on `embedding`
  // makes this fast; the businessId condition keeps it to one account.
  const rows = await db.$queryRaw<(Omit<ProductMatch, "score"> & { distance: number })[]>`
    SELECT "id", "title", "description",
           "priceMin"::text AS "priceMin", "priceMax"::text AS "priceMax",
           "currency", "inventory", "available", "url",
           ("embedding" <=> ${vector}::vector) AS "distance"
    FROM "products"
    WHERE "businessId" = ${businessId} AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${vector}::vector
    LIMIT ${limit}
  `;

  const minScore = options.minScore ?? 0.3;

  return rows
    .map(({ distance, ...row }) => ({ ...row, score: 1 - Number(distance) }))
    .filter((row) => row.score >= minScore);
}

/** How many products a business has, and how many are indexed for search. */
export async function catalogStatus(businessId: string) {
  // Raw SQL only for the second count: Prisma can't filter on the vector column.
  const [total, indexed] = await Promise.all([
    db.product.count({ where: { businessId } }),
    db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS "count" FROM "products"
      WHERE "businessId" = ${businessId} AND "embedding" IS NOT NULL
    `,
  ]);

  return { total, indexed: Number(indexed[0]?.count ?? 0) };
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

/** Product descriptions come as HTML; the agent and the embedding want words. */
function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
