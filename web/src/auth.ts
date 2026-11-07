// Google or email sign-in through NEAR Auth.
//
// A login gives the player a NEAR key held by NEAR's MPC network, so no seed
// phrase ever exists. That key owns the player's account. Day-to-day moves use a
// limited key on this device, so play never shows a popup.
//
// The login uses a full-page redirect, which pop-up blockers can't stop.
//
// NEAR Auth's shared testnet login only accepts http://localhost:3000. A hosted
// site needs its own client id in VITE_FW_AUTH_CLIENT_ID.

const SHARED_TESTNET_CLIENT = "np8paqIpMWmNbzT4xAvOOapZBjsOpptl";
const NODE_URL = "https://rpc.testnet.near.org";
const PENDING = "fw-login-house";
const clientId: string | undefined = import.meta.env.VITE_FW_AUTH_CLIENT_ID;

export function loginAvailable(): boolean {
  return Boolean(clientId) || window.location.origin === "http://localhost:3000";
}

async function open() {
  // These libraries expect two Node globals, and only load if the player signs in.
  const { Buffer } = await import("buffer");
  const shim = globalThis as { Buffer?: unknown; global?: unknown };
  shim.Buffer ??= Buffer;
  shim.global ??= globalThis;
  const [{ FastAuthClient }, { JavascriptProvider }, { connect }] = await Promise.all([
    import("@fast-auth-near/browser-sdk"),
    import("@fast-auth-near/javascript-provider"),
    import("near-api-js"),
  ]);
  const provider = new JavascriptProvider({
    network: "testnet",
    clientId: clientId ?? SHARED_TESTNET_CLIENT,
  });
  const { connection } = await connect({ networkId: "testnet", nodeUrl: NODE_URL });
  const client = new FastAuthClient(provider, connection, {
    fastAuthContractId: "fast-auth.testnet",
    mpcContractId: "v1.signer-prod.testnet",
  });
  return { client, provider };
}

/** Sends the player to the login page. They come back through `finishSignIn`. */
export async function beginSignIn(houseName: string) {
  sessionStorage.setItem(PENDING, houseName);
  const { client } = await open();
  await client.login({ redirectUri: window.location.origin });
}

export function returningFromSignIn(): boolean {
  const query = new URLSearchParams(window.location.search);
  return query.has("code") && query.has("state") && sessionStorage.getItem(PENDING) !== null;
}

/** Completes the login and returns the house name and the player's NEAR key. */
export async function finishSignIn(): Promise<{ name: string; identity: string }> {
  const { client, provider } = await open();
  const loggedIn = await provider.isLoggedIn();
  window.history.replaceState(null, "", window.location.pathname);
  if (!loggedIn) throw new Error("The sign-in did not finish. Please try again.");
  const signer = await client.getSigner();
  const key = await signer.getPublicKey();
  const name = sessionStorage.getItem(PENDING) ?? "New House";
  sessionStorage.removeItem(PENDING);
  return { name, identity: key.toString() };
}
