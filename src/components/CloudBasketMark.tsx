import { useId } from 'react'

/** A cloud holding a rising bar chart, sitting in a basket. */
export function CloudBasketMark({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  const stroke = `${id}-s`
  const fill = `${id}-f`
  return (
    <svg viewBox="0 0 64 58" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={stroke} x1="8" y1="6" x2="56" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5db2ff" />
          <stop offset="1" stopColor="#1256e8" />
        </linearGradient>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#4a9bff" />
          <stop offset="1" stopColor="#0f4fdc" />
        </linearGradient>
      </defs>
      <path
        d="M19 37C11 37 7 31.5 8 26C9 20.5 14.5 17.5 20 18.5C21.5 10.5 30 6 37.5 8.8C42 10.4 44.6 13.4 45.6 16.6C52.5 16 57.5 21 56.5 27.5C55.6 33 51.5 37 46 37"
        stroke={`url(#${stroke})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="23" y="27" width="5.5" height="11" rx="1.2" fill={`url(#${fill})`} />
      <rect x="30.5" y="20" width="5.5" height="18" rx="1.2" fill={`url(#${fill})`} />
      <rect x="38" y="13" width="5.5" height="25" rx="1.2" fill={`url(#${fill})`} />
      <rect x="10.5" y="38.5" width="43" height="5" rx="2.5" fill={`url(#${fill})`} />
      <path
        d="M14.5 45.5H49.5L46.6 52.6C46 54.1 44.7 55 43.2 55H20.8C19.3 55 18 54.1 17.4 52.6Z"
        fill={`url(#${fill})`}
      />
      <path d="M24 47.5V52.5M32 47.5V52.5M40 47.5V52.5" stroke="#fff" strokeOpacity=".4" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
