"use client";

import { useEffect, useState } from "react";

interface TocSection {
  id: string;
  label: string;
  children?: { id: string; label: string }[];
}

export function TOC({ sections }: { sections: TocSection[] }) {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const ids = sections.flatMap((s) => [s.id, ...(s.children?.map((c) => c.id) ?? [])]);
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry most visible (or first intersecting)
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: [0, 0.5, 1] }
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="Table des matières"
      className="docs-toc"
      style={{
        position: "sticky",
        top: "80px",
        maxHeight: "calc(100vh - 120px)",
        overflowY: "auto",
        paddingRight: "12px",
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.64rem",
          fontWeight: 700,
          color: "var(--gold)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: "10px",
          paddingLeft: "8px",
        }}
      >
        Sommaire
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.82rem" }}>
        {sections.map((s) => (
          <li key={s.id} style={{ marginBottom: "4px" }}>
            <a
              href={`#${s.id}`}
              style={{
                display: "block",
                padding: "5px 10px",
                color: active === s.id ? "var(--tx-1)" : "var(--tx-3)",
                background: active === s.id ? "var(--gold-bg)" : "transparent",
                borderLeft: `2px solid ${active === s.id ? "var(--gold)" : "transparent"}`,
                textDecoration: "none",
                fontWeight: 600,
                letterSpacing: "-0.005em",
                transition: "all 0.15s ease",
              }}
            >
              {s.label}
            </a>
            {s.children && (
              <ul style={{ listStyle: "none", padding: 0, margin: "2px 0 0 0" }}>
                {s.children.map((c) => (
                  <li key={c.id}>
                    <a
                      href={`#${c.id}`}
                      style={{
                        display: "block",
                        padding: "3px 10px 3px 22px",
                        fontSize: "0.78rem",
                        color: active === c.id ? "var(--gold)" : "var(--tx-4)",
                        background: active === c.id ? "var(--bg-raised)" : "transparent",
                        borderLeft: `2px solid ${active === c.id ? "var(--gold)" : "transparent"}`,
                        textDecoration: "none",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: active === c.id ? 700 : 500,
                      }}
                    >
                      {c.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
