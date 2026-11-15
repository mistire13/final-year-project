import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useRealtime } from "./useRealtime";

function relevantResource(key: string, resource: string) {
  if (key.startsWith('attendance:')) return resource === 'attendance';
  if (key.startsWith('health:')) return resource === 'health' || resource === 'alerts';
  if (key === 'calendar' || key.startsWith('event:')) return resource === 'events';
  if (key.startsWith('report:') || key.startsWith('archive:') || key.startsWith('staff-report:') || key.startsWith('staff-report-history:')) return resource === 'reports';
  if (key.startsWith('child:') || key === 'staff-assigned') return resource === 'children' || resource === 'groups';
  if (key.startsWith('guardian:') || key.startsWith('guardians:')) return resource === 'children' || resource === 'guardians';
  if (key.startsWith('pickup:')) return resource === 'attendance' || resource === 'children' || resource === 'guardians';
  if (key === 'bills') return resource === 'finances';
  if (key === 'orders' || key === 'store') return resource === 'store';
  return false;
}

// Keep an earlier child's response (or a request finishing after unmount) from
// replacing the resource currently on screen.
export function useRemoteResource<T>(
  key: string,
  load: () => Promise<T>,
  empty: T,
) {
  const loader = useRef(load);
  const emptyValue = useRef(empty);
  loader.current = load;
  emptyValue.current = empty;
  const revision = useRef(0);
  const [state, setState] = useState({
    key,
    data: empty,
    loading: true,
    refreshing: false,
    loaded: false,
    error: "",
  });
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    setState(previous => previous.key === key && previous.loaded
      ? { ...previous, loading: false, refreshing: true, error: "" }
      : { key, data: emptyValue.current, loading: true, refreshing: false, loaded: false, error: "" });
    try {
      const data = await loader.current();
      if (request === revision.current)
        setState({ key, data, loading: false, refreshing: false, loaded: true, error: "" });
    } catch (error: any) {
      if (request === revision.current)
        setState(previous => ({
          key,
          data: previous.key === key && previous.loaded ? previous.data : emptyValue.current,
          loading: false,
          refreshing: false,
          loaded: previous.key === key && previous.loaded,
          error:
            typeof error?.response?.data?.message === "string"
              ? error.response.data.message
              : "Could not load these records. Check your connection and retry.",
        }));
    }
  }, [key]);
  useEffect(() => {
    void refresh();
    return () => {
      revision.current++;
    };
  }, [refresh]);
  useRealtime(event => {
    // A disconnect may have hidden changes; fetch current server state on
    // every successful connection as well as on relevant invalidations.
    if (event.type === 'ready' || (event.type === 'resource.changed' && relevantResource(key, event.resource))) void refresh();
  });
  useEffect(() => {
    const listener = AppState.addEventListener("change", state => {
      if (state === "active") void refresh();
    });
    return () => listener.remove();
  }, [refresh]);
  return {
    ...(state.key === key
      ? state
      : { key, data: empty, loading: true, refreshing: false, loaded: false, error: "" }),
    refresh,
  };
}
