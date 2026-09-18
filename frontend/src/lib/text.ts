/** Up to two initials from a display name ("Teguh Sabara" -> "TS"). */
export const initialsOf = (name?: string | null) =>
  (name ?? 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';
