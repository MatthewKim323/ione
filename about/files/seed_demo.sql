-- ione demo seed data
-- Postgres. Drop into supabase SQL editor or pipe through psql.
-- Schema is loosely inferred; adjust column names if your real migrations differ.

-- ---------- USERS ----------
INSERT INTO users (id, auth0_sub, email, display_name, role, grade_level, course, created_at) VALUES
  ('u_maya_chen',    'auth0|6620ab10c92e4f000812aa01', 'maya.chen@demo.ione.app',    'Maya Chen',    'student', 10, 'algebra_2', '2026-02-11T15:00:00Z'),
  ('u_jordan_park',  'auth0|6620ab10c92e4f000812aa02', 'jordan.park@demo.ione.app',  'Jordan Park',  'student', 12, 'calc_1',    '2026-01-29T22:10:00Z'),
  ('u_chen_parent',  'auth0|6620ab10c92e4f000812aa03', 'p.chen@demo.ione.app',       'Linda Chen',   'parent',  NULL, NULL,       '2026-02-11T15:00:00Z'),
  ('u_park_parent',  'auth0|6620ab10c92e4f000812aa04', 'p.park@demo.ione.app',       'David Park',   'parent',  NULL, NULL,       '2026-01-29T22:10:00Z'),
  ('u_ms_alvarez',   'auth0|6620ab10c92e4f000812aa05', 'r.alvarez@demo.ione.app',    'Ms. Alvarez',  'teacher', NULL, NULL,       '2026-01-15T09:00:00Z');

-- ---------- ASSISTANTS (per-student tutor persona / Backboard binding) ----------
INSERT INTO student_assistants (id, user_id, backboard_assistant_id, voice_preset, tone, created_at) VALUES
  ('asst_maya',   'u_maya_chen',   'bb_asst_8KqP12vJ', 'elevenlabs_flash_v2_5__bella',  'warm_low_intervention', '2026-02-11T15:02:00Z'),
  ('asst_jordan', 'u_jordan_park', 'bb_asst_2nVx9LkR', 'elevenlabs_flash_v2_5__rachel', 'direct_low_intervention','2026-01-29T22:14:00Z');

-- ---------- FGA RELATIONSHIPS (parent / teacher view permissions) ----------
INSERT INTO fga_tuples (subject, relation, object) VALUES
  ('user:u_chen_parent',  'viewer', 'student:u_maya_chen'),
  ('user:u_park_parent',  'viewer', 'student:u_jordan_park'),
  ('user:u_ms_alvarez',   'teacher','student:u_maya_chen'),
  ('user:u_ms_alvarez',   'teacher','student:u_jordan_park');

-- ---------- SESSIONS ----------
INSERT INTO sessions (id, user_id, started_at, ended_at, frames_processed, interventions_count, problems_attempted, problems_correct) VALUES
  ('sess_maya_2026-04-22_a3f1',   'u_maya_chen',   '2026-04-22T17:08:00Z', '2026-04-22T17:31:00Z', 47, 3, 6, 5),
  ('sess_maya_2026-04-15_77ee',   'u_maya_chen',   '2026-04-15T16:55:00Z', '2026-04-15T17:22:00Z', 53, 4, 7, 5),
  ('sess_maya_2026-04-08_2bd1',   'u_maya_chen',   '2026-04-08T17:02:00Z', '2026-04-08T17:28:00Z', 49, 5, 6, 4),
  ('sess_jordan_2026-04-21_b9c4', 'u_jordan_park', '2026-04-21T22:17:00Z', '2026-04-21T22:48:00Z', 62, 5, 8, 6),
  ('sess_jordan_2026-04-19_44a0', 'u_jordan_park', '2026-04-19T21:33:00Z', '2026-04-19T22:09:00Z', 71, 6, 9, 6),
  ('sess_jordan_2026-04-17_1c7f', 'u_jordan_park', '2026-04-17T22:01:00Z', '2026-04-17T22:39:00Z', 74, 7, 9, 5);

