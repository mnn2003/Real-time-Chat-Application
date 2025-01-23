/*
  # Fix user creation trigger

  1. Changes
    - Update handle_new_user function to properly handle user metadata
    - Add error handling for missing data
    - Ensure proper type casting
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create improved function for handling new users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    username,
    avatar_url,
    status,
    last_seen
  ) VALUES (
    NEW.id,
    COALESCE(
      (NEW.raw_user_meta_data->>'username')::text,
      'user_' || substr(NEW.id::text, 1, 6)
    ),
    COALESCE(
      (NEW.raw_user_meta_data->>'avatar_url')::text,
      ''
    ),
    'offline',
    now()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();