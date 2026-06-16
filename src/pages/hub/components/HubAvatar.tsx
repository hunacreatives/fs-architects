import React from 'react';

const POSITION_OVERRIDES: Record<string, string> = {
  'Francis Yu': 'center 2%',
};

const SCALE_OVERRIDES: Record<string, number> = {
  'Francis Yu': 1.8,
  'Neil Atupan': 2.1,
};

interface HubAvatarProps {
  avatarUrl?: string | null;
  fullName: string;
  size?: string;
  className?: string;
}

export default function HubAvatar({ avatarUrl, fullName, size = 'w-8 h-8', className = '' }: HubAvatarProps) {
  const objectPosition = POSITION_OVERRIDES[fullName] ?? 'center top';
  const scale = SCALE_OVERRIDES[fullName] ?? 1;

  if (avatarUrl) {
    return (
      <div className={`${size} rounded-full overflow-hidden flex-shrink-0 ${className}`}>
        <img
          src={avatarUrl}
          alt={fullName}
          className="w-full h-full object-cover"
          style={{ objectPosition, transform: `scale(${scale})`, transformOrigin: 'center' }}
        />
      </div>
    );
  }

  return (
    <div className={`${size} rounded-full bg-[#1c2b3a] flex items-center justify-center flex-shrink-0 ${className}`}>
      <span className="text-white text-sm font-bold">{fullName.charAt(0).toUpperCase()}</span>
    </div>
  );
}
