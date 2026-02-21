
-- Create storage bucket for product media
INSERT INTO storage.buckets (id, name, public) VALUES ('product-media', 'product-media', true);

-- Allow authenticated users to view product media
CREATE POLICY "Anyone can view product media"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-media');

-- Allow store members to upload product media
CREATE POLICY "Store members can upload product media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-media'
  AND auth.uid() IS NOT NULL
);

-- Allow store members to update their product media
CREATE POLICY "Store members can update product media"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'product-media'
  AND auth.uid() IS NOT NULL
);

-- Allow store members to delete their product media
CREATE POLICY "Store members can delete product media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-media'
  AND auth.uid() IS NOT NULL
);
