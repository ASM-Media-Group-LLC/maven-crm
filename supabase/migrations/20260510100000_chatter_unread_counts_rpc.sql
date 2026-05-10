-- 20260510100000_chatter_unread_counts_rpc.sql
--
-- Powers the unread badge over each session card in the chatter evaluator
-- sidebar. Counts chatter-side messages whose created_at is newer than
-- read_by_examiner_at on the parent session row, scoped to the calling
-- user via auth.uid(). SECURITY DEFINER lets it skip the per-table RLS
-- joins that would otherwise need extra policies for this aggregation.

CREATE OR REPLACE FUNCTION public.chatter_sessions_unread_counts()
RETURNS TABLE(session_id text, unread_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id AS session_id,
    COUNT(m.id) FILTER (
      WHERE m.role = 'chatter'
        AND (s.read_by_examiner_at IS NULL OR m.created_at > s.read_by_examiner_at)
    ) AS unread_count
  FROM public.chatter_sessions s
  LEFT JOIN public.chatter_messages m ON m.session_id = s.id
  WHERE s.examiner_user_id = auth.uid()
    AND s.status <> 'ended'
  GROUP BY s.id;
$$;

GRANT EXECUTE ON FUNCTION public.chatter_sessions_unread_counts() TO authenticated;
