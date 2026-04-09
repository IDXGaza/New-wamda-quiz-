import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

export const CartoonStar: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M24 4L30 18H44L33 27L37 42L24 33L11 42L15 27L4 18H18L24 4Z"
      fill="#F5C518" stroke="#0D0D0D" strokeWidth="3" strokeLinejoin="round"/>
  </svg>
);

export const CartoonGear: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="24" cy="24" r="11" fill="#FFF8E7" stroke="#0D0D0D" strokeWidth="4"/>
    <path d="M24 2V10M24 38V46M2 24H10M38 24H46M8 8L14 14M34 34L40 40M8 40L14 34M34 14L40 8" stroke="#0D0D0D" strokeWidth="5" strokeLinecap="round"/>
    <circle cx="24" cy="24" r="4" fill="#0D0D0D"/>
  </svg>
);

export const CartoonCheck: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="24" cy="24" r="20" fill="#2DAA4F" stroke="#0D0D0D" strokeWidth="3"/>
    <path d="M14 24L21 31L34 17" stroke="#FFF8E7" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const CartoonAlert: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M24 6L44 40H4L24 6Z" fill="#F5C518" stroke="#0D0D0D" strokeWidth="3" strokeLinejoin="round"/>
    <line x1="24" y1="18" x2="24" y2="30" stroke="#0D0D0D" strokeWidth="4" strokeLinecap="round"/>
    <circle cx="24" cy="36" r="2.5" fill="#0D0D0D"/>
  </svg>
);

export const CartoonBook: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M8 6H40V36H8V6Z" fill="#1E6FD9" stroke="#0D0D0D" strokeWidth="3"/>
    <path d="M8 36C8 36 8 42 14 42H40V36H8Z" fill="#FFF8E7" stroke="#0D0D0D" strokeWidth="3"/>
    <line x1="14" y1="12" x2="34" y2="12" stroke="#FFF8E7" strokeWidth="3" strokeLinecap="round"/>
    <line x1="14" y1="20" x2="34" y2="20" stroke="#FFF8E7" strokeWidth="3" strokeLinecap="round"/>
  </svg>
);

export const CartoonHome: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M24 4L4 20V42H16V30H32V42H44V20L24 4Z" fill="#D93025" stroke="#0D0D0D" strokeWidth="3" strokeLinejoin="round"/>
  </svg>
);

export const CartoonLock: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="10" y="20" width="28" height="22" rx="4" fill="#F5C518" stroke="#0D0D0D" strokeWidth="3"/>
    <path d="M16 20V14C16 9.58172 19.5817 6 24 6C28.4183 6 32 9.58172 32 14V20" stroke="#0D0D0D" strokeWidth="4" strokeLinecap="round"/>
    <circle cx="24" cy="31" r="3" fill="#0D0D0D"/>
  </svg>
);

export const CartoonRocket: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M24 4C24 4 14 14 14 28V40H34V28C34 14 24 4 24 4Z" fill="#D93025" stroke="#0D0D0D" strokeWidth="3"/>
    <path d="M14 32L6 40V44H14V40" fill="#F5C518" stroke="#0D0D0D" strokeWidth="3"/>
    <path d="M34 32L42 40V44H34V40" fill="#F5C518" stroke="#0D0D0D" strokeWidth="3"/>
    <circle cx="24" cy="20" r="4" fill="#5BC8F5" stroke="#0D0D0D" strokeWidth="2"/>
  </svg>
);

export const CartoonHexagon: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M24 4L41.3205 14V34L24 44L6.67949 34V14L24 4Z" fill="#1E6FD9" stroke="#0D0D0D" strokeWidth="3" strokeLinejoin="round"/>
  </svg>
);

