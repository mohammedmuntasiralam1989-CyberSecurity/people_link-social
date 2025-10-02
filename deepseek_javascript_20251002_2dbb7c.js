// auth/otp.js
import crypto from 'crypto';
import nodemailer from 'nodemailer';

// Generate OTP
export const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Store OTP in Redis with expiry
export const storeOTP = async (email, otp) => {
  const key = `otp:${email}`;
  await redisClient.setEx(key, 300, otp); // 5 minutes expiry
};

// Verify OTP
export const verifyOTP = async (email, otp) => {
  const key = `otp:${email}`;
  const storedOTP = await redisClient.get(key);
  
  if (!storedOTP || storedOTP !== otp) {
    return false;
  }
  
  // Delete OTP after successful verification
  await redisClient.del(key);
  return true;
};

// Send OTP via Email
export const sendOTPEmail = async (email, otp) => {
  const transporter = nodemailer.createTransporter({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your People Link-Social OTP Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #D4AF37;">People Link-Social</h2>
        <p>Your One-Time Password (OTP) for login is:</p>
        <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; font-weight: bold; color: #D4AF37;">
          ${otp}
        </div>
        <p>This OTP will expire in 5 minutes.</p>
        <p>If you didn't request this OTP, please ignore this email.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// OTP Login Route
router.post('/login/otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Generate and send OTP
    const otp = generateOTP();
    await storeOTP(email, otp);
    await sendOTPEmail(email, otp);

    res.json({ message: 'OTP sent to your email' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/verify/otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    const isValid = await verifyOTP(email, otp);
    if (!isValid) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Get user and generate token
    const user = await User.findOne({ email });
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});