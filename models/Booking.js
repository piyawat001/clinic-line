const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    appointmentDate: {
      type: Date,
      required: [true, "กรุณาระบุวันที่นัดหมาย"],
    },
    appointmentTime: {
      type: String,
      required: [true, "กรุณาระบุเวลานัดหมาย"],
      validate: {
        validator: function (time) {
          // Validate time format (HH:MM)
          const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(time)) return false;

          // Validate time range based on day of week
          const timeValue = time.split(":");
          const hours = parseInt(timeValue[0]);
          const minutes = parseInt(timeValue[1]);

          const totalMinutes = hours * 60 + minutes;

          // Check if valid time based on appointment date's day of week
          const appointmentDay = new Date(this.appointmentDate).getDay();

          // Monday-Friday (1-5): 16:00 - 20:30
          if (appointmentDay >= 1 && appointmentDay <= 5) {
            const minTime = 16 * 60; // 16:00
            const maxTime = 20 * 60 + 30; // 20:30 (last appointment)
            return totalMinutes >= minTime && totalMinutes <= maxTime;
          }

          // Saturday-Sunday (0, 6): คลินิกปิด
          return false;
        },
        message: (props) => {
          const appointmentDay = new Date(this.appointmentDate).getDay();
          if (appointmentDay >= 1 && appointmentDay <= 5) {
            return "เวลานัดหมายต้องอยู่ระหว่าง 16:00 น. ถึง 20:30 น. สำหรับวันจันทร์-ศุกร์";
          } else {
            return "คลินิกไม่เปิดให้บริการในวันเสาร์และวันอาทิตย์";
          }
        },
      },
    },
    initialSymptoms: {
      type: String,
      required: [true, "กรุณาระบุอาการเบื้องต้น"],
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "cancelled", "in-progress"],
      default: "pending",
    },
    callTime: {
      type: Date,
      default: null,
    },
    // เพิ่มฟิลด์ queueNumber สำหรับเก็บลำดับคิว
    queueNumber: {
      type: Number,
      default: null,
    },
    cancelReason: {
      type: String,
      default: null,
    },
    // เพิ่มฟิลด์สำหรับบันทึกจากแพทย์
    adminNotes: {
      type: String,
      default: null,
    },
    // สำหรับความเข้ากันได้กับไฟล์เดิม (ที่ใช้ initialSymptoms)
    symptoms: {
      type: String,
      default: function () {
        return this.initialSymptoms;
      },
    },
  },
  {
    timestamps: true,
  }
);

// REMOVE the unique index for appointmentDate and appointmentTime
// This change allows multiple bookings for the same time slot
// We'll manage the limit of 2 bookings per slot via code logic

