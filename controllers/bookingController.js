const Booking = require('../models/Booking');
const User = require('../models/User');
const lineNotify = require('../utils/lineNotify');

// @desc    Create a new booking
// @route   POST /api/bookings
// @access  Private
exports.createBooking = async (req, res) => {
    try {
      const { appointmentDate, appointmentTime, initialSymptoms } = req.body;
      
      // แก้ไขการตรวจสอบวันที่โดยคำนึงถึง timezone ของไทย (GMT+7)
      // สร้างวันที่ปัจจุบันในเวลา 00:00:00 ของไทย
      const now = new Date();
      const thaiOffset = 7 * 60; // ประเทศไทย GMT+7 (7 ชั่วโมง = 420 นาที)
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // แปลงวันที่นัดหมายให้เป็น Date object
      let bookingDate;
      
      // ตรวจสอบรูปแบบข้อมูลวันที่ที่ส่งมา
      if (typeof appointmentDate === 'string') {
        if (appointmentDate.includes('T')) {
          // กรณีเป็น ISO string
          bookingDate = new Date(appointmentDate);
        } else {
          // กรณีเป็น YYYY-MM-DD
          const [year, month, day] = appointmentDate.split('-').map(Number);
          bookingDate = new Date(year, month - 1, day); // ลบ 1 จากเดือนเพราะ JS เริ่มที่ 0
        }
      } else {
        // กรณีอื่นๆ ให้ลองแปลงเป็น Date โดยตรง
        bookingDate = new Date(appointmentDate);
      }
      
      // ตั้งเวลาให้เป็น 00:00:00 เพื่อเปรียบเทียบเฉพาะวันที่
      bookingDate.setHours(0, 0, 0, 0);
      
      console.log('Today (Thailand):', today);
      console.log('Booking date:', bookingDate);
      
      // เปรียบเทียบวันที่
      if (bookingDate < today) {
        return res.status(400).json({ message: 'ไม่สามารถจองวันที่ผ่านมาแล้ว' });
      }
      
      // Check if it's Thursday or Friday (clinic closed)
      const dayOfWeek = bookingDate.getDay(); // 0 = Sunday, 6 = Saturday
      if (dayOfWeek === 4 || dayOfWeek === 5) {
        return res.status(400).json({ message: 'คลินิกไม่เปิดให้บริการในวันพฤหัสบดีและวันศุกร์' });
      }
      
      // Check time format and range based on day of week
      const timeFormat = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeFormat.test(appointmentTime)) {
        return res.status(400).json({ message: 'รูปแบบเวลาไม่ถูกต้อง (ต้องเป็น HH:MM)' });
      }
      
      const [hours, minutes] = appointmentTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes;
      
      // Validate time range based on day of week
      let isValidTime = false;
      
      // Monday-Wednesday (1-3): 16:00 - 20:30
      if (dayOfWeek >= 1 && dayOfWeek <= 3) {
        const minTime = 16 * 60; // 16:00
        const maxTime = 20 * 60 + 30; // 20:30
        isValidTime = totalMinutes >= minTime && totalMinutes <= maxTime;
        if (!isValidTime) {
          return res.status(400).json({ message: 'เวลานัดหมายต้องอยู่ระหว่าง 16:00 น. ถึง 20:30 น. สำหรับวันจันทร์-พุธ' });
        }
      }
      
      // Saturday-Sunday (0, 6): 09:00 - 20:30
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        const minTime = 9 * 60; // 09:00
        const maxTime = 20 * 60 + 30; // 20:30
        isValidTime = totalMinutes >= minTime && totalMinutes <= maxTime;
        if (!isValidTime) {
          return res.status(400).json({ message: 'เวลานัดหมายต้องอยู่ระหว่าง 09:00 น. ถึง 20:30 น. สำหรับวันเสาร์-อาทิตย์' });
        }
      }
      
      // Check if time slot is for every 30 minutes (xx:00 or xx:30)
      if (minutes !== 0 && minutes !== 30) {
        return res.status(400).json({ message: 'เวลานัดหมายต้องเป็น XX:00 หรือ XX:30 เท่านั้น' });
      }
      
      // If booking is for today, check if time is in the past
      if (bookingDate.getTime() === today.getTime()) {
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTotalMinutes = currentHour * 60 + currentMinute + 30; // Add 30 minutes buffer
        
        if (totalMinutes <= currentTotalMinutes) {
          return res.status(400).json({ message: 'ไม่สามารถจองเวลาที่ผ่านไปแล้วหรือใกล้จะถึง (ต้องจองล่วงหน้าอย่างน้อย 30 นาที)' });
        }
      }
      
      // Check available slots - Convert appointmentDate to ISO string format for consistent handling
      let formattedDate;
      if (typeof appointmentDate === 'string' && appointmentDate.includes('T')) {
        formattedDate = appointmentDate;
      } else {
        formattedDate = bookingDate.toISOString();
      }
      
      const availableSlots = await Booking.getAvailableSlots(formattedDate);
      
      if (!availableSlots.available) {
        return res.status(400).json({ message: availableSlots.message || 'ไม่มีคิวว่างในวันที่เลือก' });
      }
      
      if (!availableSlots.availableSlots.includes(appointmentTime)) {
        return res.status(400).json({ message: 'เวลาที่เลือกไม่ว่างหรือไม่ถูกต้อง' });
      }
      
      // Create new booking - ensure appointmentDate is a proper Date object
      const booking = await Booking.create({
        user: req.user._id,
        appointmentDate: bookingDate,
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
    
    // Add logging to troubleshoot date format issues
    console.log('Received date parameter:', date, 'Type:', typeof date);
    
    if (!date) {
      return res.status(400).json({
        message: 'กรุณาระบุวันที่'
      });
    }
    
    // Format the date consistently before passing to the model
    let formattedDate;
    
    try {
      // First try parsing as a valid date format
      if (date.includes('T')) {
        // Already in ISO format
        formattedDate = date;
      } else if (date.includes('-')) {
        // Looks like YYYY-MM-DD format, validate it
        const [year, month, day] = date.split('-').map(Number);
        
        // Check if all parts are valid numbers
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
          throw new Error('Invalid date format');
        }
        
        // Create a new date and convert to ISO string
        const dateObj = new Date(year, month - 1, day);
        
        // Check if resulting date is valid
        if (isNaN(dateObj.getTime())) {
          throw new Error('Invalid date'); 
        }
        
        formattedDate = dateObj.toISOString();
      } else {
        // Try to parse as timestamp or other format
        const dateObj = new Date(date);
        
        if (isNaN(dateObj.getTime())) {
          throw new Error('Invalid date format');
        }
        
        formattedDate = dateObj.toISOString();
      }
    } catch (error) {
      return res.status(400).json({
        message: 'รูปแบบวันที่ไม่ถูกต้อง กรุณาระบุวันที่ในรูปแบบ YYYY-MM-DD',
        error: error.message
      });
    }
    
    console.log('Formatted date for getAvailableSlots:', formattedDate);
    
    const availableSlots = await Booking.getAvailableSlots(formattedDate);
    
    res.json(availableSlots);
  } catch (error) {
    console.error('Error in getAvailableSlots controller:', error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคิวว่าง',
      error: error.message
    });
  }
};