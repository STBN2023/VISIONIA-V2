
SELECT id, project_id, mode, status, created_at, 
       (SELECT count(*) FROM run_items ri WHERE ri.run_id = r.id) as item_count
FROM runs r
ORDER BY created_at DESC
LIMIT 20;
