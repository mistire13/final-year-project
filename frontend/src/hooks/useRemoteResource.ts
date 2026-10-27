import { useCallback, useEffect, useRef, useState } from "react";

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
    error: "",
  });
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    setState({ key, data: emptyValue.current, loading: true, error: "" });
    try {
      const data = await loader.current();
      if (request === revision.current)
        setState({ key, data, loading: false, error: "" });
    } catch (error: any) {
      if (request === revision.current)
        setState({
          key,
          data: emptyValue.current,
          loading: false,
          error:
            typeof error?.response?.data?.message === "string"
              ? error.response.data.message
              : "Could not load these records. Check your connection and retry.",
        });
    }
  }, [key]);
  useEffect(() => {
    void refresh();
    return () => {
      revision.current++;
    };
  }, [refresh]);
  return {
    ...(state.key === key
      ? state
      : { key, data: empty, loading: true, error: "" }),
    refresh,
  };
}
