"use client";

import { useState } from "react";

export function CodeBlock({
  code,
  language = "shell",
  filename,
}: {
  code: string;
  language?: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div
      style={{
        background: "var(--bg-base)",
        border: "1px solid var(--border-med)",
        borderRadius: "3px",
        overflow: "hidden",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.78rem",
        position: "relative",
      }}
    >
      {/* Chrome header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: "var(--bg-raised)",
          borderBottom: "1px solid var(--border)",
          fontSize: "0.68rem",
          color: "var(--tx-3)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        <span>{filename ?? language}</span>
        <button
          onClick={copy}
          style={{
            padding: "3px 9px",
            background: copied ? "var(--gold-bg)" : "transparent",
            border: `1px solid ${copied ? "var(--gold-bd)" : "var(--border-strong)"}`,
            color: copied ? "var(--gold)" : "var(--tx-2)",
            borderRadius: "2px",
            fontSize: "0.64rem",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
            transition: "all 0.15s ease",
          }}
        >
          {copied ? "✓ copié" : "copier"}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "12px 14px",
          color: "var(--tx-2)",
          overflow: "auto",
          lineHeight: 1.7,
          maxHeight: "420px",
        }}
      >
        {code}
      </pre>
    </div>
  );
}

/**
 * CodeTabs — shows the same operation in multiple languages (cURL / JS / Python).
 */
export function CodeTabs({
  tabs,
}: {
  tabs: { label: string; language: string; code: string }[];
}) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(tabs[active].code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div
      style={{
        background: "var(--bg-base)",
        border: "1px solid var(--border-med)",
        borderRadius: "3px",
        overflow: "hidden",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.78rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--bg-raised)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex" }}>
          {tabs.map((t, i) => (
            <button
              key={t.label}
              onClick={() => setActive(i)}
              style={{
                padding: "7px 14px",
                fontSize: "0.68rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                background: active === i ? "var(--bg-base)" : "transparent",
                color: active === i ? "var(--gold)" : "var(--tx-3)",
                border: "none",
                borderRight: "1px solid var(--border)",
                borderBottom: active === i ? "1px solid transparent" : "none",
                marginBottom: active === i ? "-1px" : 0,
                cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
                transition: "color 0.15s ease, background 0.15s ease",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={copy}
          style={{
            padding: "3px 9px",
            margin: "0 10px",
            background: copied ? "var(--gold-bg)" : "transparent",
            border: `1px solid ${copied ? "var(--gold-bd)" : "var(--border-strong)"}`,
            color: copied ? "var(--gold)" : "var(--tx-2)",
            borderRadius: "2px",
            fontSize: "0.64rem",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {copied ? "✓ copié" : "copier"}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "12px 14px",
          color: "var(--tx-2)",
          overflow: "auto",
          lineHeight: 1.7,
          maxHeight: "480px",
        }}
      >
        {tabs[active].code}
      </pre>
    </div>
  );
}
