type Props = {
  size?: number;
  className?: string;
};

/**
 * Brian Boru–style Irish harp (monochrome).
 * Silhouette derived from the Noto Emoji harp (Apache 2.0).
 */
export default function IrishHarpIcon({ size = 48, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M93.3 23.6c-6.6 1.3-14.5 7.6-20.6-.6c-2.8-3.8-5.6-8.3-9.6-11.7C55.4 4.5 49.2 3 38.7 3.1C18.1 3.4 18 23.4 28.2 27.5l-.9 76.6s-6.6 2.3-5.7 7.6c.5 2.7 1.2 6.7 1.6 8c2.1 8.3 23.5 4.5 26.7.4c3.4-4.4 56.8-71.5 59.2-74.6c6.3-7.8-.1-24.9-15.8-21.9m.3 16.8C92.1 42 45.4 86.3 41.9 89.6c-.1.1-.2 0-.2-.1l-.3-62.9c.6-.2 1.3-.5 1.9-.9c1.1-.7 5.8-.1 8.3 2c2.8 2.4 10.9 9 12.9 10.6c4.9 3.8 14.2 4.5 21.9 1.7c1.7-.6 6.4-2.3 6.4-2.3c1-.5 2.2 1.3.8 2.7" />
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.42">
        <path d="M50 12v78" />
        <path d="M60.4 16v65" />
        <path d="M67.8 25v49" />
        <path d="M75.5 31v35" />
        <path d="M83.7 33v24" />
        <path d="M91.6 31v18" />
      </g>
    </svg>
  );
}
