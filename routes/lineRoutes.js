// ในไฟล์ routes/lineRoutes.js
const express = require('express');
const router = express.Router();
const lineController = require('../controllers/lineController');
const { protect } = require('../middleware/auth');

// Webhook for LINE - ไม่ต้องการการตรวจสอบสิทธิ์
router.post('/webhook', lineController.handleWebhook);

// LINE login callback - ไม่ต้องการการตรวจสอบสิทธิ์
router.get('/callback', lineController.handleCallback);

// Test LINE notification - ต้องเข้าสู่ระบบก่อน
router.post('/send-notification', protect, lineController.testSendNotification);

module.exports = router;