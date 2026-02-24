export default function DeepRunLogo({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Left flame */}
      <path
        d="M5.5 11C5.5 8 6.5 5.5 8 3.5c.5 1.5 1.2 2.5 2.2 2 1-.5.3-2.5-.2-3.5C11.5 4 12 7 12 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right flame */}
      <path
        d="M18.5 11c0-3-1-5.5-2.5-7.5-.5 1.5-1.2 2.5-2.2 2-1-.5-.3-2.5.2-3.5C12.5 4 12 7 12 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Rim */}
      <line
        x1="5"
        y1="11.5"
        x2="19"
        y2="11.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Net - outer shape */}
      <path
        d="M7 11.5L12 21l5-9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Net - inner lines */}
      <path
        d="M9 11.5l3 6M15 11.5l-3 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Net - cross threads */}
      <line x1="8" y1="14.5" x2="16" y2="14.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1="9.5" y1="17.5" x2="14.5" y2="17.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
