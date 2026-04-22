"use client";

import { useState } from "react";
import { CodeBlock } from "../../_components/CodeBlock";

interface ClientTab {
  id: string;
  label: string;
  badge: string; // compat badge label
  intro: string;
  steps: { title: string; body: React.ReactNode }[];
  config?: { filename: string; code: string };
}

export function ClientTabs({ tabs }: { tabs: ClientTab[] }) {
  const [active, setActive] = useState(0);
  const current = tabs[active];

  return (
    <div>
      {/* Tab bar */}
      <div
        role="tablist"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
          borderBottom: "1px solid var(--border-med)",
          marginBottom: "20px",
        }}
      >
        {tabs.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            style={{
              padding: "10px 16px",
              fontSize: "0.85rem",
              fontWeight: 600,
              letterSpacing: "-0.005em",
              background: "transparent",
              color: active === i ? "var(--tx-1)" : "var(--tx-3)",
              border: "none",
              borderBottom: `2px solid ${active === i ? "var(--gold)" : "transparent"}`,
              marginBottom: "-1px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Active panel */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "10px",
            marginBottom: "10px",
            flexWrap: "wrap",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-dm-serif), Georgia, serif",
              fontSize: "1.4rem",
              fontWeight: 400,
              color: "var(--tx-1)",
              letterSpacing: "-0.01em",
            }}
          >
            {current.label}
          </h3>
          <span
            style={{
              display: "inline-block",
              padding: "3px 8px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.66rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--c-emerald)",
              background: "var(--c-emerald-bg)",
              border: "1px solid var(--c-emerald-bd)",
              borderRadius: "2px",
            }}
          >
            {current.badge}
          </span>
        </div>
        <p style={{ fontSize: "0.92rem", color: "var(--tx-2)", lineHeight: 1.6, marginBottom: "14px" }}>
          {current.intro}
        </p>

        <ol
          style={{
            listStyle: "none",
            counterReset: "step",
            padding: 0,
            margin: 0,
          }}
        >
          {current.steps.map((step, idx) => (
            <li
              key={idx}
              style={{
                counterIncrement: "step",
                position: "relative",
                paddingLeft: "44px",
                marginBottom: "18px",
              }}
            >
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  background: "var(--corporate)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                }}
              >
                {idx + 1}
              </span>
              <div
                style={{
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  color: "var(--tx-1)",
                  letterSpacing: "-0.005em",
                  marginBottom: "4px",
                  paddingTop: "4px",
                }}
              >
                {step.title}
              </div>
              <div style={{ fontSize: "0.88rem", color: "var(--tx-2)", lineHeight: 1.65 }}>
                {step.body}
              </div>
            </li>
          ))}
        </ol>

        {current.config && (
          <div style={{ marginTop: "14px" }}>
            <CodeBlock
              filename={current.config.filename}
              language="json"
              code={current.config.code}
            />
          </div>
        )}
      </div>
    </div>
  );
}
