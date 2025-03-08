const User = require('../models/User');
const Booking = require('../models/Booking');
const lineConfig = require('../config/line-config');
const axios = require('axios');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// รูปแบบวันที่ไทย
function formatThaiDate(date) {
  const options = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    weekday: 'long'
  };
  return new Date(date).toLocaleDateString('th-TH', options);
}

// @desc    Handle LINE webhook events
// @route   POST /api/line/webhook
// @access  Public
exports.handleWebhook = async (req, res) => {
  try {
    const events = req.body.events;
    
    if (!events || events.length === 0) {
      return res.status(200).send('No events');
    }
    
    // Process each event
    for (const event of events) {
      await processEvent(event);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('LINE Webhook Error:', error);
    res.status(500).send('Error processing webhook');
  }
};

// ฟังก์ชันประมวลผลเหตุการณ์จาก LINE
const processEvent = async (event) => {
  try {
    const { type, source, message, replyToken } = event;
    
    // Handle only user messages for now
    if (source.type !== 'user') return;
    
    const lineUserId = source.userId;
    
    // Handle message events
    if (type === 'message' && message.type === 'text') {
      const userMessage = message.text;
      
      // ตรวจสอบคำสั่งตรวจสอบการจอง
      if (userMessage.includes('ตรวจสอบการจอง') || userMessage.includes('ตรวจสอบ')) {
        await sendBookingInfo(lineUserId, replyToken);
      }
      // คำสั่งจองคิว
      else if (userMessage.includes('จองคิว') || userMessage.includes('นัดหมาย')) {
        await replyMessage(replyToken, generateBookingLink(lineUserId));
      } 
      // คำสั่งช่วยเหลือ
      else if (userMessage.includes('help') || userMessage.includes('ช่วยเหลือ')) {
        await replyMessage(replyToken, getHelpMessage());
      }
      // ข้อความอื่นๆ
      else {
        await replyMessage(replyToken, getDefaultResponse());
      }
    }
  } catch (error) {
    console.error('Error processing event:', error);
  }
};

// ฟังก์ชันส่งข้อมูลการจอง
async function sendBookingInfo(lineUserId, replyToken) {
  try {
    // หาผู้ใช้จาก LINE User ID
    const user = await User.findOne({ lineUserId });
    
    if (!user) {
      return replyMessage(replyToken, {
        type: 'text',
        text: 'ไม่พบข้อมูลการลงทะเบียน กรุณาลงทะเบียนก่อนใช้งาน'
      });
    }
    
    // ค้นหาการจองของผู้ใช้ที่ยังไม่ยกเลิกและวันที่ในอนาคต
    const futureBookings = await Booking.find({ 
      user: user._id,
      status: { $ne: 'cancelled' },
      appointmentDate: { $gte: new Date() }
    }).sort({ appointmentDate: 1, appointmentTime: 1 });
    
    // ค้นหาประวัติการจองที่ผ่านมาหรือถูกยกเลิก
    const pastBookings = await Booking.find({
      user: user._id,
      $or: [
        { appointmentDate: { $lt: new Date() } },
        { status: 'cancelled' }
      ]
    }).sort({ appointmentDate: -1 }).limit(3);
    
    // สร้างข้อความตอบกลับ
    let replyText = '';
    
    if (futureBookings.length === 0 && pastBookings.length === 0) {
      replyText = 'คุณยังไม่มีข้อมูลการจอง กรุณาจองคิวก่อนใช้งาน';
    } else {
      replyText = `📅 ข้อมูลการจองของคุณ 📅\n\n`;
      
      if (futureBookings.length > 0) {
        replyText += `✅ การจองที่กำลังจะมาถึง:\n`;
        futureBookings.forEach((booking, index) => {
          replyText += `${index + 1}. วันที่: ${formatThaiDate(booking.appointmentDate)}\n`;
          replyText += `   เวลา: ${booking.appointmentTime} น.\n`;
          replyText += `   อาการ: ${booking.initialSymptoms}\n`;
          replyText += `   สถานะ: ${getStatusText(booking.status)}\n\n`;
        });
      }
      
      if (pastBookings.length > 0) {
        replyText += `📜 ประวัติการจอง:\n`;
        pastBookings.forEach((booking, index) => {
          replyText += `${index + 1}. วันที่: ${formatThaiDate(booking.appointmentDate)}\n`;
          replyText += `   เวลา: ${booking.appointmentTime} น.\n`;
          replyText += `   สถานะ: ${getStatusText(booking.status)}\n\n`;
        });
      }
      
      // เพิ่มลิงก์เข้าระบบ
      replyText += `ต้องการจัดการการจอง กรุณาเข้าสู่ระบบที่:\n`;
      replyText += `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;
    }
    
    await replyMessage(replyToken, { type: 'text', text: replyText });
  } catch (error) {
    console.error('Error sending booking info:', error);
    await replyMessage(replyToken, { 
      type: 'text', 
      text: 'เกิดข้อผิดพลาดในการดึงข้อมูลการจอง กรุณาลองใหม่อีกครั้ง' 
    });
  }
}

// แปลงสถานะเป็นข้อความภาษาไทย
function getStatusText(status) {
  switch (status) {
    case 'pending': return 'รอดำเนินการ';
    case 'success': return 'สำเร็จ';
    case 'cancelled': return 'ยกเลิก';
    default: return status;
  }
}

// สร้างลิงก์สำหรับการจองคิว
function generateBookingLink(lineUserId) {
  const bookingUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/booking?line_user_id=${lineUserId}`;
  
  return {
    type: 'template',
    altText: 'ลิงก์สำหรับจองคิว',
    template: {
      type: 'buttons',
      title: 'จองคิว',
      text: 'กดเพื่อจองคิวหรือตรวจสอบการจอง',
      actions: [
        {
          type: 'uri',
          label: 'จองคิวใหม่',
          uri: bookingUrl
        },
        {
          type: 'uri',
          label: 'ตรวจสอบการจอง',
          uri: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/bookings?line_user_id=${lineUserId}`
        }
      ]
    }
  };
}

// ฟังก์ชันส่งข้อความคำสั่งช่วยเหลือ
function getHelpMessage() {
  return {
    type: 'text',
    text: '📌 คำสั่งที่สามารถใช้งานได้:\n\n' +
          '• "จองคิว" - สร้างการจองใหม่\n' +
          '• "ตรวจสอบการจอง" - ดูข้อมูลการจองของคุณ\n' +
          '• "ช่วยเหลือ" - แสดงคำสั่งที่ใช้งานได้\n\n' +
          '📝 หากมีข้อสงสัยเพิ่มเติม กรุณาติดต่อ 02-xxx-xxxx'
  };
}

// ข้อความตอบกลับเริ่มต้น
function getDefaultResponse() {
  return {
    type: 'text',
    text: 'สวัสดีครับ คุณสามารถพิมพ์คำว่า "จองคิว" เพื่อทำการจองคิว หรือ "ตรวจสอบ" เพื่อตรวจสอบการจองของคุณ หรือ "ช่วยเหลือ" เพื่อดูคำสั่งทั้งหมด'
  };
}

// ฟังก์ชันสำหรับการตอบกลับข้อความผ่าน LINE
const replyMessage = async (replyToken, messages) => {
  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken,
        messages: Array.isArray(messages) ? messages : [messages]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${lineConfig.channelSecret}`
        }
      }
    );
  } catch (error) {
    console.error('Error replying to LINE message:', error);
  }
};

// @desc    Handle LINE login callback
// @route   GET /api/line/callback
// @access  Public
exports.handleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).send('Authorization code not found');
    }
    
    // สำหรับการทดสอบ - ข้ามการเรียก LINE API จริง
    if (code === 'abc123' || code === 'test_code') {
      console.log('TEST MODE: Simulating LINE Login callback');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login-success?token=test_token`);
    }
    
    // Exchange authorization code for access token
    const tokenResponse = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/line/callback`,
        client_id: lineConfig.channelId,
        client_secret: lineConfig.channelSecret
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const { access_token, id_token } = tokenResponse.data;
    
    // Get user profile from LINE
    const profileResponse = await axios.get('https://api.line.me/v2/profile', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });
    
    const { userId: lineUserId, displayName } = profileResponse.data;
    
    // Check if user exists with this LINE user ID
    let user = await User.findOne({ lineUserId });
    
    if (!user) {
      // If state contains a userId, link LINE account to existing user
      if (state) {
        user = await User.findById(state);
        
        if (user) {
          user.lineUserId = lineUserId;
          await user.save();
        }
      }
    }
    
    // Redirect to frontend with token or registration page
    if (user) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
      });
      
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login-success?token=${token}`);
    } else {
      // Redirect to registration page with LINE user ID as parameter
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?line_user_id=${lineUserId}&name=${encodeURIComponent(displayName)}`);
    }
  } catch (error) {
    console.error('LINE Callback Error:', error);
    res.status(500).send('Error processing LINE login callback');
  }
};

