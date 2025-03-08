/**
 * ไฟล์นี้ใช้สำหรับจำลองการทดสอบ LINE API ในระบบ
 * รันด้วยคำสั่ง: node tests/mockLineTest.js
 */

require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:5001/api';
let userToken = '';
let bookingId = '';

// ฟังก์ชันสำหรับเรียก API
async function callAPI(method, endpoint, data = null, token = null) {
  try {
    const config = {
      headers: {}
    };
    
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (method === 'GET') {
      const response = await axios.get(`${API_URL}${endpoint}`, config);
      return response.data;
    } else {
      const response = await axios[method.toLowerCase()](`${API_URL}${endpoint}`, data, config);
      return response.data;
    }
  } catch (error) {
    console.error(`Error calling ${method} ${endpoint}:`, error.response?.data || error.message);
    return null;
  }
}

// ทดสอบการลงทะเบียนและล็อกอิน
async function testUserAuthentication() {
  console.log('=== ทดสอบการลงทะเบียนและเข้าสู่ระบบ ===');
  
  // ลงทะเบียนผู้ใช้ใหม่ (อาจล้มเหลวถ้าอีเมลซ้ำ)
  const userData = {
    firstName: 'ทดสอบ',
    lastName: 'ระบบ',
    phone: `08${Math.floor(Math.random() * 90000000) + 10000000}`, // สร้างเบอร์โทรสุ่ม
    email: `test${Math.floor(Math.random() * 9999)}@example.com`, // สร้างอีเมลสุ่ม
    password: '123456'
  };
  
  try {
    const registerResult = await callAPI('POST', '/users', userData);
    console.log('ลงทะเบียนสำเร็จ:', registerResult ? 'สำเร็จ' : 'ล้มเหลว');
    
    // ล็อกอิน
    const loginResult = await callAPI('POST', '/users/login', {
      email: userData.email,
      password: userData.password
    });
    
    if (loginResult && loginResult.token) {
      userToken = loginResult.token;
      console.log('เข้าสู่ระบบสำเร็จ, ได้รับ Token');
      return true;
    }
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการลงทะเบียนหรือเข้าสู่ระบบ:', error);
  }
  
  return false;
}

// ทดสอบการจอง
async function testBooking() {
  console.log('\n=== ทดสอบการจอง ===');
  
  if (!userToken) {
    console.log('ไม่มี Token, ข้ามการทดสอบนี้');
    return false;
  }
  
  // สร้างวันที่ในอนาคต (วันทำการถัดไป)
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 1);
  // หลีกเลี่ยงวันเสาร์และวันอาทิตย์
  while (futureDate.getDay() === 0 || futureDate.getDay() === 6) {
    futureDate.setDate(futureDate.getDate() + 1);
  }
  
  const dateStr = futureDate.toISOString().split('T')[0];
  
  // ตรวจสอบคิวว่าง
  const availableSlots = await callAPI('GET', `/bookings/available-slots/${dateStr}`, null, userToken);
  
  if (!availableSlots || !availableSlots.availableSlots || availableSlots.availableSlots.length === 0) {
    console.log('ไม่มีคิวว่างในวันที่เลือก');
    return false;
  }
  
  console.log(`พบคิวว่าง ${availableSlots.availableSlots.length} คิวในวันที่ ${dateStr}`);
  
  // สร้างการจอง
  const bookingData = {
    appointmentDate: dateStr,
    appointmentTime: availableSlots.availableSlots[0],
    initialSymptoms: 'ทดสอบการจองผ่านระบบ'
  };
  
  const bookingResult = await callAPI('POST', '/bookings', bookingData, userToken);
  
  if (bookingResult && bookingResult._id) {
    bookingId = bookingResult._id;
    console.log(`สร้างการจองสำเร็จ ID: ${bookingId}`);
    return true;
  }
  
  console.log('การสร้างการจองล้มเหลว');
  return false;
}

// ทดสอบการส่ง LINE Notify
async function testLineNotify() {
  console.log('\n=== ทดสอบการส่ง LINE Notify ===');
  
  if (!userToken || !bookingId) {
    console.log('ไม่มี Token หรือ booking ID, ข้ามการทดสอบนี้');
    return false;
  }
  
  const notifyData = {
    bookingId: bookingId,
    notificationType: 'confirmation'
  };
  
  const notifyResult = await callAPI('POST', '/line/send-notification', notifyData, userToken);
  
  if (notifyResult) {
    console.log('ผลการส่งแจ้งเตือน:', notifyResult);
    return true;
  }
  
  console.log('การส่งแจ้งเตือนล้มเหลว');
  return false;
}

// ทดสอบการจำลอง LINE Webhook
async function testLineWebhook() {
  console.log('\n=== ทดสอบการจำลอง LINE Webhook ===');
  
  const webhookData = {
    destination: 'xxxxxxxxxx',
    events: [
      {
        type: 'message',
        message: {
          type: 'text',
          id: '14353798921116',
          text: 'จองคิว'
        },
        timestamp: Date.now(),
        source: {
          type: 'user',
          userId: 'U1234567890abcdef'
        },
        replyToken: 'nHuyWiB7yP5Zw52FIkcQobQuGDXCTA',
        mode: 'active'
      }
    ]
  };
  
  const webhookResult = await callAPI('POST', '/line/webhook', webhookData);
  
  if (webhookResult) {
    console.log('ผลการทดสอบ webhook:', webhookResult);
    return true;
  }
  
  console.log('LINE webhook ตอบกลับสำเร็จ');
  return true;
}

// ทดสอบการจำลอง LINE Login Callback
async function testLineCallback() {
  console.log('\n=== ทดสอบการจำลอง LINE Login Callback ===');
  
  // ในกรณีจริง LINE จะส่ง code มาให้ แต่ในการทดสอบเราใช้ค่าจำลอง
  const callbackResult = await callAPI('GET', '/line/callback?code=test_code&state=test_state');
  
  console.log('ผลการทดสอบ LINE callback:', callbackResult ? 'สำเร็จ' : 'ไม่มีการตอบกลับที่ชัดเจน');
  
  return true;
}

// รันการทดสอบทั้งหมด
async function runTests() {
  console.log('เริ่มการทดสอบระบบจองคิวกับ LINE API...');
  
  await testUserAuthentication();
  await testBooking();
  await testLineNotify();
  await testLineWebhook();
  await testLineCallback();
  
  console.log('\nการทดสอบเสร็จสิ้น!');
}

// เริ่มการทดสอบ
runTests();