
INSERT INTO super_contact_outreach (contact_id, brand, instagram_account, message_type, notes, response, response_status, created_at) VALUES
('5fe37c31-6b61-4222-984a-30466040d186', 'Kashback', 'kashback_oficial', 'dm', 'Hola Juli! Vi tu perfil y nos encantaría trabajar contigo 💜', 'Hola! Me interesa, cuéntenme más', 'positive', now() - interval '5 days'),
('5fe37c31-6b61-4222-984a-30466040d186', 'Kashback', 'kashback_oficial', 'story_reply', 'Increíble tu último reel 🔥', NULL, 'no_response', now() - interval '12 days'),
('5fe37c31-6b61-4222-984a-30466040d186', 'Ora', 'ora_agency', 'dm', 'Juli te queremos invitar a grabar contenido con nosotros', 'No estoy interesada por ahora', 'negative', now() - interval '8 days'),
('5fe37c31-6b61-4222-984a-30466040d186', 'Picklink', 'picklink_co', 'dm', 'Tenemos una propuesta especial para ti', NULL, 'pending', now() - interval '1 day'),
('5fe37c31-6b61-4222-984a-30466040d186', 'Exchange', 'exchange_latam', 'comment', 'Hermosa! Te mandamos DM 😍', NULL, 'no_response', now() - interval '15 days'),
('5fe37c31-6b61-4222-984a-30466040d186', 'Lumina', 'lumina_models', 'whatsapp', 'Hola Juli, somos de Lumina. Nos gustaría hacerte una propuesta', 'Manden info por favor', 'positive', now() - interval '3 days'),
('5fe37c31-6b61-4222-984a-30466040d186', 'Kashback', 'kashback_vip', 'dm', 'Juli! Tenemos un evento especial y queremos que seas parte', NULL, 'pending', now() - interval '2 hours');

INSERT INTO super_contact_interactions (contact_id, type, notes, created_at) VALUES
('5fe37c31-6b61-4222-984a-30466040d186', 'nota', 'Modelo colombiana, muy activa en stories. Engagement alto.', now() - interval '14 days'),
('5fe37c31-6b61-4222-984a-30466040d186', 'numero_obtenido', 'Nos dio el WhatsApp por DM de Kashback', now() - interval '4 days'),
('5fe37c31-6b61-4222-984a-30466040d186', 'seguimiento', 'Pendiente respuesta de Picklink, hacer follow up mañana', now() - interval '6 hours');