// @desc    Test sending LINE notification
// @route   POST /api/line/send-notification
// @access  Private
exports.testSendNotification = async (req, res) => {
  try {
    const { bookingId, notificationType } = req.body;
    
    if (!bookingId || !notificationType) {
      return res.status(400).json({ message: 'กรุณาระบุ bookingId และ notificationType' });
    }
    
    // ตรวจสอบว่า bookingId เป็น valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: 'รูปแบบ bookingId ไม่ถูกต้อง' });
    }
    
    // ค้นหาข้อมูลการจอง
    const booking = await Booking.findById(bookingId).populate('user', 'firstName lastName phone lineUserId');
    
    if (!booking) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลการจอง' });
    }
    
    const lineNotify = require('../utils/lineNotify');
    let result;
    
    // เลือกประเภทการแจ้งเตือน
    switch (notificationType) {
      case 'confirmation':
        result = await lineNotify.sendBookingConfirmation(booking);
        break;
      case 'cancellation':
        result = await lineNotify.sendCancellationNotification(booking);
        break;
      case 'status':
        result = await lineNotify.sendStatusUpdateNotification(booking);
        break;
      case 'call':
        result = await lineNotify.sendCallNotification(booking);
        break;
      default:
        return res.status(400).json({ message: 'ประเภทการแจ้งเตือนไม่ถูกต้อง' });
    }
    
    res.json({
      message: `ส่งการแจ้งเตือนประเภท ${notificationType} สำเร็จ`,
      result
    });
  } catch (error) {
    console.error('Error testing LINE notification:', error);
    res.status(500).json({
      message: 'เกิดข้อผิดพลาดในการส่งการแจ้งเตือน',
      error: error.message
    });
  }
};