export default function DeepRunLogo({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Left semifinal bracket */}
      <path
        d="M2 7h6v10H2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Left winner to championship */}
      <line x1="8" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="2" />
      {/* Right semifinal bracket */}
      <path
        d="M22 7h-6v10h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right winner to championship */}
      <line x1="16" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="2" />
      {/* Championship center */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
