import { useEffect, useState } from 'react';

export const useMatchMediaQuery = (breakpoint: string): boolean => {
  const [matches, setMatches] = useState<boolean>(false);

  useEffect(() => {
    const watcher = matchMedia(breakpoint);
    setMatches(watcher.matches);
    const listener = (isMatch: MediaQueryListEvent) =>
      setMatches(isMatch.matches);
    if (watcher.addEventListener) {
      watcher.addEventListener('change', listener);
    }
    return () => watcher.removeEventListener('change', listener);
  }, [breakpoint]);

  return matches;
};
