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
    // สร้างวันที่ปัจจุบันตามเวลาท้องถิ่น
    const now = new Date();
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
        // ใช้โครงสร้างเดียวกับการสร้าง today เพื่อป้องกันปัญหา timezone
        bookingDate = new Date(year, month - 1, day);
      }
    } else {
      // กรณีอื่นๆ ให้ลองแปลงเป็น Date โดยตรง
      bookingDate = new Date(appointmentDate);
    }
    
    // ตั้งเวลาให้เป็น 00:00:00 เพื่อเปรียบเทียบเฉพาะวันที่
    bookingDate.setHours(0, 0, 0, 0);
    
    console.log('Today:', today);
    console.log('Booking date:', bookingDate);
    console.log('Is past date:', bookingDate < today);
    
    // เปรียบเทียบวันที่
    if (bookingDate < today) {
      return res.status(400).json({ message: 'ไม่สามารถจองวันที่ผ่านมาแล้ว' });
    }
    
    // Check if it's Saturday or Sunday (clinic closed)
    const dayOfWeek = bookingDate.getDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return res.status(400).json({ message: 'คลินิกไม่เปิดให้บริการในวันเสาร์และวันอาทิตย์' });
    }
    
    // Check time format and range based on day of week
    const timeFormat = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeFormat.test(appointmentTime)) {
      return res.status(400).json({ message: 'รูปแบบเวลาไม่ถูกต้อง (ต้องเป็น HH:MM)' });
    }
    
    const [hours, minutes] = appointmentTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    
    // Validate time range for all days (Monday-Friday)
    // Monday-Friday (1-5): 16:00 - 20:30
    const minTime = 16 * 60; // 16:00
    const maxTime = 20 * 60 + 30; // 20:30
    const isValidTime = totalMinutes >= minTime && totalMinutes <= maxTime;
    
    if (!isValidTime) {
      return res.status(400).json({ message: 'เวลานัดหมายต้องอยู่ระหว่าง 16:00 น. ถึง 20:30 น.' });
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
      
      console.log('Current time (with buffer):', currentTotalMinutes);
      console.log('Booking time:', totalMinutes);
      console.log('Is past time:', totalMinutes <= currentTotalMinutes);
      
      if (totalMinutes <= currentTotalMinutes) {
        return res.status(400).json({ message: 'ไม่สามารถจองเวลาที่ผ่านไปแล้วหรือใกล้จะถึง (ต้องจองล่วงหน้าอย่างน้อย 30 นาที)' });
      }
    }
    
    // แปลงวันที่ให้อยู่ในรูปแบบที่ถูกต้อง
    const formattedDate = bookingDate.toISOString();
    console.log('Formatted date for getAvailableSlots:', formattedDate);
    
    // Check available slots
    const availableSlots = await Booking.getAvailableSlots(formattedDate);
    console.log('Available slots response:', availableSlots);
    
    if (!availableSlots.available) {
      return res.status(400).json({ message: availableSlots.message || 'ไม่มีคิวว่างในวันที่เลือก' });
    }
    
    if (!availableSlots.availableSlots.includes(appointmentTime)) {
      return res.status(400).json({ message: 'เวลาที่เลือกไม่ว่างหรือไม่ถูกต้อง' });
    }
    
    // Check if user already has a booking for the same date and time
    const existingUserBooking = await Booking.findOne({
      user: req.user._id,
      appointmentDate: {
        $gte: new Date(bookingDate.setHours(0,0,0,0)),
        $lt: new Date(bookingDate.setHours(23,59,59,999))
      },
      appointmentTime: appointmentTime,
      status: { $ne: 'cancelled' }
    });
    
    if (existingUserBooking) {
      return res.status(400).json({ message: 'คุณมีการจองในเวลานี้อยู่แล้ว' });
    }
    
    // Check if there are already 2 bookings for this time slot
    const existingBookingsCount = await Booking.countDocuments({
      appointmentDate: {
        $gte: new Date(bookingDate.setHours(0,0,0,0)),
        $lt: new Date(bookingDate.setHours(23,59,59,999))
      },
      appointmentTime: appointmentTime,
      status: { $ne: 'cancelled' }
    });
    
    console.log('Existing bookings count for this slot:', existingBookingsCount);
    
    if (existingBookingsCount >= 2) {
      return res.status(400).json({ message: 'เวลานี้มีการจองเต็มแล้ว (สูงสุด 2 การจองต่อช่วงเวลา)' });
    }
    
    // Find the total number of bookings for the same date to assign queue number
    const bookingsCount = await Booking.countDocuments({
      appointmentDate: {
        $gte: new Date(bookingDate.setHours(0,0,0,0)),
        $lt: new Date(bookingDate.setHours(23,59,59,999))
      },
      status: { $ne: 'cancelled' }
    });
    
    // Create new booking - ensure appointmentDate is a proper Date object
    const booking = await Booking.create({
      user: req.user._id,
      appointmentDate: bookingDate,
      appointmentTime,
      initialSymptoms,
      status: 'pending', // ตั้งค่าเริ่มต้นเป็น 'pending'
      queueNumber: bookingsCount + 1  // Assign queue number
    });
    
    // Populate user data
    const populatedBooking = await booking.populate('user', 'firstName lastName phone email');
    
    // ปิดการใช้งาน LINE Notify
    
    res.status(201).json(populatedBooking);
  } catch (error) {
    console.error(error);
    
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
    // ดึงข้อมูลการจองของผู้ใช้พร้อมข้อมูลผู้ใช้
    // ปรับปรุงให้ดึงข้อมูลทั้งหมดรวมถึงที่ยกเลิกเพื่อใช้ในหน้าประวัติการจอง
    const bookings = await Booking.find({ 
      user: req.user._id
    })
      .populate('user', 'firstName lastName phone email')
      .sort({ appointmentDate: 1, appointmentTime: 1 });
    
    // แปลงข้อมูลให้อยู่ในรูปแบบที่ frontend ต้องการ
    const formattedBookings = bookings.map(booking => {
      // คำนวณเวลาที่คาดว่าจะเข้าตรวจ (เพิ่ม 10 นาทีจากเวลานัด)
      const [hours, minutes] = booking.appointmentTime.split(':').map(Number);
      let estimatedHours = hours;
      let estimatedMinutes = minutes + 10;
      
      if (estimatedMinutes >= 60) {
        estimatedHours += 1;
        estimatedMinutes -= 60;
      }
      
      const estimatedTime = `${String(estimatedHours).padStart(2, '0')}:${String(estimatedMinutes).padStart(2, '0')}`;
      
      // หาลำดับการจองในวันเดียวกัน (ถ้ายังไม่มีในฐานข้อมูล)
      const queueNumber = booking.queueNumber || 1;
      
      return {
        _id: booking._id,
        user: booking.user,
        appointmentDate: booking.appointmentDate,
        appointmentTime: booking.appointmentTime,
        initialSymptoms: booking.initialSymptoms,
        symptoms: booking.initialSymptoms, // เพิ่มความเข้ากันได้กับหน้าบ้าน
        status: booking.status,
        queueNumber,  // เพิ่มข้อมูลลำดับคิว
        estimatedTime, // เพิ่มข้อมูลเวลาที่คาดว่าจะเข้าตรวจ
        adminNotes: booking.adminNotes, // เพิ่มข้อมูลบันทึกจากแพทย์
        cancelReason: booking.cancelReason, // เพิ่มข้อมูลเหตุผลในการยกเลิก
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt
      };
    });
    
    res.json(formattedBookings);
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
    const booking = await Booking.findById(req.params.id)
      .populate('user', 'firstName lastName phone email');
    
    if (!booking) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลการจอง' });
    }
    
    // Check if the booking belongs to the logged-in user or if user is admin
    if (booking.user._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(401).json({ message: 'ไม่ได้รับอนุญาตให้ดูข้อมูลนี้' });
    }
    
    // คำนวณเวลาที่คาดว่าจะเข้าตรวจ (เพิ่ม 10 นาทีจากเวลานัด)
    const [hours, minutes] = booking.appointmentTime.split(':').map(Number);
    let estimatedHours = hours;
    let estimatedMinutes = minutes + 10;
    
    if (estimatedMinutes >= 60) {
      estimatedHours += 1;
      estimatedMinutes -= 60;
    }
    
    const estimatedTime = `${String(estimatedHours).padStart(2, '0')}:${String(estimatedMinutes).padStart(2, '0')}`;
    
    // หาลำดับการจองในวันเดียวกัน (ถ้ายังไม่มีในฐานข้อมูล)
    const queueNumber = booking.queueNumber || 1;
    
    // เพิ่มข้อมูลที่จำเป็นสำหรับ frontend
    const formattedBooking = {
      ...booking.toObject(),
      queueNumber,
      estimatedTime,
      symptoms: booking.initialSymptoms // เพิ่มความเข้ากันได้กับหน้าบ้าน
    };
    
    res.json(formattedBooking);
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
    if (booking.status !== 'pending' && booking.status !== 'confirmed') {
      return res.status(400).json({ 
        message: `ไม่สามารถยกเลิกการจองได้ สถานะปัจจุบัน: ${booking.status}` 
      });
    }
    
    booking.status = 'cancelled';
    booking.cancelReason = req.body.reason || 'ผู้ใช้ยกเลิก';
    
    const updatedBooking = await booking.save();
    
    // ถ้าต้องการปิดการใช้งาน LINE Notify ในทุกกรณี ให้ลบหรือคอมเมนต์ส่วนนี้ทิ้ง
    /* 
    // แจ้งเตือนการยกเลิกผ่าน Line
    try {
      await lineNotify.sendCancellationNotification(updatedBooking);
    } catch (notifyError) {
      console.error('Failed to send cancellation LINE notification:', notifyError);
      // ไม่ return error response เพื่อให้ API ยังทำงานต่อไปได้
    }
    */
    
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