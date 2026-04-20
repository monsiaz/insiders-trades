export default function Loading() {
  return (
    <div className="content-wrapper">
      <div style={{ animation: "pulse 1.5s ease-in-out infinite", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ height: "18px", width: "80px", borderRadius: "5px", background: "var(--bg-raised)" }} />
        <div style={{ height: "100px", borderRadius: "16px", background: "var(--bg-raised)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          {[1,2,3,4].map(i => <div key={i} style={{ height: "80px", borderRadius: "12px", background: "var(--bg-raised)" }} />)}
        </div>
        <div style={{ height: "320px", borderRadius: "16px", background: "var(--bg-raised)" }} />
        <div style={{ height: "180px", borderRadius: "14px", background: "var(--bg-raised)" }} />
        {[1,2,3,4,5].map(i => <div key={i} style={{ height: "72px", borderRadius: "12px", background: "var(--bg-raised)" }} />)}
      </div>
    </div>
  );
}
