export default function Loading() {
  return (
    <div className="content-wrapper">
      <div style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
        <div style={{ height: "40px", width: "180px", borderRadius: "8px", background: "var(--bg-raised)", marginBottom: "24px" }} />
        <div style={{ height: "44px", borderRadius: "10px", background: "var(--bg-raised)", marginBottom: "16px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ height: "130px", borderRadius: "14px", background: "var(--bg-raised)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
