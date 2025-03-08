const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/', userController.registerUser);
router.post('/login', userController.loginUser);

// Protected routes
router.get('/profile', protect, userController.getUserProfile);
router.put('/profile', protect, userController.updateUserProfile);
router.put('/connect-line', protect, userController.connectLineAccount);
router.put('/change-password', protect, userController.changePassword);

module.exports = router;