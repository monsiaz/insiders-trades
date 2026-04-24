export default function InsiderTradesSigmaLogo({
  bg = "transparent",
  stroke = "#0B5CFF",
  pulse = "#14D9E6",
  size = 40,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="InsiderTrades Sigma logo"
    >
      <rect width="512" height="512" rx="96" fill={bg} />
      <path
        d="M286 96H160C130 96 115 132 136 154L239 264L138 378C118 401 134 436 164 436H302"
        stroke={stroke}
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M286 264H326L350 374L386 190L412 300H454"
        stroke={pulse}
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
