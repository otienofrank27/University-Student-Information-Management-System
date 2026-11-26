interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  theme?: 'dark' | 'light' | 'auto';
  showWordmark?: boolean;
  subtitle?: string;
}

const SIZE_MAP = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
} as const;

export function BrandLogo({
  size = 'md',
  theme = 'dark',
  showWordmark = true,
  subtitle,
}: BrandLogoProps) {
  const wordmarkColor =
    theme === 'dark'
      ? 'text-white'
      : theme === 'light'
        ? 'text-slate-900'
        : 'text-slate-900 dark:text-white';

  const subtitleColor =
    theme === 'dark'
      ? 'text-slate-400'
      : theme === 'light'
        ? 'text-slate-500'
        : 'text-slate-500 dark:text-slate-400';

  return (
    <div className="inline-flex items-center gap-3 min-w-0">
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${SIZE_MAP[size]} shrink-0`}
        aria-hidden="true"
      >
        <rect
          width="64"
          height="64"
          rx="14"
          fill={theme === 'light' ? '#0F172A' : '#1E293B'}
        />
        <path
          d="M14 15.5C14 13.567 15.567 12 17.5 12H46.5C48.433 12 50 13.567 50 15.5V31.5C50 42.3 41.9 49.4 32 53C22.1 49.4 14 42.3 14 31.5V15.5Z"
          fill="#1E3A8A"
          stroke="#60A5FA"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />
        <path d="M32 18L44 23.5L32 29L20 23.5L32 18Z" fill="#FFFFFF" />
        <path
          d="M23 26.8V35.5C23 39.2 27.1 42.8 32 44.5C36.9 42.8 41 39.2 41 35.5V26.8L32 30.9L23 26.8Z"
          fill="#E2E8F0"
          fillOpacity="0.94"
        />
        <path
          d="M32 30.9V44.5"
          stroke="#1E3A8A"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx="44" cy="30.5" r="2.5" fill="#D97706" />
        <path
          d="M44 23.5V28.5"
          stroke="#D97706"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>

      {showWordmark && (
        <div className="min-w-0">
          <span
            className={`block font-semibold tracking-tight [text-wrap:balance] ${
              size === 'lg'
                ? 'text-lg leading-snug'
                : size === 'md'
                  ? 'text-sm leading-snug'
                  : 'text-xs leading-snug'
            } ${wordmarkColor}`}
          >
            University Students Information Management System
          </span>
          {subtitle && (
            <span className={`mt-0.5 block truncate text-xs ${subtitleColor}`}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
