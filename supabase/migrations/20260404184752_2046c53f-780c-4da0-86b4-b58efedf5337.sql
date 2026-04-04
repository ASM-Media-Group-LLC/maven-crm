INSERT INTO project_members (project_id, user_id, role) VALUES
('375895c8-6854-41e3-a449-3345eb5b941d','071de069-206c-4f54-821f-09b0ae3b92ce','member'),
('84228b4b-2757-4298-9231-c54a9214df32','071de069-206c-4f54-821f-09b0ae3b92ce','member'),
('86e7b12e-7e23-4e6a-adb5-ddaf56f7a6a8','071de069-206c-4f54-821f-09b0ae3b92ce','member'),
('62a67e23-ce41-43db-be1c-aaac0d667df8','071de069-206c-4f54-821f-09b0ae3b92ce','member'),
('ca952906-4457-4622-bb26-68eefc0f63a6','071de069-206c-4f54-821f-09b0ae3b92ce','member'),
('d4b6647b-e199-40d9-84b8-71262644f49f','071de069-206c-4f54-821f-09b0ae3b92ce','member'),
('8eefdcd6-5170-4c62-aa8b-86ae7cc5811a','071de069-206c-4f54-821f-09b0ae3b92ce','member'),
('8feacf34-5e3f-440f-b7db-8196fa23e454','071de069-206c-4f54-821f-09b0ae3b92ce','member'),
('753b7177-bfbf-4544-8d96-d3bbd4a57a6e','071de069-206c-4f54-821f-09b0ae3b92ce','member'),
('cd9ef9ce-406a-4af9-a268-18c156df4b9e','071de069-206c-4f54-821f-09b0ae3b92ce','member'),
('ef6a5a74-8c07-4371-9e89-ca4366f1153b','071de069-206c-4f54-821f-09b0ae3b92ce','member'),
('2400083c-0abf-4b70-b974-c175ca9d8488','071de069-206c-4f54-821f-09b0ae3b92ce','member'),
('3f8b32f1-5c4c-44df-977f-3f29ef9cb489','071de069-206c-4f54-821f-09b0ae3b92ce','member')
ON CONFLICT (project_id, user_id) DO NOTHING;