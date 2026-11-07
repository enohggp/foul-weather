// A preview of paying from any chain through NEAR Intents. Quotes are live, but
// this is `dry: true` only: nothing here can move money.

import { useEffect, useState } from "react";

const USDC_ON_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const PRICE_USDC = 2;

const SOURCES = [
  { label: "SOL on Solana", asset: "nep141:sol.omft.near", symbol: "SOL" },
  { label: "ETH on Base", asset: "nep141:base.omft.near", symbol: "ETH" },
  { label: "USDC on Arbitrum", asset: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", symbol: "USDC" },
  { label: "DOGE", asset: "nep141:doge.omft.near", symbol: "DOGE" },
  { label: "NEAR", asset: "nep141:wrap.near", symbol: "NEAR" },
];

export default function PayPreview() {
  const [source, setSource] = useState(0);
  const [amount, setAmount] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAmount(null);
    setFailed(false);
    const body = {
      dry: true,
      swapType: "EXACT_OUTPUT",
      slippageTolerance: 100,
      originAsset: SOURCES[source].asset,
      depositType: "INTENTS",
      destinationAsset: USDC_ON_NEAR,
      amount: String(PRICE_USDC * 1_000_000),
      refundTo: "example.near",
      refundType: "INTENTS",
      recipient: "example.near",
      recipientType: "INTENTS",
      deadline: new Date(Date.now() + 600_000).toISOString(),
    };
    fetch("https://1click.chaindefuser.com/v0/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no quote"))))
      .then((j: { quote?: { amountInFormatted?: string } }) => {
        if (!cancelled) setAmount(j.quote?.amountInFormatted ?? null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <>
      <h3>
        Pay from any chain <small>preview</small>
      </h3>
      <p className="small">
        A house crest, priced at {PRICE_USDC} USDC, payable in any token NEAR Intents supports. It would be purely
        cosmetic. These are live quotes, and no money can move here.
      </p>
      <label className="label">
        Pay with
        <select className="select" value={source} onChange={(e) => setSource(Number(e.target.value))}>
          {SOURCES.map((s, i) => (
            <option key={s.asset} value={i}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <p className="quote-line">
        {failed
          ? "No quote right now."
          : amount
            ? `${amount} ${SOURCES[source].symbol}`
            : "Asking the solvers…"}
      </p>
    </>
  );
}
