export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo-mark">
      <defs>
        <linearGradient id="ki-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-blue)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="15" fill="var(--logo-bg)" stroke="var(--line-strong)" />
      <path
        d="M21 15v34M45 15L25 32l20 17"
        stroke="url(#ki-logo)"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="45" cy="15" r="4.5" fill="var(--accent)" />
      <circle cx="45" cy="49" r="4.5" fill="var(--accent-blue)" />
    </svg>
  );
}
