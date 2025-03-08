const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, admin } = require('../middleware/auth');

// All routes are protected and admin-only
router.use(protect);
router.use(admin);

router.get('/bookings', adminController.getAllBookings);
router.put('/bookings/:id', adminController.updateBookingStatus);
router.put('/bookings/:id/call', adminController.callUserForAppointment);
router.get('/users', adminController.getAllUsers);
router.get('/statistics', adminController.getBookingStatistics);

module.exports = router;