-- Add self-referential parent links so Dayflow can store nested subtasks.
-- Run this once in Supabase SQL Editor before using the Subtask selector.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS parent_id text;

-- The composite key ensures a parent belongs to the same account as its child.
CREATE UNIQUE INDEX IF NOT EXISTS tasks_id_user_id_unique_idx
  ON public.tasks (id, user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_parent_same_user_fkey'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_parent_same_user_fkey
      FOREIGN KEY (parent_id, user_id)
      REFERENCES public.tasks (id, user_id)
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS tasks_parent_id_idx
  ON public.tasks (parent_id);
