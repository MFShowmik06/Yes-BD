
CREATE DATABASE IF NOT EXISTS yes_bd;

USE yes_bd;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  user_type ENUM('admin', 'buyer', 'seller') NOT NULL,
  status ENUM('active', 'blocked') DEFAULT 'active'
);

-- Insert a default admin user. Please change the password after initial login.
INSERT INTO users (username, email, password, user_type) VALUES ('admin', 'admin@admin.admin', '$2b$10$Y.Q.Z.X.Y.Z.A.B.C.D.E.F.G.H.I.J.K.L.M.N.O.P.Q.R.S.T.U', 'admin');

CREATE TABLE IF NOT EXISTS properties (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  location VARCHAR(255) NOT NULL,
  seller_id INT NOT NULL,
  property_type VARCHAR(50),
  bedrooms INT,
  bathrooms INT,
  square_feet INT,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  FOREIGN KEY (seller_id) REFERENCES users(id)
);
