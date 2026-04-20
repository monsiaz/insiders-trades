export default function Loading() {
  return (
    <div className="content-wrapper">
      <div style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
        <div style={{ height: "40px", width: "160px", borderRadius: "8px", background: "var(--bg-raised)", marginBottom: "24px" }} />
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} style={{ height: "58px", borderRadius: "10px", background: "var(--bg-raised)", marginBottom: "8px" }} />
        ))}
      </div>
    </div>
  );
}