export const CartoonGrid: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="6" y="6" width="16" height="16" rx="2" fill="#5BC8F5" stroke="#0D0D0D" strokeWidth="3"/>
    <rect x="26" y="6" width="16" height="16" rx="2" fill="#5BC8F5" stroke="#0D0D0D" strokeWidth="3"/>
    <rect x="6" y="26" width="16" height="16" rx="2" fill="#5BC8F5" stroke="#0D0D0D" strokeWidth="3"/>
    <rect x="26" y="26" width="16" height="16" rx="2" fill="#5BC8F5" stroke="#0D0D0D" strokeWidth="3"/>
  </svg>
);

export const CartoonLightning: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M30 4L10 26H22L18 44L38 22H26L30 4Z" fill="#F5C518" stroke="#0D0D0D" strokeWidth="3" strokeLinejoin="round"/>
  </svg>
);

export const CartoonTimer: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="24" cy="26" r="16" fill="#FFF8E7" stroke="#0D0D0D" strokeWidth="3"/>
    <path d="M24 10V6M20 4H28" stroke="#0D0D0D" strokeWidth="3" strokeLinecap="round"/>
    <path d="M24 26L30 20" stroke="#D93025" strokeWidth="3" strokeLinecap="round"/>
  </svg>
);

export const CartoonSilent: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M10 18V30H18L28 40V8L18 18H10Z" fill="#5BC8F5" stroke="#0D0D0D" strokeWidth="3" strokeLinejoin="round"/>
    <line x1="34" y1="18" x2="44" y2="28" stroke="#D93025" strokeWidth="4" strokeLinecap="round"/>
    <line x1="44" y1="18" x2="34" y2="28" stroke="#D93025" strokeWidth="4" strokeLinecap="round"/>
  </svg>
);

export const CartoonBot: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="10" y="14" width="28" height="24" rx="4" fill="#5BC8F5" stroke="#0D0D0D" strokeWidth="3"/>
    <circle cx="18" cy="24" r="3" fill="#0D0D0D"/>
    <circle cx="30" cy="24" r="3" fill="#0D0D0D"/>
    <path d="M18 32H30" stroke="#0D0D0D" strokeWidth="3" strokeLinecap="round"/>
    <path d="M24 14V8M20 6H28" stroke="#0D0D0D" strokeWidth="3" strokeLinecap="round"/>
  </svg>
);

export const CartoonPencil: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M36 6L42 12L16 38L6 42L10 32L36 6Z" fill="#F5C518" stroke="#0D0D0D" strokeWidth="3" strokeLinejoin="round"/>
    <line x1="32" y1="10" x2="38" y2="16" stroke="#0D0D0D" strokeWidth="3"/>
  </svg>
);

export const CartoonPlus: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="24" cy="24" r="20" fill="#2DAA4F" stroke="#0D0D0D" strokeWidth="3"/>
    <path d="M24 14V34M14 24H34" stroke="#FFF8E7" strokeWidth="5" strokeLinecap="round"/>
  </svg>
);

export const CartoonTrash: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M10 12H38V40C38 42.2091 36.2091 44 34 44H14C11.7909 44 10 42.2091 10 40V12Z" fill="#D93025" stroke="#0D0D0D" strokeWidth="3"/>
    <path d="M8 12H40" stroke="#0D0D0D" strokeWidth="4" strokeLinecap="round"/>
    <path d="M18 6H30V12H18V6Z" fill="#FFF8E7" stroke="#0D0D0D" strokeWidth="3"/>
  </svg>
);

export const CartoonShield: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M24 4L40 10V24C40 34 32 42 24 44C16 42 8 34 8 24V10L24 4Z" fill="#1E6FD9" stroke="#0D0D0D" strokeWidth="3" strokeLinejoin="round"/>
    <path d="M24 12V36M14 24H34" stroke="#FFF8E7" strokeWidth="3" strokeLinecap="round"/>
  </svg>
);

export const CartoonSnowflake: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M24 4V44M4 24H44M10 10L38 38M10 38L38 10" stroke="#5BC8F5" strokeWidth="4" strokeLinecap="round"/>
    <circle cx="24" cy="24" r="4" fill="#FFF8E7" stroke="#0D0D0D" strokeWidth="2"/>
  </svg>
);

