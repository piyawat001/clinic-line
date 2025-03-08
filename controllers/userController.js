const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
exports.registerUser = async (req, res) => {
  try {
    const { firstName, lastName, phone, email, password } = req.body;

    // Check if user exists by email or phone
    const userExists = await User.findOne({ 
      $or: [{ email }, { phone }]
    });

    if (userExists) {
      if (userExists.email === email) {
        return res.status(400).json({ message: 'อีเมลนี้ถูกใช้งานแล้ว' });
      }
      if (userExists.phone === phone) {
        return res.status(400).json({ message: 'เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว' });
      }
    }

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      phone,
      email,
      password,
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'ข้อมูลผู้ใช้ไม่ถูกต้อง' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการลงทะเบียน',
      error: error.message,
    });
  }
};

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    res.json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      isAdmin: user.isAdmin,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ',
      error: error.message,
    });
  }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้',
      error: error.message,
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
    }

    // Update fields if provided
    user.firstName = req.body.firstName || user.firstName;
    user.lastName = req.body.lastName || user.lastName;
    user.phone = req.body.phone || user.phone;
    user.email = req.body.email || user.email;
    
    // Update address if provided
    if (req.body.address) {
      user.address = {
        street: req.body.address.street || user.address?.street,
        city: req.body.address.city || user.address?.city,
        district: req.body.address.district || user.address?.district,
        province: req.body.address.province || user.address?.province,
        postalCode: req.body.address.postalCode || user.address?.postalCode
      };
    }
    
    // Update password if provided
    if (req.body.password) {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      phone: updatedUser.phone,
      address: updatedUser.address,
      token: generateToken(updatedUser._id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการอัพเดทข้อมูลผู้ใช้',
      error: error.message,
    });
  }
};

// ฟังก์ชันที่อาจจะหายไป - เพิ่มต่อท้ายไฟล์ controllers/userController.js

// @desc    Connect LINE user ID to account
// @route   PUT /api/users/connect-line
// @access  Private
exports.connectLineAccount = async (req, res) => {
    try {
      const { lineUserId } = req.body;
  
      const user = await User.findById(req.user._id);
  
      if (!user) {
        return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
      }
  
      user.lineUserId = lineUserId;
      const updatedUser = await user.save();
  
      res.json({
        message: 'เชื่อมต่อบัญชี LINE สำเร็จ',
        lineUserId: updatedUser.lineUserId
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'เกิดข้อผิดพลาดในการเชื่อมต่อบัญชี LINE',
        error: error.message,
      });
    }
  };
  
  // @desc    Change password
  // @route   PUT /api/users/change-password
  // @access  Private
  exports.changePassword = async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
  
      const user = await User.findById(req.user._id);
  
      if (!user) {
        return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
      }
  
      // Check current password
      const isMatch = await user.matchPassword(currentPassword);
  
      if (!isMatch) {
        return res.status(401).json({ message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
      }
  
      // Update password
      user.password = newPassword;
      await user.save();
  
      res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน',
        error: error.message,
      });
    }
  };