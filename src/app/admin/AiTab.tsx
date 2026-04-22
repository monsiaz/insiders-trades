"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  toolCalls?: Array<{ name: string; args: unknown; result: unknown; ms: number }>;
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

const MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o mini",  hint: "Rapide · recommandé" },
  { value: "gpt-4o",      label: "GPT-4o",       hint: "Précis · plus cher" },
  { value: "gpt-4.1-mini",label: "GPT-4.1 mini", hint: "Alt. rapide" },
  { value: "gpt-4.1",     label: "GPT-4.1",      hint: "Alt. précis" },
] as const;

const CANNED_PROMPTS: { label: string; prompt: string }[] = [
  { label: "Activité 24h", prompt: "Donne-moi un résumé de l'activité des 24 dernières heures : nombre de déclarations, top 3 signaux, alertes qui valent le coup d'oeil." },
  { label: "Top signaux 7j", prompt: "Liste-moi les 10 signaux les plus forts (scoreScore ≥ 65) des 7 derniers jours, triés par score. Pour chaque : société, insider, rôle, montant, % mcap, score." },
  { label: "Santé pipeline", prompt: "Audite la fraîcheur des données et l'état du backtest. Y a-t-il des déclarations pas scorées, des sociétés sans cours, des backtests manquants ?" },
  { label: "Liste users actifs", prompt: "Montre-moi les 10 utilisateurs les plus récents avec leur statut (admin / banni / alertes / positions)." },
  { label: "Config alertes", prompt: "Décris la configuration actuelle des alertes email et dis-moi si tu vois un réglage suspect." },
  { label: "Analyse société", prompt: "Analyse la société 'LVMH' : score moyen des déclarations, dernier mouvement notable, top signal historique, valorisation." },
  { label: "Bilan backtest", prompt: "Donne-moi les retours moyens globaux du backtest (T+30, T+90, T+365) pour les achats et ventes." },
  { label: "Idées d'amélioration", prompt: "En te basant sur l'état actuel de la base, propose-moi 5 améliorations opérationnelles prioritaires pour le site." },
];

const STORAGE_KEY = "admin.ai.chat.v1";

// ── Component ────────────────────────────────────────────────────────────────

