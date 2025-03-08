const Booking = require('../models/Booking');
const User = require('../models/User');
const lineNotify = require('../utils/lineNotify');

// Helper function to validate date and time
const isValidDateAndTime = (date, time) => {
  // Check if date is in the future
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const appointmentDate = new Date(date);
  appointmentDate.setHours(0, 0, 0, 0);
  
  if (appointmentDate < today) {
    return {
      valid: false,
      message: 'ไม่สามารถเลือกวันที่ในอดีตได้'
    };
  }
  
  // Validate time format and range
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(time)) {
    return {
      valid: false,
      message: 'รูปแบบเวลาไม่ถูกต้อง'
    };
  }
  
  // Check time is within business hours (16:00 - 20:30)
  const timeValue = time.split(':');
  const hours = parseInt(timeValue[0]);
  const minutes = parseInt(timeValue[1]);
  
  const totalMinutes = hours * 60 + minutes;
  const minTime = 16 * 60; // 16:00
  const maxTime = 20 * 60 + 30; // 20:30
  
  if (totalMinutes < minTime || totalMinutes > maxTime) {
    return {
      valid: false,
      message: 'เวลาต้องอยู่ระหว่าง 16:00 น. ถึง 20:30 น.'
    };
  }
  
  // Check if minutes are either 00 or 30 (30-minute intervals)
  if (minutes !== 0 && minutes !== 30) {
    return {
      valid: false,
      message: 'เวลาต้องเป็นช่วงละ 30 นาที (เช่น 16:00, 16:30)'
    };
  }
  
  // Check if date is weekend
  const dayOfWeek = appointmentDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      valid: false,
      message: 'ไม่สามารถจองในวันเสาร์และวันอาทิตย์'
    };
  }
  
  return { valid: true };
};

// @desc    Create a new booking
// @route   POST /api/bookings
// @access  Private
exports.createBooking = async (req, res) => {
  try {
    const { appointmentDate, appointmentTime, initialSymptoms } = req.body;
    
    // Validate date and time
    const validation = isValidDateAndTime(appointmentDate, appointmentTime);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }
    
    // Check if slot is available for this date and time
    const startDate = new Date(appointmentDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(appointmentDate);
    endDate.setHours(23, 59, 59, 999);
    
    const existingBookings = await Booking.find({
      appointmentDate: { $gte: startDate, $lte: endDate },
      appointmentTime: appointmentTime,
      status: { $ne: 'cancelled' }
    });
    
    // Check if maximum of 2 bookings per time slot
    if (existingBookings.length >= 2) {
      return res.status(400).json({ message: 'เวลานี้ถูกจองเต็มแล้ว กรุณาเลือกเวลาอื่น' });
    }
    
    // Check if maximum of 24 bookings per day
    const dayBookings = await Booking.find({
      appointmentDate: { $gte: startDate, $lte: endDate },
      status: { $ne: 'cancelled' }
    });
    
    if (dayBookings.length >= 24) {
      return res.status(400).json({ message: 'คิววันนี้เต็มแล้ว กรุณาเลือกวันอื่น' });
    }
    
    // Create new booking
    const booking = await Booking.create({
      user: req.user._id,
      appointmentDate,
      appointmentTime,
      initialSymptoms
    });
    
    // Populate user data
    const populatedBooking = await booking.populate('user', 'firstName lastName phone email lineUserId');
    
    // ส่ง LINE notification - ใส่ try-catch เพื่อไม่ให้กระทบการทำงานหลัก
    try {
      await lineNotify.sendBookingConfirmation(populatedBooking);
      console.log('Sent booking confirmation notification');
    } catch (notifyError) {
      console.error('Failed to send LINE notification:', notifyError);
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
    const booking = await Booking.findById(req.params.id).populate('user', 'firstName lastName phone email');
    
    if (!booking) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลการจอง' });
    }
    
    // Check if the booking belongs to the logged-in user or if user is admin
    if (booking.user._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
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
    const booking = await Booking.findById(req.params.id).populate('user', 'firstName lastName phone email lineUserId');
    
    if (!booking) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลการจอง' });
    }
    
    // Check if the booking belongs to the logged-in user or if user is admin
    if (booking.user._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
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
    
    // ส่งการแจ้งเตือนการยกเลิกผ่าน LINE
    try {
      await lineNotify.sendCancellationNotification(updatedBooking);
      console.log('Sent cancellation notification');
    } catch (notifyError) {
      console.error('Failed to send LINE cancellation notification:', notifyError);
    }
    
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
    
    // Convert date string to Date object and set to start of day
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    // Set end date to end of the day
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);
    
    // Check if it's weekend (Saturday or Sunday)
    const dayOfWeek = startDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return res.status(400).json({ 
        available: false, 
        message: 'ไม่สามารถจองในวันเสาร์และวันอาทิตย์'
      });
    }
    
    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate < today) {
      return res.status(400).json({ 
        available: false, 
        message: 'ไม่สามารถจองวันที่ผ่านมาแล้ว'
      });
    }
    
    // Get all bookings for the selected date
    const bookings = await Booking.find({
      appointmentDate: { $gte: startDate, $lte: endDate },
      status: { $ne: 'cancelled' }
    });
    
    // Define time slots (30 minute intervals from 16:00 to 20:30)
    const allTimeSlots = [];
    for (let hour = 16; hour <= 20; hour++) {
      for (let minute = 0; minute <= 30; minute += 30) {
        // Skip slots after 20:30
        if (hour === 20 && minute > 30) continue;
        
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        allTimeSlots.push(timeStr);
      }
    }
    
    // Count bookings per time slot
    const bookingsPerTimeSlot = {};
    allTimeSlots.forEach(time => {
      bookingsPerTimeSlot[time] = 0;
    });
    
    bookings.forEach(booking => {
      if (bookingsPerTimeSlot[booking.appointmentTime] !== undefined) {
        bookingsPerTimeSlot[booking.appointmentTime]++;
      }
    });
    
    // Calculate available slots (max 2 bookings per slot)
    const availableSlots = [];
    const bookedSlots = [];
    
    Object.keys(bookingsPerTimeSlot).forEach(time => {
      if (bookingsPerTimeSlot[time] < 2) {
        availableSlots.push(time);
      } else {
        bookedSlots.push(time);
      }
    });
    
    // Calculate slots capacity (max 24 per day)
    const totalBookings = bookings.length;
    const remainingCapacity = 24 - totalBookings;
    
    res.json({
      available: remainingCapacity > 0 && availableSlots.length > 0,
      availableSlots,
      bookedSlots,
      remainingCapacity,
      totalBookings,
      date: startDate.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคิวว่าง',
      error: error.message
    });
  }
};

