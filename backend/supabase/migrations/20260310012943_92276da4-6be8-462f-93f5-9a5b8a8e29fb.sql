-- Clean up existing orphaned announcement notifications
DELETE FROM notifications 
WHERE reference_type = 'announcement' 
AND reference_id IS NOT NULL
AND reference_id NOT IN (SELECT id FROM internal_announcements);