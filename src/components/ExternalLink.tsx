import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState, type ReactNode } from "react";

type ExternalLinkProps = {
  children: ReactNode;
  href: string;
};

export default function ExternalLink({ children, href }: ExternalLinkProps) {
  const [error, setError] = useState("");

  const openLink = async () => {
    setError("");
    try {
      await openUrl(href);
    } catch {
      setError("RecallFlow could not open this link in your browser.");
    }
  };

  return (
    <>
      <a
        href={href}
        onClick={(event) => {
          if (!isTauri()) return;
          event.preventDefault();
          void openLink();
        }}
        rel="noopener noreferrer"
        target="_blank"
      >
        {children}
      </a>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