// Static method to check available slots for a given date
bookingSchema.statics.getAvailableSlots = async function (date) {
  // แปลงข้อมูลวันที่ให้เป็น Date object ที่ถูกต้อง
  let startDate;

  try {
    if (date === undefined || date === null) {
      throw new Error("Date parameter is required");
    }

    if (typeof date === "string") {
      if (date.includes("T")) {
        // กรณีเป็น ISO string
        startDate = new Date(date);
      } else {
        // กรณีเป็น YYYY-MM-DD
        const [year, month, day] = date.split("-").map(Number);

        // Validate date parts
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
          throw new Error("Invalid date format. Expected YYYY-MM-DD");
        }

        // สร้าง Date โดยไม่ใช้ timezone offset
        startDate = new Date(year, month - 1, day);
      }
    } else if (date instanceof Date) {
      // กรณีเป็น Date object
      startDate = new Date(date);
    } else {
      // กรณีอื่นๆ
      throw new Error("Invalid date format");
    }

    // Validate that the date is valid
    if (isNaN(startDate.getTime())) {
      throw new Error("Invalid date");
    }

    // ตั้งเวลาเป็น 00:00:00
    startDate.setHours(0, 0, 0, 0);

    // ตั้งเวลาสิ้นสุดเป็น 23:59:59
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);

    // แสดง log สำหรับตรวจสอบ
    console.log("Checking availability for date:", startDate.toISOString());
    console.log("End date:", endDate.toISOString());

    // Get all bookings for the selected date using date range query
    const bookings = await this.find({
      appointmentDate: {
        $gte: startDate,
        $lte: endDate,
      },
      status: { $ne: "cancelled" },
    });

    console.log(`Found ${bookings.length} bookings for the selected date`);

    // Get the day of the week (0 = Sunday, 6 = Saturday)
    const dayOfWeek = startDate.getDay();

    // Define time slots based on day of week
    const allTimeSlots = [];

    // Saturday-Sunday (clinic closed)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return {
        available: false,
        message: "คลินิกไม่เปิดให้บริการในวันเสาร์และวันอาทิตย์",
        availableSlots: [],
        bookedSlots: [],
      };
    }

    // Monday-Friday (1-5): 16:00 - 20:30
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      for (let hour = 16; hour <= 20; hour++) {
        for (let minute = 0; minute <= 30; minute += 30) {
          // Skip 21:00 slot
          if (hour === 20 && minute > 30) continue;

          const timeStr = `${hour.toString().padStart(2, "0")}:${minute
            .toString()
            .padStart(2, "0")}`;
          allTimeSlots.push(timeStr);
        }
      }
    }

    // Count bookings per time slot
    const bookingsPerSlot = {};
    bookings.forEach((booking) => {
      if (!bookingsPerSlot[booking.appointmentTime]) {
        bookingsPerSlot[booking.appointmentTime] = 1;
      } else {
        bookingsPerSlot[booking.appointmentTime]++;
      }
    });

    console.log("Bookings per slot:", bookingsPerSlot);

    // Calculate available slots (slots with fewer than 2 bookings)
    const MAX_BOOKINGS_PER_SLOT = 2;
    const availableSlots = allTimeSlots.filter(
      (time) =>
        !bookingsPerSlot[time] || bookingsPerSlot[time] < MAX_BOOKINGS_PER_SLOT
    );

    // Get fully booked slots (slots with exactly 2 bookings)
    const fullyBookedSlots = allTimeSlots.filter(
      (time) =>
        bookingsPerSlot[time] && bookingsPerSlot[time] >= MAX_BOOKINGS_PER_SLOT
    );

    // Check if current time is past for today's slots
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    console.log("Today date:", today.toISOString());
    console.log(
      "Checking if startDate is today:",
      startDate.toDateString() === today.toDateString()
    );

    // เปรียบเทียบเฉพาะวันที่โดยใช้ toDateString() แทนการเปรียบเทียบ timestamp
    if (startDate.toDateString() === today.toDateString()) {
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTotalMinutes = currentHour * 60 + currentMinute + 30; // Add 30 minutes buffer

      console.log("Current time plus buffer (minutes):", currentTotalMinutes);

      // Filter out past time slots
      const filteredSlots = availableSlots.filter((time) => {
        const [hours, minutes] = time.split(":").map(Number);
        const slotTotalMinutes = hours * 60 + minutes;
        const isPastTime = slotTotalMinutes <= currentTotalMinutes;

        console.log(
          `Time ${time}: ${slotTotalMinutes} minutes, isPastTime: ${isPastTime}`
        );

        return slotTotalMinutes > currentTotalMinutes;
      });

      console.log("Filtered available slots:", filteredSlots);

      return {
        available: filteredSlots.length > 0,
        availableSlots: filteredSlots,
        bookedSlots: fullyBookedSlots,
        bookingsPerSlot: bookingsPerSlot, // Return counts for debugging if needed
      };
    }

    console.log("All available slots:", availableSlots);

    return {
      available: availableSlots.length > 0,
      availableSlots,
      bookedSlots: fullyBookedSlots,
      bookingsPerSlot: bookingsPerSlot, // Return counts for debugging if needed
    };
  } catch (error) {
    console.error("Error in getAvailableSlots:", error);
    return {
      available: false,
      message: `เกิดข้อผิดพลาดในการค้นหาเวลานัดหมาย: ${error.message}`,
      availableSlots: [],
      bookedSlots: [],
      bookingsPerSlot: {},
    };
  }
};

// Create Booking model
const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
