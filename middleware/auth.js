const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - verify token
exports.protect = async (req, res, next) => {
  let token;
  
  // Check if token exists in headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];
      
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');
      
      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: 'ไม่ได้รับอนุญาต โทเค็นไม่ถูกต้อง' });
    }
  }
  
  if (!token) {
    res.status(401).json({ message: 'ไม่ได้รับอนุญาต ไม่มีโทเค็น' });
  }
};

// Admin middleware
exports.admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(401).json({ message: 'ไม่ได้รับอนุญาต เฉพาะผู้ดูแลระบบเท่านั้น' });
  }
};