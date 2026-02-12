import type { SVGProps } from "react";

type IllustrationProps = SVGProps<SVGSVGElement> & {
  className?: string;
};

/** Hero: open book with rising pages and a quill pen — brand identity illustration. */
export function HeroIllustration({ className, ...props }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Book spine */}
      <path
        d="M120 150 V55"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity={0.15}
      />
      {/* Left page */}
      <path
        d="M120 55 C100 50, 55 48, 38 58 V148 C55 138, 100 140, 120 150 Z"
        fill="currentColor"
        opacity={0.04}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeOpacity={0.12}
      />
      {/* Right page */}
      <path
        d="M120 55 C140 50, 185 48, 202 58 V148 C185 138, 140 140, 120 150 Z"
        fill="currentColor"
        opacity={0.04}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeOpacity={0.12}
      />
      {/* Text lines on left page */}
      {[70, 82, 94, 106, 118].map((y) => (
        <line
          key={`l-${y}`}
          x1="55"
          y1={y}
          x2={95 - (y - 70) * 0.2}
          y2={y}
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          opacity={0.08}
        />
      ))}
      {/* Text lines on right page */}
      {[70, 82, 94, 106, 118].map((y) => (
        <line
          key={`r-${y}`}
          x1="145"
          y1={y}
          x2={185 + (y - 70) * 0.2}
          y2={y}
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          opacity={0.08}
        />
      ))}
      {/* Rising page — floating above the book */}
      <rect
        x="88"
        y="18"
        width="28"
        height="36"
        rx="2"
        fill="currentColor"
        opacity={0.03}
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity={0.1}
        transform="rotate(-8 102 36)"
      />
      {/* Quill pen */}
      <path
        d="M170 25 C162 40, 158 55, 165 70"
        stroke="#e05b2b"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity={0.5}
      />
      <path
        d="M170 25 C175 20, 182 18, 188 22"
        stroke="#e05b2b"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.35}
      />
      {/* Ink dot */}
      <circle cx="165" cy="72" r="2" fill="#e05b2b" opacity={0.4} />
    </svg>
  );
}

/** Sign-in illustration: writer silhouette at a desk with lamp. */
export function SignInIllustration({ className, ...props }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Desk */}
      <line
        x1="30" y1="120" x2="170" y2="120"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity={0.12}
      />
      {/* Desk legs */}
      <line x1="45" y1="120" x2="45" y2="145" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity={0.08} />
      <line x1="155" y1="120" x2="155" y2="145" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity={0.08} />
      {/* Laptop base */}
      <rect x="72" y="107" width="56" height="13" rx="2" fill="currentColor" opacity={0.05} stroke="currentColor" strokeWidth="1" strokeOpacity={0.1} />
      {/* Laptop screen */}
      <rect x="76" y="74" width="48" height="33" rx="2" fill="currentColor" opacity={0.03} stroke="currentColor" strokeWidth="1" strokeOpacity={0.1} />
      {/* Screen glow */}
      <rect x="80" y="78" width="40" height="25" rx="1" fill="#e05b2b" opacity={0.06} />
      {/* Cursor lines on screen */}
      <line x1="84" y1="84" x2="108" y2="84" stroke="#e05b2b" strokeWidth="1" strokeLinecap="round" opacity={0.2} />
      <line x1="84" y1="90" x2="100" y2="90" stroke="#e05b2b" strokeWidth="1" strokeLinecap="round" opacity={0.15} />
      <line x1="84" y1="96" x2="112" y2="96" stroke="#e05b2b" strokeWidth="1" strokeLinecap="round" opacity={0.1} />
      {/* Coffee mug */}
      <rect x="140" y="108" width="14" height="12" rx="2" fill="currentColor" opacity={0.04} stroke="currentColor" strokeWidth="1" strokeOpacity={0.1} />
      <path d="M154 111 C158 111, 158 117, 154 117" stroke="currentColor" strokeWidth="1" strokeOpacity={0.08} />
      {/* Steam */}
      <path d="M145 104 C143 100, 147 97, 145 93" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity={0.06} />
      <path d="M149 105 C147 101, 151 98, 149 94" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity={0.06} />
      {/* Lamp */}
      <line x1="48" y1="120" x2="48" y2="72" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity={0.1} />
      <path d="M36 72 L48 60 L60 72" stroke="#e05b2b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.3} />
      {/* Lamp light cone */}
      <path d="M38 72 L28 120 L68 120 L58 72" fill="#e05b2b" opacity={0.03} />
    </svg>
  );
}

/** Trust illustration: shield with checkmark — safety/permanence motif. */
export function TrustIllustration({ className, ...props }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Shield */}
      <path
        d="M40 10 L64 22 V44 C64 60 52 72 40 76 C28 72 16 60 16 44 V22 Z"
        fill="currentColor"
        opacity={0.04}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeOpacity={0.12}
      />
      {/* Checkmark */}
      <path
        d="M28 42 L36 50 L54 32"
        stroke="#e05b2b"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.45}
      />
    </svg>
  );
}

type EmptyIllustrationVariant = "search" | "inbox" | "calendar" | "chart" | "sparkle";

const emptyVariantPaths: Record<EmptyIllustrationVariant, string> = {
  search:
    "M44 44 A16 16 0 1 0 44 12 A16 16 0 0 0 44 44 Z M56 40 L68 52",
  inbox:
    "M20 28 L40 16 L60 28 V56 H20 Z M20 28 L40 40 L60 28",
  calendar:
    "M22 24 H58 V60 H22 Z M22 32 H58 M34 20 V28 M46 20 V28 M30 42 H38 M42 42 H50 M30 50 H38",
  chart:
    "M20 56 V24 M20 56 H60 M28 56 V44 M36 56 V36 M44 56 V40 M52 56 V28",
  sparkle:
    "M40 16 L43 30 L56 28 L45 36 L52 48 L40 40 L28 48 L35 36 L24 28 L37 30 Z"
};

/** Small empty-state illustration — decorative SVG above empty-state text. */
export function EmptyIllustration({
  variant = "sparkle",
  className,
  ...props
}: IllustrationProps & { variant?: EmptyIllustrationVariant }) {
  return (
    <svg
      viewBox="0 0 80 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path
        d={emptyVariantPaths[variant]}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.15}
      />
    </svg>
  );
}