export const CartoonRefresh: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M40 24C40 32.8366 32.8366 40 24 40C15.1634 40 8 32.8366 8 24C8 15.1634 15.1634 8 24 8V4L30 10L24 16V12C17.3726 12 12 17.3726 12 24C12 30.6274 17.3726 36 24 36C30.6274 36 36 30.6274 36 24H40Z" fill="#5BC8F5" stroke="#0D0D0D" strokeWidth="2"/>
  </svg>
);

export const CartoonX: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="24" cy="24" r="20" fill="#D93025" stroke="#0D0D0D" strokeWidth="3"/>
    <path d="M16 16L32 32M32 16L16 32" stroke="#FFF8E7" strokeWidth="5" strokeLinecap="round"/>
  </svg>
);

export const CartoonEye: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M4 24C4 24 12 10 24 10C36 10 44 24 44 24C44 24 36 38 24 38C12 38 4 24 4 24Z" fill="#FFF8E7" stroke="#0D0D0D" strokeWidth="3"/>
    <circle cx="24" cy="24" r="7" fill="#1E6FD9" stroke="#0D0D0D" strokeWidth="2"/>
    <circle cx="24" cy="24" r="3" fill="#0D0D0D"/>
  </svg>
);

export const CartoonSkip: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M10 10L30 24L10 38V10Z" fill="#F5C518" stroke="#0D0D0D" strokeWidth="3" strokeLinejoin="round"/>
    <rect x="34" y="10" width="4" height="28" rx="2" fill="#0D0D0D"/>
  </svg>
);

export const CartoonGhost: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M10 40V20C10 12.268 16.268 6 24 6C31.732 6 38 12.268 38 20V40L31 34L24 40L17 34L10 40Z" fill="#FFF8E7" stroke="#0D0D0D" strokeWidth="3" strokeLinejoin="round"/>
    <circle cx="18" cy="18" r="3" fill="#0D0D0D"/>
    <circle cx="30" cy="18" r="3" fill="#0D0D0D"/>
  </svg>
);

export const CartoonTrophy: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M12 10H36V22C36 28.6274 30.6274 34 24 34C17.3726 34 12 28.6274 12 22V10Z" fill="#F5C518" stroke="#0D0D0D" strokeWidth="3"/>
    <path d="M12 14H6V22C6 25 8 26 12 26V14Z" fill="#F5C518" stroke="#0D0D0D" strokeWidth="3"/>
    <path d="M36 14H42V22C42 25 40 26 36 26V14Z" fill="#F5C518" stroke="#0D0D0D" strokeWidth="3"/>
    <path d="M18 42H30M24 34V42" stroke="#0D0D0D" strokeWidth="4" strokeLinecap="round"/>
  </svg>
);

export const CartoonSearch: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="20" cy="20" r="14" fill="#FFF8E7" stroke="#0D0D0D" strokeWidth="3"/>
    <line x1="30" y1="30" x2="42" y2="42" stroke="#0D0D0D" strokeWidth="5" strokeLinecap="round"/>
  </svg>
);

export const CartoonUser: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="24" cy="16" r="8" fill="#5BC8F5" stroke="#0D0D0D" strokeWidth="3"/>
    <path d="M10 40C10 32 16 28 24 28C32 28 38 32 38 40" stroke="#0D0D0D" strokeWidth="3" strokeLinecap="round"/>
  </svg>
);

export const CartoonSparkles: React.FC<IconProps> = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M24 4L27 15L38 18L27 21L24 32L21 21L10 18L21 15L24 4Z" fill="#F5C518" stroke="#0D0D0D" strokeWidth="2"/>
    <path d="M38 30L40 36L46 38L40 40L38 46L36 40L30 38L36 36L38 30Z" fill="#F5C518" stroke="#0D0D0D" strokeWidth="2"/>
    <path d="M10 32L11 35L14 36L11 37L10 40L9 37L6 36L9 35L10 32Z" fill="#F5C518" stroke="#0D0D0D" strokeWidth="2"/>
  </svg>
);
