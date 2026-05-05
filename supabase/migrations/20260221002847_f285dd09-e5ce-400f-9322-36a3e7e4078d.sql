
ALTER TABLE employee_incidents ADD COLUMN category text;
ALTER TABLE employee_incidents ADD COLUMN impact text;
ALTER TABLE employee_incidents ADD COLUMN internal_notes text;
ALTER TABLE employee_incidents ADD COLUMN follow_up_date date;
ALTER TABLE employee_incidents ADD COLUMN follow_up_responsible uuid;
ALTER TABLE employee_incidents ADD COLUMN follow_up_notes text;
