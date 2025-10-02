// package.json
{
  "name": "people-link-social-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "mongoose": "^7.0.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.0",
    "cors": "^2.8.5",
    "multer": "^1.4.5",
    "redis": "^4.6.0",
    "socket.io": "^4.6.0",
    "aws-sdk": "^2.1300.0"
  }
}

// server.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import redis from 'redis';
import authRoutes from './routes/auth.js';
import postRoutes from './routes/posts.js';
import userRoutes from './routes/users.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Redis client for caching
const redisClient = redis.createClient({
  url: 'redis://localhost:6379'
});
redisClient.on('error', (err) => console.log('Redis Client Error', err));
await redisClient.connect();

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/peoplelink', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});