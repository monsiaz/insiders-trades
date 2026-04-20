// Global loading skeleton — shown during page transitions
export default function Loading() {
  return (
    <div className="content-wrapper">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", animation: "pulse 1.5s ease-in-out infinite" }}>
        <div style={{ height: "48px", width: "240px", borderRadius: "10px", background: "var(--bg-raised)" }} />
        <div style={{ height: "20px", width: "160px", borderRadius: "6px", background: "var(--bg-raised)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginTop: "8px" }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ height: "90px", borderRadius: "14px", background: "var(--bg-raised)" }} />
          ))}
        </div>
        <div style={{ height: "260px", borderRadius: "16px", background: "var(--bg-raised)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{ height: "130px", borderRadius: "14px", background: "var(--bg-raised)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
