export default function Loading() {
  return (
    <div className="content-wrapper">
      <div style={{ animation: "pulse 1.5s ease-in-out infinite", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ height: "40px", width: "260px", borderRadius: "8px", background: "var(--bg-raised)" }} />
        <div style={{ height: "20px", width: "380px", borderRadius: "6px", background: "var(--bg-raised)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginTop: "8px" }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: "100px", borderRadius: "12px", background: "var(--bg-raised)" }} />
          ))}
        </div>
        <div style={{ height: "320px", borderRadius: "14px", background: "var(--bg-raised)", marginTop: "8px" }} />
        <div style={{ height: "260px", borderRadius: "14px", background: "var(--bg-raised)" }} />
      </div>
    </div>
  );
}
