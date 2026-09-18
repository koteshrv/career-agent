export function companyInitials(name: string): string {
  if (!name) return "?";
  
  // Clean up suffixes like "Inc", "LLC", etc to get the real core brand letters
  const cleaned = name
    .replace(/\b(Inc\.?|LLC|Ltd\.?|Limited|GmbH|Co\.?|Corp\.?|Corporation|SA|AG|PLC)\b/gi, "")
    .replace(/[^\w\s-]/g, " ")
    .trim();
    
  if (!cleaned) return name.substring(0, 1).toUpperCase();

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    const word = words[0];
    // If CamelCase (e.g., "YouTube"), pick 'Y' and 'T'
    const caps = word.match(/[A-Z]/g);
    if (caps && caps.length >= 2 && caps.length < word.length) {
      return (caps[0] + caps[1]).toUpperCase();
    }
    // Otherwise just first letter
    return word.substring(0, 1).toUpperCase();
  }
  
  return (words[0].substring(0, 1) + words[1].substring(0, 1)).toUpperCase();
}

export function monogramHue(name: string): number {
  if (!name) return 0;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 360);
}

