const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    appointmentDate: {
      type: Date,
      required: [true, 'กรุณาระบุวันที่นัดหมาย']
    },
    appointmentTime: {
      type: String,
      required: [true, 'กรุณาระบุเวลานัดหมาย'],
      validate: {
        validator: function(time) {
          // Validate time format (HH:MM)
          const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(time)) return false;
          
          // Validate time range based on day of week
          const timeValue = time.split(':');
          const hours = parseInt(timeValue[0]);
          const minutes = parseInt(timeValue[1]);
          
          const totalMinutes = hours * 60 + minutes;
          
          // Check if valid time based on appointment date's day of week
          const appointmentDay = new Date(this.appointmentDate).getDay();
          
          // Monday-Wednesday (1-3): 16:00 - 21:00
          if (appointmentDay >= 1 && appointmentDay <= 3) {
            const minTime = 16 * 60; // 16:00
            const maxTime = 20 * 60 + 30; // 20:30 (last appointment)
            return totalMinutes >= minTime && totalMinutes <= maxTime;
          }
          
          // Saturday-Sunday (0, 6): 09:00 - 21:00
          if (appointmentDay === 0 || appointmentDay === 6) {
            const minTime = 9 * 60; // 09:00
            const maxTime = 20 * 60 + 30; // 20:30 (last appointment)
            return totalMinutes >= minTime && totalMinutes <= maxTime;
          }
          
          // Thursday-Friday (4-5): Clinic closed
          return false;
        },
        message: props => {
          const appointmentDay = new Date(this.appointmentDate).getDay();
          if (appointmentDay >= 1 && appointmentDay <= 3) {
            return 'เวลานัดหมายต้องอยู่ระหว่าง 16:00 น. ถึง 20:30 น. สำหรับวันจันทร์-พุธ';
          } else if (appointmentDay === 0 || appointmentDay === 6) {
            return 'เวลานัดหมายต้องอยู่ระหว่าง 09:00 น. ถึง 20:30 น. สำหรับวันเสาร์-อาทิตย์';
          } else {
            return 'คลินิกไม่เปิดให้บริการในวันพฤหัสบดีและวันศุกร์';
          }
        }
      }
    },
    initialSymptoms: {
      type: String,
      required: [true, 'กรุณาระบุอาการเบื้องต้น']
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'cancelled'],
      default: 'pending'
    },
    callTime: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Create a compound index for appointmentDate and appointmentTime to ensure uniqueness
bookingSchema.index({ appointmentDate: 1, appointmentTime: 1 }, { unique: true });

// Static method to check available slots for a given date
bookingSchema.statics.getAvailableSlots = async function(date) {
  // แปลงข้อมูลวันที่ให้เป็น Date object ที่ถูกต้อง
  let startDate;
  
  try {
    if (date === undefined || date === null) {
      throw new Error('Date parameter is required');
    }
    
    if (typeof date === 'string') {
      if (date.includes('T')) {
        // กรณีเป็น ISO string
        startDate = new Date(date);
      } else {
        // กรณีเป็น YYYY-MM-DD
        const [year, month, day] = date.split('-').map(Number);
        
        // Validate date parts
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
          throw new Error('Invalid date format. Expected YYYY-MM-DD');
        }
        
        startDate = new Date(year, month - 1, day); // ลบ 1 จากเดือนเพราะ JS เริ่มที่ 0
      }
    } else if (date instanceof Date) {
      // กรณีเป็น Date object
      startDate = new Date(date);
    } else {
      // กรณีอื่นๆ
      throw new Error('Invalid date format');
    }
    
    // Validate that the date is valid
    if (isNaN(startDate.getTime())) {
      throw new Error('Invalid date');
    }
    
    // ตั้งเวลาเป็น 00:00:00
    startDate.setHours(0, 0, 0, 0);
    
    // ตั้งเวลาสิ้นสุดเป็น 23:59:59
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);
    
    // Get all bookings for the selected date
    const bookings = await this.find({
      appointmentDate: { $gte: startDate, $lte: endDate },
      status: { $ne: 'cancelled' }
    });
    
    // Get the day of the week (0 = Sunday, 6 = Saturday)
    const dayOfWeek = startDate.getDay();
    
    // Define time slots based on day of week
    const allTimeSlots = [];
    
    // Thursday-Friday (clinic closed)
    if (dayOfWeek === 4 || dayOfWeek === 5) {
      return { 
        available: false, 
        message: 'คลินิกไม่เปิดให้บริการในวันพฤหัสบดีและวันศุกร์',
        availableSlots: [],
        bookedSlots: []
      };
    }
    
    // Monday-Wednesday (16:00 - 20:30)
    if (dayOfWeek >= 1 && dayOfWeek <= 3) {
      for (let hour = 16; hour <= 20; hour++) {
        for (let minute = 0; minute <= 30; minute += 30) {
          // Skip 21:00 slot
          if (hour === 20 && minute > 30) continue;
          
          const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          allTimeSlots.push(timeStr);
        }
      }
    }
    
    // Saturday-Sunday (09:00 - 20:30)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      for (let hour = 9; hour <= 20; hour++) {
        for (let minute = 0; minute <= 30; minute += 30) {
          // Skip 21:00 slot
          if (hour === 20 && minute > 30) continue;
          
          const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          allTimeSlots.push(timeStr);
        }
      }
    }
    
    // Get booked time slots
    const bookedTimeSlots = bookings.map(booking => booking.appointmentTime);
    
    // Calculate available slots
    const availableSlots = allTimeSlots.filter(time => !bookedTimeSlots.includes(time));
    
    // Check if current time is past for today's slots
    const now = new Date();
    if (startDate.toDateString() === now.toDateString()) {
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTotalMinutes = currentHour * 60 + currentMinute + 30; // Add 30 minutes buffer
      
      // Filter out past time slots
      return {
        available: availableSlots.length > 0,
        availableSlots: availableSlots.filter(time => {
          const [hours, minutes] = time.split(':').map(Number);
          const slotTotalMinutes = hours * 60 + minutes;
          return slotTotalMinutes > currentTotalMinutes;
        }),
        bookedSlots: bookedTimeSlots
      };
    }
    
    return {
      available: availableSlots.length > 0,
      availableSlots,
      bookedSlots: bookedTimeSlots
    };
  } catch (error) {
    console.error('Error in getAvailableSlots:', error);
    return {
      available: false,
      message: `เกิดข้อผิดพลาดในการค้นหาเวลานัดหมาย: ${error.message}`,
      availableSlots: [],
      bookedSlots: []
    };
  }
};

// Create Booking model
const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;