// Share a moment from the game on near.social, from the player's own NEAR account.

import { useEffect, useState } from "react";
import { connectedSocial, connectSocial, forgetSocial, postToSocial, type SocialProfile } from "../social";

const MAX = 500;

export default function Share({ message, onClose }: { message: string; onClose: () => void }) {
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [text, setText] = useState(message);
  const [busy, setBusy] = useState<string | null>("Looking for your near.social account…");
  const [posted, setPosted] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void connectedSocial().then((found) => {
      if (!live) return;
      setProfile(found);
      setBusy(null);
    });
    return () => {
      live = false;
    };
  }, []);

  const connect = async () => {
    setProblem(null);
    setBusy("Opening your wallet…");
    try {
      setProfile(await connectSocial());
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : "The wallet didn't connect. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const post = async () => {
    setProblem(null);
    setBusy("Posting… your wallet will ask you to approve it.");
    try {
      setPosted(await postToSocial(text.trim()));
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : "The post didn't go through. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const switchAccount = async () => {
    await forgetSocial();
    setProfile(null);
    setPosted(null);
    void connect();
  };

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Share on near.social">
      <div className="modal social-modal">
        <h2>Share on near.social</h2>
        <p className="lede">near.social is a social network on NEAR. Post this from your own NEAR account, and friends can find the game.</p>
        {profile ? (
          <div className="social-who">
            {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" width={44} height={44} /> : <span className="social-blank" aria-hidden="true" />}
            <span>
              <b>{profile.name ?? profile.accountId}</b>
              {profile.name && <small>{profile.accountId}</small>}
            </span>
            <button className="text-link" type="button" disabled={!!busy} onClick={() => void switchAccount()}>
              Use another account
            </button>
          </div>
        ) : (
          <button className="big-button" type="button" disabled={!!busy} onClick={() => void connect()}>
            Connect NEAR Social
          </button>
        )}
        <label className="social-text">
          Your post
          <textarea value={text} maxLength={MAX} rows={4} disabled={!!busy || !!posted} onChange={(e) => setText(e.target.value)} />
          <small>
            {text.length}/{MAX}
          </small>
        </label>
        {profile && !posted && (
          <button className="big-button" type="button" disabled={!!busy || text.trim().length < 2} onClick={() => void post()}>
            Post it
          </button>
        )}
        {posted && (
          <p className="social-done">
            Posted!{" "}
            <a href={posted} target="_blank" rel="noreferrer">
              See it on near.social
            </a>
          </p>
        )}
        {busy && <p className="working">{busy}</p>}
        {problem && <p className="problem">{problem}</p>}
        <p className="fine">
          near.social runs on NEAR mainnet, so this needs a mainnet NEAR account, and each post costs a network fee well
          under a cent. Posts are public and stay in the chain's history. Never share personal details.
        </p>
        <button className="soft-button" type="button" onClick={onClose}>
          {posted ? "Done" : "Close"}
        </button>
      </div>
    </div>
  );
}
