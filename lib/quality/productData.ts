import type { Product } from "../config/types";

export interface ProductPriceWarning {
  index: number;
  product: Product;
  price: number;
  median: number;
  message: string;
}

function parsePrice(value: unknown): number {
  const parsed = parseFloat(String(value || "0").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function analyzeProductPriceOutliers(
  products: Product[],
  options: { floor?: number; outlierRatio?: number } = {}
): ProductPriceWarning[] {
  if (!products || products.length < 2) return [];

  const prices = products.map((p) => parsePrice(p.price)).filter((n) => n > 0);
  if (prices.length < 2) return [];

  const floor = options.floor ?? 3;
  const outlierRatio = options.outlierRatio ?? 0.25;
  const mid = median(prices);

  return products.flatMap((product, index) => {
    const price = parsePrice(product.price);
    if (price <= 0 || (price >= floor && price >= mid * outlierRatio)) return [];
    return [{
      index,
      product,
      price,
      median: mid,
      message: `${product.name} price 💲${product.price} looks implausible vs. median 💲${mid.toFixed(2)} — confirm source data before sending`,
    }];
  });
}
