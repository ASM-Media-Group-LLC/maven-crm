
ALTER TABLE closer_creators ADD COLUMN IF NOT EXISTS main_platform text;
ALTER TABLE closer_creators ADD COLUMN IF NOT EXISTS extras numeric DEFAULT 0;

CREATE TABLE IF NOT EXISTS closer_platform_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES closer_creators(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL,
  product text,
  price numeric DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE closer_platform_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on platform sales" ON closer_platform_sales
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Closers see own platform sales" ON closer_platform_sales
  FOR ALL TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM closer_creators WHERE assigned_to = auth.uid()
    )
  );
