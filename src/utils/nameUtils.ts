export const getInitials = (name: string): string => {
  if (!name || name === 'Unassigned' || name === 'Unknown') {
    return '?';
  }

  const words = name.trim().split(/\s+/);

  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }

  return words
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();
};

export const getFirstName = (name: string): string => {
  if (!name || name === 'Unassigned' || name === 'Unknown') {
    return '?';
  }

  const words = name.trim().split(/\s+/);
  return words[0];
};
