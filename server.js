require('dotenv').config();
console.log('SESSION_SECRET:', process.env.SESSION_SECRET);
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');

const app = express();
const port = 3000;
const saltRounds = 10;

// Store connected clients for SSE
const clients = {}; // { userId: [res1, res2, ...] }

// Helper to send SSE event
function sendSseEvent(userId, data) {
  if (clients[userId]) {
    clients[userId].forEach(res => {
      res.write(`data: ${JSON.stringify(data)}

`);
    });
  }
}

// Database connection

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'mahirm1l1',
  database: process.env.DB_NAME || 'yes_bd'
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    process.exit(1); // Exit the process if database connection fails
  }
  console.log('Connected to database');
});

app.use(express.static(path.join(__dirname, '')));
app.use('/uploads', express.static('uploads')); // Serve uploaded images statically
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key', // Replace with a real secret key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Multer configuration for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.user_type === 'admin') {
    next();
  } else {
    res.status(401).send('Unauthorized');
  }
};

// Middleware to check if user is logged in
const isLoggedIn = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.status(401).send('Unauthorized');
  }
};

// Middleware to check if user is buyer
const isBuyer = (req, res, next) => {
  if (req.session.user && req.session.user.user_type === 'buyer') {
    next();
  } else {
    res.status(403).send('Forbidden: Not a buyer');
  }
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

app.post('/register', async (req, res) => {
  const { username, email, password, user_type } = req.body;

  try {
    const hash = await bcrypt.hash(password, saltRounds);
    await db.promise().query('INSERT INTO users (username, email, password, user_type) VALUES (?, ?, ?, ?)', [username, email, hash, user_type]);
    res.redirect('/login');
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).send('Server error during registration.');
  }
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);

    if (rows.length > 0) {
      const user = rows[0];
      const match = await bcrypt.compare(password, user.password);

      if (match) {
        if (user.status === 'blocked') {
          console.log('Blocked user attempted to log in:', email);
          res.redirect('/login?error=Your account has been blocked.');
        } else {
          req.session.user = user;
          console.log('User logged in. Session user_type:', req.session.user.user_type);
          res.redirect('/dashboard');
        }
      } else {
        console.log('Incorrect password for user:', email);
        res.redirect('/login?error=Incorrect password');
      }
    } else {
      console.log('User not found:', email);
      res.redirect('/login?error=User not found');
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).send('Server error during login.');
  }
});

app.get('/dashboard', (req, res) => {
  if (req.session.user) {
    const user = req.session.user;
    console.log('User type in /dashboard:', user.user_type);
    if (user.user_type === 'admin') {
      res.sendFile(path.join(__dirname, 'admin.html'));
    } else if (user.user_type === 'seller') {
      res.sendFile(path.join(__dirname, 'seller_dashboard.html'));
    } else {
      res.sendFile(path.join(__dirname, 'buyer.html'));
    }
  } else {
    res.redirect('/login');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Server error during logout.');
    }
    res.redirect('/');
  });
});

