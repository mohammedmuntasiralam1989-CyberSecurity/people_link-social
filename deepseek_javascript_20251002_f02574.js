// server.js (Production)
import https from 'https';
import fs from 'fs';
import express from 'express';

const app = express();

// SSL certificate configuration (for production)
const sslOptions = {
  key: fs.readFileSync('/path/to/private-key.pem'),
  cert: fs.readFileSync('/path/to/certificate.pem'),
  ca: fs.readFileSync('/path/to/ca-bundle.pem')
};

// Apply security middleware
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(xssProtection);

// Apply rate limiting
app.use('/api/auth/', authLimiter);
app.use('/api/', apiLimiter);

// In production, use HTTPS
if (process.env.NODE_ENV === 'production') {
  https.createServer(sslOptions, app).listen(443, () => {
    console.log('HTTPS Server running on port 443');
  });
  
  // Redirect HTTP to HTTPS
  express().get('*', (req, res) => {
    res.redirect('https://' + req.headers.host + req.url);
  }).listen(80);
} else {
  app.listen(5000, () => {
    console.log('HTTP Server running on port 5000');
  });
}