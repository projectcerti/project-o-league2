-- Make proofs bucket fully public with no restrictions
update storage.buckets set public = true where id = 'proofs';

-- Drop all existing read policies and add a simple open one
drop policy if exists "Public can read" on storage.objects;
drop policy if exists "Allow public reads" on storage.objects;

create policy "Anyone can read proofs"
  on storage.objects for select
  using (bucket_id = 'proofs');

-- Verify bucket is public
select id, name, public from storage.buckets where id = 'proofs';
