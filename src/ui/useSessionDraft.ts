import { useCallback, useContext, useEffect, useRef, useState, type SetStateAction } from "react";
import { SessionDraftContext } from "./session-draft-context";
import { readSessionDraft, retainSessionDraft, sessionDraftEpoch } from "./session-draft-store";
/** Memory only. Never automatically replays a native write. */
export function useSessionDraft<T>(key: string, initial: T | (() => T)) {
  const owner = useContext(SessionDraftContext);
  const epoch = sessionDraftEpoch();
  const scope = JSON.stringify([owner, key, epoch]);
  const initialize = () => (typeof initial === "function" ? (initial as () => T)() : initial);
  const [state, setState] = useState(() => ({
    scope,
    value: owner ? readSessionDraft(scope, initialize) : initialize(),
  }));
  if (state.scope !== scope)
    setState({ scope, value: owner ? readSessionDraft(scope, initialize) : initialize() });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const update = useCallback(
    (action: SetStateAction<T>) => {
      if (!mounted.current || epoch !== sessionDraftEpoch()) return;
      setState((current) => {
        if (current.scope !== scope || epoch !== sessionDraftEpoch()) return current;
        const value =
          typeof action === "function" ? (action as (value: T) => T)(current.value) : action;
        if (owner) retainSessionDraft(scope, value);
        return { scope, value };
      });
    },
    [scope, owner, epoch],
  );
  return [state.value, update] as const;
}
