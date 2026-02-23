-- Migration: Add display_order column to tasks table (T14.3 - Task drag-and-drop reordering)
-- This column stores the manual ordering position for tasks within each status column

ALTER TABLE "tasks" ADD COLUMN "display_order" integer DEFAULT 0;

-- Create an index for efficient ordering queries
CREATE INDEX IF NOT EXISTS "tasks_project_status_order_idx" ON "tasks" ("project_id", "status", "display_order");

-- Initialize display_order based on existing taskId order for each project
-- This ensures existing tasks maintain their current relative positions
WITH ordered_tasks AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY project_id, status ORDER BY task_id) * 1000 as new_order
  FROM tasks
)
UPDATE tasks
SET display_order = ordered_tasks.new_order
FROM ordered_tasks
WHERE tasks.id = ordered_tasks.id;
