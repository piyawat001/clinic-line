const Booking = require('../models/Booking');
const User = require('../models/User');

// @desc    Get all bookings
// @route   GET /api/admin/bookings
// @access  Private/Admin
exports.getAllBookings = async (req, res) => {
  try {
    // Allow filtering by date, status, etc.
    const { date, status } = req.query;
    const filter = {};
    
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      filter.appointmentDate = { $gte: startDate, $lte: endDate };
    }
    
    if (status) {
      filter.status = status;
    }
    
    const bookings = await Booking.find(filter)
      .populate('user', 'firstName lastName phone email')
      .sort({ appointmentDate: 1, appointmentTime: 1 });
    
    res.json(bookings);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลการจอง',
      error: error.message
    });
  }
};

// @desc    Update booking status
// @route   PUT /api/admin/bookings/:id
// @access  Private/Admin
exports.updateBookingStatus = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลการจอง' });
    }
    
    booking.status = status || booking.status;
    
    if (adminNotes) {
      booking.adminNotes = adminNotes;
    }
    
    const updatedBooking = await booking.save();
    
    // Here you would send LINE notification for status update
    // lineNotify.sendStatusUpdateNotification(updatedBooking);
    
    res.json(updatedBooking);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการอัพเดทสถานะการจอง',
      error: error.message
    });
  }
};

// @desc    Call user for appointment
// @route   PUT /api/admin/bookings/:id/call
// @access  Private/Admin
exports.callUserForAppointment = async (req, res) => {
  try {
    let { callTime } = req.body;
    
    if (!callTime) {
      callTime = new Date();
    }
    
    const booking = await Booking.findById(req.params.id).populate('user', 'firstName lastName phone lineUserId');
    
    if (!booking) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลการจอง' });
    }
    
    booking.callTime = new Date(callTime);
    booking.status = 'completed'; // หรือสถานะอื่นที่มีอยู่ในเงื่อนไข enum
    
    const updatedBooking = await booking.save();
    
    // ส่งแจ้งเตือนผ่าน Socket.IO
    const io = req.app.get('io');
    const userSocketMap = req.app.get('userSocketMap');
    const userSocketId = userSocketMap[booking.user._id.toString()];
    
    if (userSocketId) {
      io.to(userSocketId).emit('queue_called', {
        bookingId: booking._id,
        message: 'ถึงคิวของคุณแล้ว กรุณาเข้าพบแพทย์',
        timestamp: new Date()
      });
      console.log('Notification sent to user:', booking.user._id);
    } else {
      console.log('User not connected:', booking.user._id);
    }
    
    res.json({
      message: 'ส่งการเรียกผู้ใช้สำเร็จ',
      booking: updatedBooking
    });
  } catch (error) {
    console.error('Call User Error:', error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการเรียกผู้ใช้',
      error: error.message
    });
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้',
      error: error.message
    });
  }
};

// @desc    Get booking statistics
// @route   GET /api/admin/statistics
// @access  Private/Admin
exports.getBookingStatistics = async (req, res) => {
  try {
    // Total bookings
    const totalBookings = await Booking.countDocuments();
    
    // Bookings by status
    const pendingBookings = await Booking.countDocuments({ status: 'pending' });
    const successBookings = await Booking.countDocuments({ 
      $or: [{ status: 'success' }, { status: 'completed' }] 
    });
    const cancelledBookings = await Booking.countDocuments({ status: 'cancelled' });
    
    // Today's bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayBookings = await Booking.countDocuments({ 
      appointmentDate: { $gte: today, $lt: tomorrow }
    });
    
    // User statistics
    const totalUsers = await User.countDocuments();
    
    res.json({
      totalBookings,
      pendingBookings,
      successBookings,
      cancelledBookings,
      todayBookings,
      totalUsers
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติ',
      error: error.message
    });
  }
};


// @desc    Get bookings count by day for the last 7 days
// @route   GET /api/admin/bookings/by-day
// @access  Private/Admin
exports.getBookingsByDay = async (req, res) => {
  try {
    // Get current date and set to beginning of the day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get date 7 days ago
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    
    // Array to hold our results
    const results = [];
    
    // Loop through each day and count bookings
    for (let i = 0; i < 7; i++) {
      const date = new Date(sevenDaysAgo);
      date.setDate(date.getDate() + i);
      
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      
      // Count bookings for this day
      const count = await Booking.countDocuments({
        appointmentDate: {
          $gte: date,
          $lt: nextDay
        }
      });
      
      results.push({
        date: date.toISOString().split('T')[0], // Format as YYYY-MM-DD
        count: count
      });
    }
    
    res.json(results);
  } catch (error) {
    console.error('Error fetching bookings by day:', error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลการนัดหมายรายวัน',
      error: error.message
    });
  }
};