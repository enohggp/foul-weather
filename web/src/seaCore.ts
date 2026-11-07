// Turns live NEAR Intents price checks into sea conditions. `dry: true` means a
// quote only: nothing is signed, no money moves, and no key is needed.
// The page and the keeper script both use this file.

const QUOTE_URL = "https://1click.chaindefuser.com/v0/quote";
const WNEAR = "nep141:wrap.near";
/** 500 NEAR: large enough to feel a route's depth. It is only ever a quote. */
const SAMPLE = (500n * 10n ** 24n).toString();

export const ROUTES = [
  { lane: "The Salt Road", route: "NEAR to USDC, on NEAR", asset: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1" },
  { lane: "Greywater Run", route: "NEAR to USDC, on Arbitrum", asset: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near" },
  { lane: "Cinder Passage", route: "NEAR to SOL", asset: "nep141:sol.omft.near" },
  { lane: "Lantern Deeps", route: "NEAR to DOGE", asset: "nep141:doge.omft.near" },
  { lane: "The Aurum Cape", route: "NEAR to Bitcoin", asset: "nep141:nbtc.bridge.near" },
] as const;

export interface Reading {
  lane: string;
  route: string;
  sea: number;
  spreadBps: number;
  moveBps: number;
  seconds: number;
}

interface Quote {
  quote?: { amountOut?: string; amountInUsd?: string; amountOutUsd?: string; timeEstimate?: number };
}

async function priceCheck(asset: string, fetcher: typeof fetch): Promise<Quote["quote"] | null> {
  const body = {
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: WNEAR,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: asset,
    amount: SAMPLE,
    refundTo: "example.near",
    refundType: "ORIGIN_CHAIN",
    recipient: "example.near",
    recipientType: "INTENTS",
    deadline: new Date(Date.now() + 600_000).toISOString(),
  };
  const response = await fetcher(QUOTE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  return ((await response.json()) as Quote).quote ?? null;
}

/**
 * The mapping from markets to water.
 * Choppy prices and thin routes make rough seas: 28 is an ordinary day, each
 * basis point of spread adds 1.2, and each basis point of recent price move
 * adds 3. A route that cannot be quoted at all counts as a gale. Storms stay
 * the engine's job, so readings stop short of tempest.
 */
export function seaFrom(spreadBps: number, moveBps: number): number {
  return Math.round(Math.min(78, Math.max(8, 28 + spreadBps * 1.2 + moveBps * 3)));
}

export class SeaWatch {
  private lastOut = new Map<string, number>();
  private moves = new Map<string, number>();

  async read(fetcher: typeof fetch = fetch.bind(globalThis)): Promise<Reading[] | null> {
    const results = await Promise.allSettled(ROUTES.map((r) => priceCheck(r.asset, fetcher)));
    if (results.every((r) => r.status === "rejected")) return null;
    return ROUTES.map((route, i) => {
      const result = results[i];
      const quote = result.status === "fulfilled" ? result.value : null;
      if (!quote?.amountOut) {
        return { lane: route.lane, route: route.route, sea: 70, spreadBps: 0, moveBps: 0, seconds: 0 };
      }
      const out = Number(quote.amountOut);
      const inUsd = Number(quote.amountInUsd);
      const outUsd = Number(quote.amountOutUsd);
      const spreadBps = inUsd > 0 ? Math.max(0, (1 - outUsd / inUsd) * 10_000) : 0;
      const previous = this.lastOut.get(route.asset);
      const jump = previous ? Math.abs(out / previous - 1) * 10_000 : 0;
      const move = (this.moves.get(route.asset) ?? jump) * 0.6 + jump * 0.4;
      this.lastOut.set(route.asset, out);
      this.moves.set(route.asset, move);
      return {
        lane: route.lane,
        route: route.route,
        sea: seaFrom(spreadBps, move),
        spreadBps,
        moveBps: move,
        seconds: quote.timeEstimate ?? 0,
      };
    });
  }
}