-- ---------- STRUGGLE PATTERNS (mirrored from the Backboard KG, denormalized for fast dashboard queries) ----------
INSERT INTO struggle_patterns (id, user_id, pattern_key, label, severity, occurrences, first_seen, last_seen, trend) VALUES
  ('sp_maya_001',   'u_maya_chen',   'sign_drop_distribute',          'Drops negative sign when distributing',                'high',   11, '2026-02-11T15:14:00Z', '2026-04-22T17:23:00Z', 'plateauing'),
  ('sp_maya_002',   'u_maya_chen',   'sign_flip_move_term',           'Forgets sign flip when moving across equals',          'medium', 6,  '2026-02-18T16:22:00Z', '2026-04-22T17:18:00Z', 'improving'),
  ('sp_maya_003',   'u_maya_chen',   'double_negative_collapse',      'Reads --x as -x',                                       'medium', 4,  '2026-03-04T15:33:00Z', '2026-04-15T17:12:00Z', 'rare'),
  ('sp_jordan_001', 'u_jordan_park', 'chain_inner_derivative_missing','Applies outer derivative, omits inner derivative',     'high',   17, '2026-01-30T20:11:00Z', '2026-04-21T22:48:00Z', 'persistent'),
  ('sp_jordan_002', 'u_jordan_park', 'chain_with_trig_only',          'Chain rule omission specifically with trig outers',     'high',   9,  '2026-02-04T22:48:00Z', '2026-04-21T22:48:00Z', 'persistent'),
  ('sp_jordan_003', 'u_jordan_park', 'product_vs_chain_confusion',    'Product rule applied where chain rule is needed',       'medium', 5,  '2026-02-12T21:55:00Z', '2026-04-21T22:34:00Z', 'improving'),
  ('sp_jordan_004', 'u_jordan_park', 'dx_dropped',                    'Drops dx/du notation mid-derivation',                   'low',    3,  '2026-02-19T20:09:00Z', '2026-04-19T21:51:00Z', 'rare');

-- ---------- INTERVENTIONS (rolled-up audit trail) ----------
INSERT INTO interventions (id, session_id, kind, fired_at, utterance, outcome) VALUES
  ('iv_001', 'sess_maya_2026-04-22_a3f1',   'nudge_question',  '2026-04-22T17:18:09Z', 'When you move that term across the equals sign, what happens to its sign?', 'self_corrected'),
  ('iv_002', 'sess_maya_2026-04-22_a3f1',   'point_to_line',   '2026-04-22T17:23:15Z', 'Take another look at line 2 — what does -2 times -5 give you?',             'self_corrected'),
  ('iv_003', 'sess_maya_2026-04-22_a3f1',   'nudge_question',  '2026-04-22T17:28:41Z', 'You sure about that combine step?',                                          'self_corrected'),
  ('iv_004', 'sess_jordan_2026-04-21_b9c4', 'nudge_question',  '2026-04-21T22:34:50Z', 'Quick check — is this a product of two functions of x, or a function inside a function?', 'self_corrected'),
  ('iv_005', 'sess_jordan_2026-04-21_b9c4', 'full_explain',    '2026-04-21T22:48:09Z', 'Hold up — you set u = 3x^2 + 1 perfectly, but the chain rule needs you to multiply by du/dx. What''s the derivative of 3x^2 + 1?', 'corrected_with_help'),
  ('iv_006', 'sess_jordan_2026-04-21_b9c4', 'point_to_line',   '2026-04-21T22:42:12Z', 'Look at line 3 again.',                                                       'self_corrected'),
  ('iv_007', 'sess_jordan_2026-04-21_b9c4', 'nudge_question',  '2026-04-21T22:31:08Z', 'What''s the inner function here?',                                            'self_corrected'),
  ('iv_008', 'sess_jordan_2026-04-21_b9c4', 'nudge_question',  '2026-04-21T22:23:55Z', 'Pause — what rule applies?',                                                  'self_corrected');
