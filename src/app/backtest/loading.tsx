export default function Loading() {
  return (
    <div className="content-wrapper">
      <div style={{ animation: "pulse 1.5s ease-in-out infinite", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ height: "40px", width: "220px", borderRadius: "8px", background: "var(--bg-raised)" }} />
        <div style={{ height: "20px", width: "340px", borderRadius: "6px", background: "var(--bg-raised)" }} />
        <div style={{ height: "60px", borderRadius: "12px", background: "var(--bg-raised)", marginTop: "8px" }} />
        <div style={{ height: "280px", borderRadius: "14px", background: "var(--bg-raised)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          {[1,2,3,4,5,6].map(i => <div key={i} style={{ height: "120px", borderRadius: "12px", background: "var(--bg-raised)" }} />)}
        </div>
      </div>
    </div>
  );
}
