const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { protect } = require('../middleware/auth');

// All routes are protected
router.use(protect);

router.post('/', bookingController.createBooking);
router.get('/', bookingController.getUserBookings);
router.get('/available-slots/:date', bookingController.getAvailableSlots);
router.get('/:id', bookingController.getBookingById);
router.put('/:id/cancel', bookingController.cancelBooking);

module.exports = router;