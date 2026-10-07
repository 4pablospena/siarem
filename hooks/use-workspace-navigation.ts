'use client';
import { useEffect, useRef, useState } from 'react';
import { defaultNavigation, navigationKey, navigationMode, navigationSearch, readNavigation, type NavigationState, type WorkspaceView } from '@/lib/navigation';

export function useWorkspaceNavigation() {
  const [navigation, setNavigation] = useState<NavigationState>(defaultNavigation);
  const [ready, setReady] = useState(false);
  const remembered = useRef(new Map<string, NavigationState>());
  const previous = useRef<NavigationState>(defaultNavigation);

  useEffect(() => {
    const restore = () => {
      const entries: unknown = window.history.state?.siaremViews;
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (typeof entry !== 'string') continue;
          const saved = readNavigation(entry);
          remembered.current.set(navigationKey(saved), saved);
        }
      }
      const next = readNavigation(window.location.search);
      previous.current = next;
      setNavigation(next);
      setReady(true);
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  useEffect(() => {
    if (!ready) return;
    remembered.current.set(navigationKey(navigation), navigation);
    const search = navigationSearch(navigation);
    const historyState = { ...window.history.state, siaremViews: [...remembered.current.values()].map(navigationSearch) };
    if (search !== window.location.search) {
      const method = navigationMode(previous.current, navigation) === 'push' ? 'pushState' : 'replaceState';
      window.history[method](historyState, '', `${window.location.pathname}${search}${window.location.hash}`);
    } else {
      window.history.replaceState(historyState, '');
    }
    previous.current = navigation;
  }, [navigation, ready]);

  function set<K extends keyof NavigationState>(key: K, value: NavigationState[K]) {
    setNavigation(current => ({ ...current, [key]: value }));
  }
  function navigate(view: WorkspaceView, projectFocus: string | null = null) {
    setNavigation(current => {
      const target = { ...defaultNavigation, view, projectFocus };
      // Keep the current snapshot even when several state changes are batched.
      if (navigationKey(current) === navigationKey(target)) return current;
      return remembered.current.get(navigationKey(target)) || target;
    });
  }
  return { navigation, set, navigate, ready };
}