// @desc    Update booking (admin only)
// @route   PUT /api/bookings/:id
// @access  Private/Admin
exports.updateBooking = async (req, res) => {
  try {
    const { appointmentDate, appointmentTime, initialSymptoms, status, adminNotes } = req.body;
    
    const booking = await Booking.findById(req.params.id).populate('user', 'firstName lastName phone email lineUserId');
    
    if (!booking) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลการจอง' });
    }
    
    // Check if user is admin (unless they own the booking and are just updating symptoms)
    if (!req.user.isAdmin && booking.user._id.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'ไม่ได้รับอนุญาตให้แก้ไขการจองนี้' });
    }
    
    // Regular users can only update initialSymptoms of their own bookings
    if (!req.user.isAdmin && (
      appointmentDate || appointmentTime || status || adminNotes
    )) {
      return res.status(401).json({ message: 'ผู้ใช้ทั่วไปสามารถแก้ไขได้เฉพาะอาการเบื้องต้นเท่านั้น' });
    }
    
    // Validate date and time if changing
    if (appointmentDate && appointmentTime) {
      const validation = isValidDateAndTime(appointmentDate, appointmentTime);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.message });
      }
      
      // Check if slot is available (excluding this booking)
      const startDate = new Date(appointmentDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(appointmentDate);
      endDate.setHours(23, 59, 59, 999);
      
      const existingBookings = await Booking.find({
        _id: { $ne: req.params.id },
        appointmentDate: { $gte: startDate, $lte: endDate },
        appointmentTime: appointmentTime,
        status: { $ne: 'cancelled' }
      });
      
      if (existingBookings.length >= 2) {
        return res.status(400).json({ message: 'เวลานี้ถูกจองเต็มแล้ว กรุณาเลือกเวลาอื่น' });
      }
    }
    
    // Update booking fields if provided
    if (appointmentDate) booking.appointmentDate = appointmentDate;
    if (appointmentTime) booking.appointmentTime = appointmentTime;
    if (initialSymptoms) booking.initialSymptoms = initialSymptoms;
    
    // Admin only fields
    if (req.user.isAdmin) {
      if (status) booking.status = status;
      if (adminNotes) booking.adminNotes = adminNotes;
    }
    
    const updatedBooking = await booking.save();
    
    // ส่งการแจ้งเตือนอัพเดทสถานะผ่าน LINE ถ้ามีการเปลี่ยนสถานะ
    if (status && status !== booking.status) {
      try {
        await lineNotify.sendStatusUpdateNotification(updatedBooking);
        console.log('Sent status update notification');
      } catch (notifyError) {
        console.error('Failed to send LINE status update notification:', notifyError);
      }
    }
    
    res.json(updatedBooking);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการอัพเดทการจอง',
      error: error.message
    });
  }
};

module.exports = exports;