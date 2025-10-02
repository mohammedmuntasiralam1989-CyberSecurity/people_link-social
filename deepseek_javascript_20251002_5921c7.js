// auth/oauth.js
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import User from '../models/User.js';

// Google OAuth
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ email: profile.emails[0].value });
    
    if (user) {
      // Update existing user with Google data
      user.googleId = profile.id;
      user.avatar = profile.photos[0].value;
      await user.save();
      return done(null, user);
    }

    // Create new user
    user = await User.create({
      name: profile.displayName,
      email: profile.emails[0].value,
      googleId: profile.id,
      avatar: profile.photos[0].value,
      isVerified: true,
      password: await hashPassword(Math.random().toString(36)) // Random password
    });

    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

// Facebook OAuth
passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_APP_ID,
  clientSecret: process.env.FACEBOOK_APP_SECRET,
  callbackURL: "/api/auth/facebook/callback",
  profileFields: ['id', 'emails', 'name', 'photos']
}, async (accessToken, refreshToken, profile, done) => {
  // Similar implementation as Google
}));

// OAuth Routes
import express from 'express';
import passport from 'passport';
const router = express.Router();

router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

router.get('/google/callback', passport.authenticate('google', {
  session: false
}), (req, res) => {
  // Generate JWT token and redirect
  const token = jwt.sign(
    { userId: req.user.id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  res.redirect(`${process.env.CLIENT_URL}/auth/success?token=${token}`);
});

router.get('/facebook', passport.authenticate('facebook', {
  scope: ['email']
}));

router.get('/facebook/callback', passport.authenticate('facebook', {
  session: false
}), (req, res) => {
  // Similar to Google callback
});