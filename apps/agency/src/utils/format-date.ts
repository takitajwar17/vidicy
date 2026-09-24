/**
 * Format a date into a human-readable string
 * @param date Date to format
 * @returns Formatted date string
 */
export function formatAbsoluteDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(dateObj);
}
