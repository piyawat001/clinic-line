const Booking = require('../models/Booking');
const User = require('../models/User');
const lineNotify = require('../utils/lineNotify');

// @desc    Create a new booking
// @route   POST /api/bookings
// @access  Private
exports.createBooking = async (req, res) => {
    try {
      const { appointmentDate, appointmentTime, initialSymptoms } = req.body;
      
      // Validate appointment date is not in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const bookingDate = new Date(appointmentDate);
      bookingDate.setHours(0, 0, 0, 0);
      
      if (bookingDate < today) {
        return res.status(400).json({ message: 'ไม่สามารถจองวันที่ผ่านมาแล้ว' });
      }
      
      // Check if it's weekend (Saturday or Sunday)
      const dayOfWeek = bookingDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return res.status(400).json({ message: 'ไม่สามารถจองในวันเสาร์และวันอาทิตย์' });
      }
      
      // Check available slots
      const availableSlots = await Booking.getAvailableSlots(appointmentDate);
      
      if (!availableSlots.available) {
        return res.status(400).json({ message: availableSlots.message || 'ไม่มีคิวว่างในวันที่เลือก' });
      }
      
      if (!availableSlots.availableSlots.includes(appointmentTime)) {
        return res.status(400).json({ message: 'เวลาที่เลือกไม่ว่างหรือไม่ถูกต้อง' });
      }
      
      // Create new booking
      const booking = await Booking.create({
        user: req.user._id,
        appointmentDate,
        appointmentTime,
        initialSymptoms
      });
      
      // Populate user data
      const populatedBooking = await booking.populate('user', 'firstName lastName phone email');
      
      // ส่ง LINE notification แบบมี try-catch เพื่อให้แอปยังทำงานได้แม้การส่งแจ้งเตือนล้มเหลว
      try {
        await lineNotify.sendBookingConfirmation(populatedBooking);
      } catch (notifyError) {
        console.error('Failed to send LINE notification:', notifyError);
        // ไม่ return error response เพื่อให้ API ยังทำงานต่อไปได้
      }
      
      res.status(201).json(populatedBooking);
    } catch (error) {
      console.error(error);
      
      // Handle duplicate booking error
      if (error.code === 11000) {
        return res.status(400).json({ message: 'เวลานี้ถูกจองแล้ว กรุณาเลือกเวลาอื่น' });
      }
      
      res.status(500).json({
        message: 'เกิดข้อผิดพลาดในการจองคิว',
        error: error.message
      });
    }
  };

// @desc    Get user bookings
// @route   GET /api/bookings
// @access  Private
exports.getUserBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user._id })
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

// @desc    Get booking by ID
// @route   GET /api/bookings/:id
// @access  Private
exports.getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลการจอง' });
    }
    
    // Check if the booking belongs to the logged-in user or if user is admin
    if (booking.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(401).json({ message: 'ไม่ได้รับอนุญาตให้ดูข้อมูลนี้' });
    }
    
    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลการจอง',
      error: error.message
    });
  }
};

// @desc    Cancel booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลการจอง' });
    }
    
    // Check if the booking belongs to the logged-in user or if user is admin
    if (booking.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(401).json({ message: 'ไม่ได้รับอนุญาตให้ยกเลิกการจองนี้' });
    }
    
    // Check if booking can be cancelled (not already cancelled or completed)
    if (booking.status !== 'pending') {
      return res.status(400).json({ 
        message: `ไม่สามารถยกเลิกการจองได้ สถานะปัจจุบัน: ${booking.status}` 
      });
    }
    
    booking.status = 'cancelled';
    booking.cancelReason = req.body.reason || 'ผู้ใช้ยกเลิก';
    
    const updatedBooking = await booking.save();
    
    // Here you would send LINE notification for cancellation
    // lineNotify.sendCancellationNotification(updatedBooking);
    
    res.json(updatedBooking);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการยกเลิกการจอง',
      error: error.message
    });
  }
};

// @desc    Get available slots for a date
// @route   GET /api/bookings/available-slots/:date
// @access  Private
exports.getAvailableSlots = async (req, res) => {
  try {
    const date = req.params.date;
    
    const availableSlots = await Booking.getAvailableSlots(date);
    
    res.json(availableSlots);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคิวว่าง',
      error: error.message
    });
  }
};