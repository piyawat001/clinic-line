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
          
          // Validate time range (16:00 - 20:30)
          const timeValue = time.split(':');
          const hours = parseInt(timeValue[0]);
          const minutes = parseInt(timeValue[1]);
          
          const totalMinutes = hours * 60 + minutes;
          const minTime = 16 * 60; // 16:00
          const maxTime = 20 * 60 + 30; // 20:30
          
          return totalMinutes >= minTime && totalMinutes <= maxTime;
        },
        message: 'เวลานัดหมายต้องอยู่ระหว่าง 16:00 น. ถึง 20:30 น.'
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
  // Convert date string to Date object and set to start of day
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  
  // Set end date to end of the day
  const endDate = new Date(startDate);
  endDate.setHours(23, 59, 59, 999);
  
  // Get all bookings for the selected date
  const bookings = await this.find({
    appointmentDate: { $gte: startDate, $lte: endDate },
    status: { $ne: 'cancelled' }
  });
  
  // Get the day of the week (0 = Sunday, 6 = Saturday)
  const dayOfWeek = startDate.getDay();
  
  // Check if it's weekend (Saturday or Sunday)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { available: false, message: 'ไม่สามารถจองในวันเสาร์และวันอาทิตย์' };
  }
  
  // Define time slots (30 minute intervals from 16:00 to 20:30)
  const allTimeSlots = [];
  for (let hour = 16; hour <= 20; hour++) {
    for (let minute = 0; minute <= 30; minute += 30) {
      // Skip 21:00 slot
      if (hour === 20 && minute > 30) continue;
      
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      allTimeSlots.push(timeStr);
    }
  }
  
  // Get booked time slots
  const bookedTimeSlots = bookings.map(booking => booking.appointmentTime);
  
  // Calculate available slots
  const availableSlots = allTimeSlots.filter(time => !bookedTimeSlots.includes(time));
  
  // Calculate slots capacity (2 people per 30 minutes, max 24 per day)
  const totalBookings = bookings.length;
  const remainingCapacity = 24 - totalBookings;
  
  return {
    available: remainingCapacity > 0,
    availableSlots,
    bookedSlots: bookedTimeSlots,
    remainingCapacity
  };
};

// Create Booking model
const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;