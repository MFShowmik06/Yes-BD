USE yes_bd;

-- Drop tables created by database_update.sql
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS saved_properties;

-- Drop columns added to existing tables by database_update.sql
-- Check if columns exist before dropping to avoid errors if they were not created
ALTER TABLE properties DROP COLUMN IF EXISTS property_type;
ALTER TABLE properties DROP COLUMN IF EXISTS bedrooms;
ALTER TABLE properties DROP COLUMN IF EXISTS bathrooms;
ALTER TABLE properties DROP COLUMN IF EXISTS square_feet;

ALTER TABLE users DROP COLUMN IF EXISTS first_name;
ALTER TABLE users DROP COLUMN IF EXISTS last_name;
ALTER TABLE users DROP COLUMN IF EXISTS phone_number;