app.get('/api/user-session', (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

// SSE endpoint for notifications
app.get('/api/notifications/subscribe', isLoggedIn, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const userId = req.session.user.id;

  if (!clients[userId]) {
    clients[userId] = [];
  }
  clients[userId].push(res);

  req.on('close', () => {
    clients[userId] = clients[userId].filter(client => client !== res);
    if (clients[userId].length === 0) {
      delete clients[userId];
    }
  });
});

// API Routes
app.post('/api/properties', upload.array('property_images', 10), async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const { title, description, price, location, property_type, bedrooms, bathrooms, square_feet, status } = req.body;
    const seller_id = req.session.user.id;
    const imagePaths = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    try {
      const [result] = await db.promise().query(
        'INSERT INTO properties (title, description, price, location, seller_id, property_type, bedrooms, bathrooms, square_feet, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [title, description, price, location, seller_id, property_type, bedrooms, bathrooms, square_feet, status]
      );
      const propertyId = result.insertId;

      if (imagePaths.length > 0) {
        const imageValues = imagePaths.map(imagePath => [propertyId, imagePath]);
        await db.promise().query('INSERT INTO property_images (property_id, image_url) VALUES ?', [imageValues]);
      }
      res.redirect('/dashboard');
    } catch (error) {
      console.error('Error adding property:', error);
      res.status(500).send('Server error adding property.');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.get('/api/my-properties', isLoggedIn, async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const seller_id = req.session.user.id;

    try {
      const [result] = await db.promise().query('SELECT p.*, GROUP_CONCAT(pi.image_url) AS images FROM properties p LEFT JOIN property_images pi ON p.id = pi.property_id WHERE p.seller_id = ? GROUP BY p.id', [seller_id]);
      res.json(result);
    } catch (error) {
      console.error('Error fetching seller properties:', error);
      res.status(500).send('Server error fetching properties.');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.get('/api/all-properties', isLoggedIn, async (req, res) => {
  try {
    const [result] = await db.promise().query('SELECT p.*, GROUP_CONCAT(pi.image_url) AS images FROM properties p LEFT JOIN property_images pi ON p.id = pi.property_id GROUP BY p.id');
    res.json(result);
  } catch (error) {
    console.error('Error fetching all properties:', error);
    res.status(500).send('Server error fetching properties.');
  }
});

app.get('/api/properties/featured', async (req, res) => {
  try {
    const [properties] = await db.promise().query(
      'SELECT p.id, p.title, p.description, p.price, p.location, GROUP_CONCAT(pi.image_url) AS images FROM properties p LEFT JOIN property_images pi ON p.id = pi.property_id WHERE p.status = \'approved\' GROUP BY p.id LIMIT 5'
    );
    res.json(properties);
  } catch (error) {
    console.error('Error fetching featured properties:', error);
    res.status(500).send('Server error');
  }
});

app.get('/api/properties/filter', isLoggedIn, async (req, res) => {
  let sql = 'SELECT p.*, GROUP_CONCAT(pi.image_url) AS images FROM properties p LEFT JOIN property_images pi ON p.id = pi.property_id WHERE 1=1';
  const params = [];

  if (req.query.location) {
    sql += ' AND location LIKE ?';
    params.push(`%${req.query.location}%`);
  }

  if (req.query.property_type) {
    sql += ' AND property_type = ?';
    params.push(req.query.property_type);
  }

  if (req.query.bedrooms) {
    sql += ' AND bedrooms = ?';
    params.push(req.query.bedrooms);
  }

  if (req.query.bathrooms) {
    sql += ' AND bathrooms = ?';
    params.push(req.query.bathrooms);
  }

  sql += ' GROUP BY p.id';

  try {
    const [result] = await db.promise().query(sql, params);
    res.json(result);
  } catch (error) {
    console.error('Error filtering properties:', error);
    res.status(500).send('Server error filtering properties.');
  }
});

app.get('/api/properties/:id', isLoggedIn, async (req, res) => {
  const propertyId = req.params.id;
  try {
    const [result] = await db.promise().query('SELECT p.*, GROUP_CONCAT(pi.image_url) AS images FROM properties p LEFT JOIN property_images pi ON p.id = pi.property_id WHERE p.id = ? GROUP BY p.id', [propertyId]);
    if (result.length > 0) {
      res.json(result[0]);
    } else {
      res.status(404).send('Property not found');
    }
  } catch (error) {
    console.error('Error fetching property by ID:', error);
    res.status(500).send('Server error fetching property.');
  }
});

// Seller Dashboard API Routes
app.get('/api/seller/dashboard-summary', isLoggedIn, async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const seller_id = req.session.user.id;
    try {
      // Active Listings
      const [activeListings] = await db.promise().query(
        'SELECT COUNT(*) AS count FROM properties WHERE seller_id = ? AND status = \'approved\'',
        [seller_id]
      );

      // Pending Approval Listings
      const [pendingApproval] = await db.promise().query(
        'SELECT COUNT(*) AS count FROM properties WHERE seller_id = ? AND status = \'pending\'',
        [seller_id]
      );

      // New Booking Requests (pending for seller\'s properties)
      const [newBookingRequests] = await db.promise().query(
        'SELECT COUNT(b.id) AS count FROM bookings b JOIN properties p ON b.property_id = p.id WHERE p.seller_id = ? AND b.status = \'pending\'',
        [seller_id]
      );

      // Unread Messages
      const [unreadMessages] = await db.promise().query(
        'SELECT COUNT(*) AS count FROM messages WHERE receiver_id = ? AND is_read = FALSE',
        [seller_id]
      );

      res.json({
        activeListings: activeListings[0].count,
        pendingApproval: pendingApproval[0].count,
        newBookingRequests: newBookingRequests[0].count,
        unreadMessages: unreadMessages[0].count
      });

    } catch (error) {
      console.error('Error fetching seller dashboard summary:', error);
      res.status(500).send('Server error');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// API to get booking requests for seller's properties
app.get('/api/seller/booking-requests', isLoggedIn, async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const seller_id = req.session.user.id;
    try {
      const [bookingRequests] = await db.promise().query(
        'SELECT b.*, p.title AS property_title, p.location, u.username AS buyer_username, u.email AS buyer_email FROM bookings b JOIN properties p ON b.property_id = p.id JOIN users u ON b.buyer_id = u.id WHERE p.seller_id = ? ORDER BY b.created_at DESC',
        [seller_id]
      );
      res.json(bookingRequests);
    } catch (error) {
      console.error('Error fetching seller booking requests:', error);
      res.status(500).send('Server error');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// API to get messages for the seller
app.get('/api/seller/messages', isLoggedIn, async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const seller_id = req.session.user.id;
    try {
      const [messages] = await db.promise().query(
        'SELECT m.*, s.username AS sender_username, r.username AS receiver_username, p.title AS property_title FROM messages m JOIN users s ON m.sender_id = s.id JOIN users r ON m.receiver_id = r.id LEFT JOIN properties p ON m.property_id = p.id WHERE m.receiver_id = ? OR m.sender_id = ? ORDER BY m.created_at DESC',
        [seller_id, seller_id]
      );
      res.json(messages);
    } catch (error) {
      console.error('Error fetching seller messages:', error);
      res.status(500).send('Server error');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// API to approve a booking request
app.put('/api/seller/booking-requests/:id/approve', isLoggedIn, async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const bookingId = req.params.id;
    const seller_id = req.session.user.id;
    try {
      // Verify that the booking belongs to the seller's property
      const [booking] = await db.promise().query(
        'SELECT b.id FROM bookings b JOIN properties p ON b.property_id = p.id WHERE b.id = ? AND p.seller_id = ?',
        [bookingId, seller_id]
      );

      if (booking.length === 0) {
        return res.status(404).send('Booking request not found or you are not the owner of the property.');
      }

      await db.promise().query(
        'UPDATE bookings SET status = \'approved\' WHERE id = ?',
        [bookingId]
      );
      res.status(200).send('Booking request approved');
    } catch (error) {
      console.error('Error approving booking request:', error);
      res.status(500).send('Server error');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// API to decline a booking request
app.put('/api/seller/booking-requests/:id/decline', isLoggedIn, async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const bookingId = req.params.id;
    const seller_id = req.session.user.id;
    try {
      // Verify that the booking belongs to the seller's property
      const [booking] = await db.promise().query(
        'SELECT b.id FROM bookings b JOIN properties p ON b.property_id = p.id WHERE b.id = ? AND p.seller_id = ?',
        [bookingId, seller_id]
      );

      if (booking.length === 0) {
        return res.status(404).send('Booking request not found or you are not the owner of the property.');
      }

      await db.promise().query(
        'UPDATE bookings SET status = \'declined\' WHERE id = ?',
        [bookingId]
      );
      res.status(200).send('Booking request declined');
    } catch (error) {
      console.error('Error declining booking request:', error);
      res.status(500).send('Server error');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// API to send a message from seller
app.post('/api/seller/messages', isLoggedIn, async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const { receiver_id, property_id, message } = req.body;
    const sender_id = req.session.user.id;
    try {
      await db.promise().query(
        'INSERT INTO messages (sender_id, receiver_id, property_id, message) VALUES (?, ?, ?, ?)',
        [sender_id, receiver_id, property_id, message]
      );
      res.status(201).send('Message sent successfully');
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).send('Server error');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// API to get seller profile
async function getUserProfile(userId) {
  const [user] = await db.promise().query(
    'SELECT id, username, email, first_name, last_name, phone_number FROM users WHERE id = ?',
    [userId]
  );
  return user[0];
}

app.get('/api/seller/profile', isLoggedIn, async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const seller_id = req.session.user.id;
    try {
      const user = await getUserProfile(seller_id);
      if (user) {
        res.json(user);
      } else {
        res.status(404).send('Seller not found');
      }
    } catch (error) {
      console.error('Error fetching seller profile:', error);
      res.status(500).send('Server error');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// API to update seller profile
app.put('/api/seller/profile', isLoggedIn, async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const seller_id = req.session.user.id;
    const { username, email, phone_number } = req.body;
    try {
      await db.promise().query(
        'UPDATE users SET username = ?, email = ?, phone_number = ? WHERE id = ?',
        [username, email, phone_number, seller_id]
      );
      // Update session user data
      req.session.user = { ...req.session.user, username, email, phone_number };
      res.status(200).send('Profile updated successfully');
    } catch (error) {
      console.error('Error updating seller profile:', error);
      res.status(500).send('Server error');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// API to change seller password
async function changeUserPassword(userId, currentPassword, newPassword) {
  const [user] = await db.promise().query('SELECT password FROM users WHERE id = ?', [userId]);
  if (user.length === 0) {
    throw new Error('User not found');
  }

  const match = await bcrypt.compare(currentPassword, user[0].password);
  if (!match) {
    throw new Error('Incorrect current password');
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
  await db.promise().query('UPDATE users SET password = ? WHERE id = ?', [hashedNewPassword, userId]);
}

app.put('/api/seller/change-password', isLoggedIn, async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const seller_id = req.session.user.id;
    const { current_password, new_password } = req.body;
    try {
      await changeUserPassword(seller_id, current_password, new_password);
      res.status(200).send('Password changed successfully');
    } catch (error) {
      console.error('Error changing seller password:', error);
      res.status(400).send(error.message);
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// API to get seller notifications
app.get('/api/seller/notifications', isLoggedIn, async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const seller_id = req.session.user.id;
    try {
      const [notifications] = await db.promise().query(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
        [seller_id]
      );
      res.json(notifications);
    } catch (error) {
      console.error('Error fetching seller notifications:', error);
      res.status(500).send('Server error');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// API to mark a specific notification as read
app.put('/api/seller/notifications/mark-read/:id', isLoggedIn, async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const notificationId = req.params.id;
    const seller_id = req.session.user.id;
    try {
      const [result] = await db.promise().query(
        'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
        [notificationId, seller_id]
      );
      if (result.affectedRows > 0) {
        res.status(200).send('Notification marked as read');
      } else {
        res.status(404).send('Notification not found or not authorized');
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).send('Server error');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// API to mark all notifications as read
app.put('/api/seller/notifications/mark-all-read', isLoggedIn, async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const seller_id = req.session.user.id;
    try {
      await db.promise().query(
        'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
        [seller_id]
      );
      res.status(200).send('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).send('Server error');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});



// Buyer Dashboard API Routes
app.get('/api/buyer/dashboard-summary', isLoggedIn, isBuyer, async (req, res) => {
  const buyer_id = req.session.user.id;
  try {
    const [bookingCount] = await db.promise().query('SELECT COUNT(*) AS count FROM bookings WHERE buyer_id = ? AND status = \'pending\'', [buyer_id]);
    const [messageCount] = await db.promise().query('SELECT COUNT(*) AS count FROM messages WHERE receiver_id = ? AND is_read = FALSE', [buyer_id]);
    const [savedPropertyCount] = await db.promise().query('SELECT COUNT(*) AS count FROM saved_properties WHERE user_id = ?', [buyer_id]);

    res.json({
      upcomingBookings: bookingCount[0].count,
      unreadMessages: messageCount[0].count,
      savedProperties: savedPropertyCount[0].count
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

app.get('/api/buyer/profile', isLoggedIn, isBuyer, async (req, res) => {
  const buyer_id = req.session.user.id;
  try {
    const user = await getUserProfile(buyer_id);
    if (user) {
      res.json(user);
    } else {
      res.status(404).send('User not found');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

app.put('/api/buyer/profile', isLoggedIn, isBuyer, async (req, res) => {
  const buyer_id = req.session.user.id;
  const { username, email, first_name, last_name, phone_number } = req.body;
  try {
    await db.promise().query(
      'UPDATE users SET username = ?, email = ?, first_name = ?, last_name = ?, phone_number = ? WHERE id = ?',
      [username, email, first_name, last_name, phone_number, buyer_id]
    );
    // Update session user data
    req.session.user = { ...req.session.user, username, email, first_name, last_name, phone_number };
    res.status(200).send('Profile updated successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

app.put('/api/buyer/change-password', isLoggedIn, isBuyer, async (req, res) => {
  const buyer_id = req.session.user.id;
  const { current_password, new_password } = req.body;
  try {
    await changeUserPassword(buyer_id, current_password, new_password);
    res.status(200).send('Password changed successfully');
  } catch (error) {
    console.error(error);
    res.status(400).send(error.message);
  }
});

app.get('/api/buyer/bookings/upcoming', isLoggedIn, isBuyer, async (req, res) => {
  const buyer_id = req.session.user.id;
  try {
    const [bookings] = await db.promise().query(
      'SELECT b.*, p.title AS property_title, p.location, s.email AS seller_email FROM bookings b JOIN properties p ON b.property_id = p.id JOIN users s ON p.seller_id = s.id WHERE b.buyer_id = ? AND b.booking_date >= NOW() ORDER BY b.booking_date ASC',
      [buyer_id]
    );
    res.json(bookings);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

app.get('/api/buyer/bookings/past', isLoggedIn, isBuyer, async (req, res) => {
  const buyer_id = req.session.user.id;
  try {
    const [bookings] = await db.promise().query(
      'SELECT b.*, p.title AS property_title, p.location FROM bookings b JOIN properties p ON b.property_id = p.id WHERE b.buyer_id = ? AND b.booking_date < NOW() ORDER BY b.booking_date DESC',
      [buyer_id]
    );
    res.json(bookings);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

app.post('/api/bookings', isLoggedIn, isBuyer, async (req, res) => {
    const { property_id, preferred_date, preferred_time, message } = req.body;
    const buyer_id = req.session.user.id;

    try {
        // Get seller_id from the property
        const [propertyRows] = await db.promise().query('SELECT seller_id FROM properties WHERE id = ?', [property_id]);
        if (propertyRows.length === 0) {
            return res.status(404).send('Property not found.');
        }
        const seller_id = propertyRows[0].seller_id;

        // Combine date and time and format for MySQL DATETIME column
        const booking_date = new Date(`${preferred_date}T${preferred_time}`);
        const formatted_booking_date = booking_date.toISOString().slice(0, 19).replace('T', ' ');

        // Insert booking
        await db.promise().query('INSERT INTO bookings (property_id, buyer_id, booking_date, message, status) VALUES (?, ?, ?, ?, ?)',
            [property_id, buyer_id, formatted_booking_date, message, 'pending']);

        // Also send a message to the seller
        await db.promise().query('INSERT INTO messages (sender_id, receiver_id, property_id, message) VALUES (?, ?, ?, ?)',
            [buyer_id, seller_id, property_id, `New booking request for your property (ID: ${property_id}): ${message}`]);

        // Send real-time notification to seller
        sendSseEvent(seller_id, { type: 'new_booking_request', property_id, buyer_id, message, booking_date });

        res.status(201).send('Booking request sent and message delivered.');
    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).send('Server error creating booking.');
    }
});

app.get('/api/buyer/messages', isLoggedIn, isBuyer, async (req, res) => {
  const user_id = req.session.user.id;
  try {
    const [messages] = await db.promise().query(
      'SELECT m.*, s.username AS sender_username, r.username AS receiver_username, p.title AS property_title FROM messages m JOIN users s ON m.sender_id = s.id JOIN users r ON m.receiver_id = r.id LEFT JOIN properties p ON m.property_id = p.id WHERE m.sender_id = ? OR m.receiver_id = ? ORDER BY m.created_at DESC',
      [user_id, user_id]
    );
    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

app.post('/api/buyer/messages', isLoggedIn, isBuyer, async (req, res) => {
  const { receiver_id, property_id, message } = req.body;
  const sender_id = req.session.user.id;
  try {
    await db.promise().query(
      'INSERT INTO messages (sender_id, receiver_id, property_id, message) VALUES (?, ?, ?, ?)',
      [sender_id, receiver_id, property_id, message]
    );
    res.status(201).send('Message sent successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

app.get('/api/buyer/saved-properties', isLoggedIn, isBuyer, async (req, res) => {
  const user_id = req.session.user.id;
  try {
    const [savedProperties] = await db.promise().query(
      'SELECT sp.id AS saved_id, p.*, GROUP_CONCAT(pi.image_url) AS images FROM saved_properties sp JOIN properties p ON sp.property_id = p.id LEFT JOIN property_images pi ON p.id = pi.property_id WHERE sp.user_id = ? GROUP BY p.id',
      [user_id]
    );
    res.json(savedProperties);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

app.post('/api/buyer/saved-properties', isLoggedIn, isBuyer, async (req, res) => {
  const { property_id } = req.body;
  const user_id = req.session.user.id;
  try {
    // Check if already saved
    const [existing] = await db.promise().query('SELECT id FROM saved_properties WHERE user_id = ? AND property_id = ?', [user_id, property_id]);
    if (existing.length > 0) {
      return res.status(409).send('Property already saved');
    }
    await db.promise().query('INSERT INTO saved_properties (user_id, property_id) VALUES (?, ?)', [user_id, property_id]);
    res.status(201).send('Property saved successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

app.delete('/api/buyer/saved-properties/:property_id', isLoggedIn, isBuyer, async (req, res) => {
  const { property_id } = req.params;
  const user_id = req.session.user.id;
  try {
    const [result] = await db.promise().query('DELETE FROM saved_properties WHERE user_id = ? AND property_id = ?', [user_id, property_id]);
    if (result.affectedRows > 0) {
      res.status(200).send('Property removed from saved list');
    } else {
      res.status(404).send('Property not found in saved list');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

app.put('/api/properties/:id', upload.array('property_images', 10), async (req, res) => {
  if (req.session.user && req.session.user.user_type === 'seller') {
    const propertyId = req.params.id;
    const seller_id = req.session.user.id;
    const { title, description, price, location, property_type, bedrooms, bathrooms, square_feet, status } = req.body;
    const imagePaths = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    try {
      const [result] = await db.promise().query('UPDATE properties SET title = ?, description = ?, price = ?, location = ?, property_type = ?, bedrooms = ?, bathrooms = ?, square_feet = ?, status = ? WHERE id = ? AND seller_id = ?',
        [title, description, price, location, property_type, bedrooms, bathrooms, square_feet, status, propertyId, seller_id]
      );

      if (result.affectedRows > 0) {
        if (imagePaths.length > 0) {
          const imageValues = imagePaths.map(imagePath => [propertyId, imagePath]);
          await db.promise().query('INSERT INTO property_images (property_id, image_url) VALUES ?', [imageValues]);
        }
        res.sendStatus(200);
      } else {
        res.status(404).send('Property not found or you are not the owner.');
      }
    } catch (error) {
      console.error('Error updating property:', error);
      res.status(500).send('Server error updating property.');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.delete('/api/properties/:id', isLoggedIn, async (req, res) => {
  const propertyId = req.params.id;
  const user = req.session.user;

  try {
    // First, get image paths associated with the property
    const [imageRows] = await db.promise().query('SELECT image_url FROM property_images WHERE property_id = ?', [propertyId]);
    const imagePaths = imageRows.map(row => path.join(__dirname, row.image_url));

    let deleteQuery;
    const queryParams = [propertyId];

    if (user.user_type === 'admin') {
      // Admin can delete any property
      deleteQuery = 'DELETE FROM properties WHERE id = ?';
    } else if (user.user_type === 'seller') {
      // Seller can only delete their own properties
      deleteQuery = 'DELETE FROM properties WHERE id = ? AND seller_id = ?';
      queryParams.push(user.id);
    } else {
      return res.status(403).send('Forbidden: You do not have permission to delete properties.');
    }

    // Delete property from database
    const [result] = await db.promise().query(deleteQuery, queryParams);

    if (result.affectedRows > 0) {
      // Delete associated image files from the file system
      imagePaths.forEach(imagePath => {
        fs.unlink(imagePath, (err) => {
          if (err) {
            console.error(`Error deleting image file ${imagePath}:`, err);
          }
        });
      });
      res.status(200).send('Property deleted successfully.');
    } else {
      res.status(404).send('Property not found or you are not the owner.');
    }
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).send('Server error deleting property.');
  }
});

// Admin API Routes
app.get('/api/admin/pending-listings', isAdmin, async (req, res) => {
  try {
    const [count] = await db.promise().query("SELECT COUNT(*) AS count FROM properties WHERE status = 'pending'");
    res.json({ count: count[0].count });
  } catch (error) {
    console.error('Error fetching pending listings count:', error);
    res.status(500).send('Server error');
  }
});

app.get('/api/admin/approved-listings', isAdmin, async (req, res) => {
  try {
    const [count] = await db.promise().query("SELECT COUNT(*) AS count FROM properties WHERE status = 'approved'");
    res.json({ count: count[0].count });
  } catch (error) {
    console.error('Error fetching approved listings count:', error);
    res.status(500).send('Server error');
  }
});

app.get('/api/admin/total-users', isAdmin, async (req, res) => {
  try {
    const [count] = await db.promise().query('SELECT COUNT(*) AS count FROM users');
    res.json({ count: count[0].count });
  } catch (error) {
    console.error('Error fetching total users count:', error);
    res.status(500).send('Server error');
  }
});

app.get('/api/admin/pending-reports', isAdmin, async (req, res) => {
  // This would require a 'reports' or 'complaints' table.
  // For now, returning a placeholder.
  res.json({ count: 0 });
});

app.get('/api/admin/recent-activity', isAdmin, async (req, res) => {
  try {
    const [listings] = await db.promise().query(
      'SELECT title, status, created_at FROM properties ORDER BY created_at DESC LIMIT 5'
    );
    const [users] = await db.promise().query(
      'SELECT username, created_at FROM users ORDER BY created_at DESC LIMIT 5'
    );

    const activity = [];
    listings.forEach(item => {
      activity.push({
        message: `Listing \"${item.title}\" was ${item.status}.`,
        timestamp: item.created_at
      });
    });
    users.forEach(item => {
      activity.push({
        message: `New user registered: \"${item.username}\".`,
        timestamp: item.created_at
      });
    });

    // Sort by timestamp
    activity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(activity.slice(0, 10)); // Return top 10 recent activities
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).send('Server error');
  }
});

app.get('/api/users', isAdmin, async (req, res) => {
  try {
    const [result] = await db.promise().query('SELECT id, username, email, user_type, status FROM users');
    res.json(result);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send('Server error fetching users.');
  }
});

app.delete('/api/users/:id', isAdmin, async (req, res) => {
  const userId = req.params.id;
  try {
    const [result] = await db.promise().query('DELETE FROM users WHERE id = ?', [userId]);
    if (result.affectedRows > 0) {
      res.sendStatus(200);
    } else {
      res.status(404).send('User not found.');
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).send('Server error deleting user.');
  }
});

app.get('/api/properties', isAdmin, async (req, res) => {
  try {
    const [result] = await db.promise().query('SELECT * FROM properties');
    res.json(result);
  } catch (error) {
    console.error('Error fetching all properties (admin):', error);
    res.status(500).send('Server error fetching properties.');
  }
});

app.delete('/api/properties/:id', isAdmin, async (req, res) => {
  const propertyId = req.params.id;
  try {
    const [result] = await db.promise().query('DELETE FROM properties WHERE id = ?', [propertyId]);
    if (result.affectedRows > 0) {
      res.sendStatus(200);
    } else {
      res.status(404).send('Property not found.');
    }
  } catch (error) {
    console.error('Error deleting property (admin):', error);
    res.status(500).send('Server error deleting property.');
  }
});


app.put('/api/users/:id/block', isAdmin, async (req, res) => {
  const userId = req.params.id;
  try {
    const [result] = await db.promise().query('UPDATE users SET status = \'blocked\' WHERE id = ?', [userId]);
    if (result.affectedRows > 0) {
      res.status(200).send('User blocked successfully');
    } else {
      res.status(404).send('User not found');
    }
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).send('Server error blocking user.');
  }
});

app.put('/api/users/:id/unblock', isAdmin, async (req, res) => {
  const userId = req.params.id;
  try {
    const [result] = await db.promise().query('UPDATE users SET status = \'active\' WHERE id = ?', [userId]);
    if (result.affectedRows > 0) {
      res.status(200).send('User unblocked successfully');
    } else {
      res.status(404).send('User not found');
    }
  } catch (error) {
    console.error('Error unblocking user:', error);
    res.status(500).send('Server error unblocking user.');
  }
});

// Admin Listings API Routes
app.get('/api/admin/listings/pending', isAdmin, async (req, res) => {
  try {
    const [listings] = await db.promise().query('SELECT id, title, description, price, location FROM properties WHERE status = \'pending\'');
    res.json(listings);
  } catch (error) {
    console.error('Error fetching pending listings:', error);
    res.status(500).send('Server error');
  }
});

app.get('/api/admin/listings/approved', isAdmin, async (req, res) => {
  try {
    const [listings] = await db.promise().query('SELECT id, title, description, price, location, status, bedrooms FROM properties WHERE status = \'approved\'');
    res.json(listings);
  } catch (error) {
    console.error('Error fetching approved listings:', error);
    res.status(500).send('Server error');
  }
});

app.put('/api/admin/listings/:id/approve', isAdmin, async (req, res) => {
  const listingId = req.params.id;
  try {
    const [result] = await db.promise().query('UPDATE properties SET status = \'approved\' WHERE id = ?', [listingId]);
    if (result.affectedRows > 0) {
      res.status(200).send('Listing approved successfully');
    } else {
      res.status(404).send('Listing not found');
    }
  } catch (error) {
    console.error('Error approving listing:', error);
    res.status(500).send('Server error');
  }
});

app.put('/api/admin/block-listing/:id', isAdmin, async (req, res) => {
  const listingId = req.params.id;
  try {
    const [result] = await db.promise().query('UPDATE properties SET status = \'blocked\' WHERE id = ?', [listingId]);
    if (result.affectedRows > 0) {
      res.status(200).send('Listing blocked successfully');
    } else {
      res.status(404).send('Listing not found');
    }
  } catch (error) {
    console.error('Error blocking listing:', error);
    res.status(500).send('Server error');
  }
});

app.put('/api/admin/approve-next-pending-listing', isAdmin, async (req, res) => {
  try {
    // Find the oldest pending listing
    const [pendingListing] = await db.promise().query('SELECT id FROM properties WHERE status = \'pending\' ORDER BY created_at ASC LIMIT 1');

    if (pendingListing.length === 0) {
      return res.status(404).send('No pending listings to approve.');
    }

    const listingIdToApprove = pendingListing[0].id;

    // Approve the listing
    const [result] = await db.promise().query('UPDATE properties SET status = \'approved\' WHERE id = ?', [listingIdToApprove]);

    if (result.affectedRows > 0) {
      res.status(200).send(`Listing ${listingIdToApprove} approved successfully.`);
    } else {
      res.status(500).send('Failed to approve listing.');
    }
  } catch (error) {
    console.error('Error approving next pending listing:', error);
    res.status(500).send('Server error');
  }
});


app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});