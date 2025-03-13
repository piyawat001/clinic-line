const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http'); // เพิ่มเข้ามา
const { Server } = require("socket.io"); // เพิ่มเข้ามา

// Load environment variables
dotenv.config();

// Import routes
const userRoutes = require('./routes/userRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const adminRoutes = require('./routes/adminRoutes');
const lineRoutes = require('./routes/lineRoutes');

// Initialize Express app
const app = express();
const server = http.createServer(app); // สร้าง HTTP server
const io = new Server(server, {  // สร้าง Socket.IO server
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Middleware for storing socket map
const userSocketMap = {};
app.set('io', io);
app.set('userSocketMap', userSocketMap);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // เมื่อผู้ใช้ลงทะเบียน socket
  socket.on('register_user', (userId) => {
    console.log(`User ${userId} registered with socket ${socket.id}`);
    userSocketMap[userId] = socket.id;
  });
  
  // เมื่อ socket ขาดการเชื่อมต่อ
  socket.on('disconnect', () => {
    // ลบ socket id จาก map
    Object.keys(userSocketMap).forEach(userId => {
      if (userSocketMap[userId] === socket.id) {
        delete userSocketMap[userId];
        console.log(`User ${userId} disconnected`);
      }
    });
    console.log('User disconnected:', socket.id);
  });
});

// Middleware
const corsOptions = {
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

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
app.use('/api/line', lineRoutes);

// Default route
app.get('/', (req, res) => {
  res.send('ระบบจองคิวและการเรียกเข้าพบ API ทำงานอยู่');
});

// Port
const PORT = process.env.PORT || 5001;

// Start server (ใช้ server แทน app)
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});