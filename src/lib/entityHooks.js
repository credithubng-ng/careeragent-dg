import { useEffect, useState, useCallback } from "react";
import { toast } from "react-hot-toast";

export function useCollection(entityName, fetchFn, deps = []) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fn = useCallback(fetchFn, deps);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fn();
      setData(res || []);
    } catch (e) {
      console.error(`Failed to load ${entityName}`, e);
      setError(e);
      toast.error(`Unable to load ${entityName}. Please try again.`, {
        id: `load-${entityName}`,
      });
    } finally {
      setLoading(false);
    }
  }, [entityName, fn]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, error, refetch: load, setData };
}
