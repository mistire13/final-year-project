// The server must revalidate stock when a real order is placed.
export function clampQuantity(
  quantity: number,
  stock?: number,
  available = true,
) {
  if (!available || !Number.isFinite(quantity)) return 0;
  const limit =
    stock === undefined
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, Math.floor(stock));
  return Math.min(limit, Math.max(0, Math.floor(quantity)));
}