export function AiTab({
  showToast,
}: {
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [model, setModel] = useState<string>("gpt-4o-mini");
  const [temperature, setTemperature] = useState(0.3);
  const [showTools, setShowTools] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.messages)) setMessages(parsed.messages);
        if (typeof parsed?.model === "string") setModel(parsed.model);
        if (typeof parsed?.temperature === "number") setTemperature(parsed.temperature);
      }
    } catch { /* ignore */ }
  }, []);

  // Persist history to localStorage (cap to last 20 messages to avoid bloat)
  useEffect(() => {
    try {
      const capped = messages.slice(-20);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ messages: capped, model, temperature })
        );
      }
    } catch { /* ignore */ }
  }, [messages, model, temperature]);

  // Auto-scroll
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (prompt: string) => {
      const text = prompt.trim();
      if (!text || sending) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        createdAt: Date.now(),
      };
      const next = [...messages, userMsg];
      setMessages(next);
      setInput("");
      setSending(true);

      try {
        const res = await fetch("/api/admin/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next.map((m) => ({ role: m.role, content: m.content })),
            model,
            temperature,
          }),
        });
        const d = await res.json();
        if (!res.ok) {
          showToast(`IA : ${d.error ?? `HTTP ${res.status}`}`, false);
          setMessages([
            ...next,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `⚠️ Erreur : ${d.error ?? `HTTP ${res.status}`}`,
              createdAt: Date.now(),
            },
          ]);
          return;
        }
        setMessages([
          ...next,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: d.reply ?? "",
            createdAt: Date.now(),
            toolCalls: d.toolCalls,
            model: d.model,
            usage: d.usage,
          },
        ]);
      } catch (e) {
        showToast(`Erreur réseau : ${String(e)}`, false);
      } finally {
        setSending(false);
      }
    },
    [messages, model, temperature, sending, showToast]
  );

  const clear = useCallback(() => {
    if (!confirm("Effacer l'historique du chat ?")) return;
    setMessages([]);
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const totalTokens = useMemo(
    () => messages.reduce((s, m) => s + (m.usage?.total_tokens ?? 0), 0),
    [messages]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Info header */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-med)",
          borderLeft: "3px solid var(--gold)",
          padding: "12px 16px",
          borderRadius: "4px",
          fontSize: "0.82rem",
          color: "var(--tx-2)",
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: "var(--tx-1)" }}>Sigma Copilote.</strong>{" "}
        Un assistant IA qui peut interroger la base Postgres (lecture seule) pour
        t&apos;aider à diagnostiquer, résumer et proposer des actions.
        Les outils disponibles incluent : stats globales, top signaux, users, sociétés,
        config alertes, bilan backtest.
      </div>

      {/* Controls row */}
      <div
        className="card"
        style={{
          padding: "12px 16px",
          display: "flex",
          gap: "14px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "0.74rem", color: "var(--tx-3)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Modèle
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ padding: "6px 10px", fontSize: "0.82rem", borderRadius: "4px" }}
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label} · {m.hint}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "0.74rem", color: "var(--tx-3)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Créativité
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            style={{ width: "110px" }}
          />
          <span style={{ fontSize: "0.76rem", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", minWidth: "36px" }}>
            {temperature.toFixed(2)}
          </span>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace" }}>
            {messages.length} msg · {totalTokens.toLocaleString("fr-FR")} tokens
          </span>
          <button
            onClick={() => setShowTools((v) => !v)}
            style={{
              padding: "6px 10px",
              fontSize: "0.76rem",
              fontWeight: 600,
              borderRadius: "4px",
              border: "1px solid var(--border-strong)",
              background: showTools ? "var(--gold-bg)" : "var(--bg-raised)",
              color: showTools ? "var(--gold)" : "var(--tx-2)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {showTools ? "Masquer outils" : "Afficher outils"}
          </button>
          <button
            onClick={clear}
            disabled={messages.length === 0}
            style={{
              padding: "6px 10px",
              fontSize: "0.76rem",
              fontWeight: 600,
              borderRadius: "4px",
              border: "1px solid var(--border-strong)",
              background: "var(--bg-raised)",
              color: "var(--tx-3)",
              cursor: messages.length === 0 ? "default" : "pointer",
              opacity: messages.length === 0 ? 0.5 : 1,
              whiteSpace: "nowrap",
            }}
          >
            Effacer
          </button>
        </div>
      </div>

      {/* Canned prompts */}
      {messages.length === 0 && (
        <div
          className="card"
          style={{ padding: "16px 18px" }}
        >
          <div
            style={{
              fontSize: "0.74rem",
              color: "var(--tx-3)",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "10px",
            }}
          >
            Démarrer avec une question
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "8px",
            }}
          >
            {CANNED_PROMPTS.map((p) => (
              <button
                key={p.label}
                onClick={() => send(p.prompt)}
                disabled={sending}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  fontSize: "0.8rem",
                  border: "1px solid var(--border-med)",
                  borderLeft: "3px solid var(--gold)",
                  background: "var(--bg-raised)",
                  color: "var(--tx-2)",
                  borderRadius: "3px",
                  cursor: sending ? "progress" : "pointer",
                  lineHeight: 1.4,
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--tx-1)", fontSize: "0.84rem", marginBottom: "2px" }}>
                  {p.label}
                </div>
                <div style={{ fontSize: "0.74rem", color: "var(--tx-3)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {p.prompt}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat list */}
      {messages.length > 0 && (
        <div
          ref={listRef}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-med)",
            borderRadius: "4px",
            padding: "18px",
            maxHeight: "640px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} showTools={showTools} />
          ))}
          {sending && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.82rem",
                color: "var(--tx-3)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              <TypingDots /> Sigma Copilote réfléchit…
            </div>
          )}
        </div>
      )}

      {/* Input row */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Pose une question à l'IA admin… (Entrée pour envoyer, Shift+Entrée pour saut de ligne)"
          rows={2}
          disabled={sending}
          style={{
            flex: 1,
            padding: "10px 14px",
            fontSize: "0.88rem",
            borderRadius: "4px",
            border: "1px solid var(--border-strong)",
            background: "var(--bg-raised)",
            color: "var(--tx-1)",
            resize: "vertical",
            fontFamily: "var(--font-inter), 'Inter', system-ui, sans-serif",
            lineHeight: 1.5,
          }}
        />
        <button
          type="submit"
          disabled={sending || input.trim().length === 0}
          style={{
            padding: "10px 20px",
            fontSize: "0.85rem",
            fontWeight: 700,
            background: "var(--corporate)",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: sending ? "progress" : "pointer",
            opacity: sending || input.trim().length === 0 ? 0.5 : 1,
            whiteSpace: "nowrap",
            alignSelf: "stretch",
          }}
        >
          {sending ? "…" : "Envoyer →"}
        </button>
      </form>
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, showTools }: { msg: ChatMessage; showTools: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        gap: "4px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "0.68rem",
          color: "var(--tx-3)",
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color: isUser ? "var(--c-indigo-2)" : "var(--gold)",
          }}
        >
          {isUser ? "VOUS" : "SIGMA COPILOTE"}
        </span>
        {msg.model && <span>· {msg.model}</span>}
        {msg.usage && <span>· {msg.usage.total_tokens} tokens</span>}
      </div>
      <div
        style={{
          maxWidth: "95%",
          padding: "12px 16px",
          borderRadius: "4px",
          background: isUser ? "var(--corporate-bg)" : "var(--bg-raised)",
          border: "1px solid",
          borderColor: isUser ? "var(--corporate-bd)" : "var(--border-med)",
          color: "var(--tx-1)",
          fontSize: "0.88rem",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {renderMarkdown(msg.content)}
      </div>
      {showTools && msg.toolCalls && msg.toolCalls.length > 0 && (
        <details
          style={{
            marginTop: "2px",
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            borderLeft: "3px solid var(--gold)",
            borderRadius: "3px",
            padding: "8px 12px",
            fontSize: "0.76rem",
            color: "var(--tx-2)",
            maxWidth: "95%",
            width: "100%",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--gold)",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              fontSize: "0.68rem",
            }}
          >
            {msg.toolCalls.length} appel{msg.toolCalls.length > 1 ? "s" : ""} outil
          </summary>
          <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {msg.toolCalls.map((tc, i) => (
              <div
                key={i}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "3px",
                  padding: "8px 10px",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.72rem",
                  color: "var(--tx-2)",
                  overflow: "auto",
                }}
              >
                <div
                  style={{
                    color: "var(--gold)",
                    fontWeight: 700,
                    marginBottom: "4px",
                  }}
                >
                  {tc.name}({JSON.stringify(tc.args)}) · {tc.ms} ms
                </div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: "220px",
                    overflowY: "auto",
                    fontSize: "0.7rem",
                    color: "var(--tx-3)",
                  }}
                >
                  {JSON.stringify(tc.result, null, 2).slice(0, 3000)}
                </pre>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Minimal markdown rendering (headings, bold, italic, lists, inline code, links) ──

function renderMarkdown(src: string): React.ReactNode {
  // Very small, safe-ish renderer for the admin assistant output.
  // We escape HTML, then apply a handful of patterns line-by-line.
  const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));

  const lines = src.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Headings
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const Tag = (`h${Math.min(3, level) + 3}`) as "h4" | "h5" | "h6";
      out.push(
        <Tag key={i} style={{ margin: "8px 0 4px", fontWeight: 700, color: "var(--tx-1)", fontSize: level === 1 ? "1.05rem" : "0.95rem" }}>
          {inline(h[2])}
        </Tag>
      );
      i++; continue;
    }
    // Bullet list
    if (/^\s*[-•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-•]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={`ul-${i}`} style={{ margin: "4px 0 6px", paddingLeft: "1.2em", listStyle: "disc" }}>
          {items.map((it, idx) => <li key={idx} style={{ marginBottom: "2px" }}>{inline(it)}</li>)}
        </ul>
      );
      continue;
    }
    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push(
        <ol key={`ol-${i}`} style={{ margin: "4px 0 6px", paddingLeft: "1.4em" }}>
          {items.map((it, idx) => <li key={idx} style={{ marginBottom: "2px" }}>{inline(it)}</li>)}
        </ol>
      );
      continue;
    }
    // Code block
    if (/^```/.test(line)) {
      const chunk: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { chunk.push(lines[i]); i++; }
      i++;
      out.push(
        <pre key={`pre-${i}`} style={{
          margin: "6px 0",
          padding: "8px 10px",
          background: "var(--bg-base)",
          border: "1px solid var(--border)",
          borderRadius: "3px",
          fontSize: "0.74rem",
          fontFamily: "'JetBrains Mono', monospace",
          overflow: "auto",
          color: "var(--tx-2)",
        }}>
          {chunk.join("\n")}
        </pre>
      );
      continue;
    }
    // Empty line
    if (line.trim() === "") { out.push(<div key={`br-${i}`} style={{ height: "4px" }} />); i++; continue; }
    // Default paragraph
    out.push(<p key={i} style={{ margin: "2px 0" }}>{inline(line)}</p>);
    i++;
  }

  function inline(text: string): React.ReactNode {
    // Escape first
    let s = escape(text);
    // Inline code
    s = s.replace(/`([^`]+)`/g, '<code style="background:var(--bg-base);padding:1px 5px;border-radius:2px;font-family:\'JetBrains Mono\',monospace;font-size:0.82em;color:var(--gold)">$1</code>');
    // Bold + italic
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(?!\s)([^*]+?)\*/g, '<em>$1</em>');
    // Links [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--gold);text-decoration:underline">$1</a>');
    return <span dangerouslySetInnerHTML={{ __html: s }} />;
  }

  return <>{out}</>;
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: "3px" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: "var(--gold)",
            animation: `ai-dot 1.2s infinite ease-in-out ${i * 0.15}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes ai-dot {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40%           { opacity: 1;   transform: translateY(-3px); }
        }
      `}</style>
    </span>
  );
}
