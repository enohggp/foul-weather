// Pip the parrot, who explains everything one small step at a time.

import type { Mood } from "./art";
import { Pip } from "./art";

export interface Say {
  id: string;
  text: string;
  mood?: Mood;
  /** Sticks until answered, and shows these buttons. */
  actions?: { label: string; kind?: "yes" | "no"; run: () => void }[];
  next?: string;
}

export function Helper({ say, onNext }: { say: Say | null; onNext: () => void }) {
  return (
    <aside className={`helper${say ? " talking" : ""}`} aria-live="polite">
      {say && (
        <div className="helper-bubble" key={say.id}>
          <p>{say.text}</p>
          {say.actions ? (
            <div className="helper-actions">
              {say.actions.map((a) => (
                <button key={a.label} className={a.kind === "no" ? "helper-no" : "helper-yes"} onClick={a.run}>
                  {a.label}
                </button>
              ))}
            </div>
          ) : (
            say.next && (
              <div className="helper-actions">
                <button className="helper-yes" onClick={onNext}>
                  {say.next}
                </button>
              </div>
            )
          )}
        </div>
      )}
      <Pip size={104} mood={say?.mood ?? "happy"} />
    </aside>
  );
}
