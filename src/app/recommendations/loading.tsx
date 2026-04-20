export default function Loading() {
  return (
    <div className="content-wrapper">
      <div style={{ animation: "pulse 1.5s ease-in-out infinite", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ height: "40px", width: "240px", borderRadius: "8px", background: "var(--bg-raised)", marginBottom: "8px" }} />
        <div style={{ height: "52px", borderRadius: "10px", background: "var(--bg-raised)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "14px", marginTop: "8px" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: "200px", borderRadius: "14px", background: "var(--bg-raised)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
