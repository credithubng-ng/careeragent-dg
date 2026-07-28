import { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";

export function useCollection(entityName, fetchFn, deps = []) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const fn = useCallback(fetchFn, deps);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fn();
      setData(res || []);
    } catch (e) {
      console.error("load error", e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [fn]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, refetch: load, setData };
}