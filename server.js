const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import routes
const userRoutes = require('./routes/userRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const adminRoutes = require('./routes/adminRoutes');
const lineRoutes = require('./routes/lineRoutes'); // นำคอมเมนต์ออก

// Initialize Express app
const app = express();

// Middleware
const corsOptions = {
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => console.log('MongoDB Connection Error:', err));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/line', lineRoutes); // นำคอมเมนต์ออก

// Default route
app.get('/', (req, res) => {
  res.send('ระบบจองคิวและการเรียกเข้าพบ API ทำงานอยู่');
});

// Port
const PORT = process.env.PORT || 5001; // ตรวจสอบว่าพอร์ตถูกต้อง

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});