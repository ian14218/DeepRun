import { useState } from 'react';

export default function TeamLogo({ externalId, teamName, size = 20 }) {
  const [hidden, setHidden] = useState(false);

  if (!externalId || hidden) return null;

  return (
    <img
      src={`https://a.espncdn.com/i/teamlogos/ncaa/500/${externalId}.png`}
      alt={teamName || ''}
      width={size}
      height={size}
      className="inline-block shrink-0"
      style={{ width: size, height: size }}
      onError={() => setHidden(true)}
    />
  );
}
