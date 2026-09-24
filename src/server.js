const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

// Load environment variables
dotenv.config();

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const orgRoutes = require('./routes/orgRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const errorHandler = require('./middleware/errorMiddleware');
const ApiResponse = require('./utils/apiResponse');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./config/swagger');

// Initialize MongoDB connection
connectDB();

const app = express();

// Security HTTP headers
// The Swagger UI page loads its scripts/styles from cdn.jsdelivr.net (see /api-docs below)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", 'https://cdn.jsdelivr.net'],
        'style-src': ["'self'", 'https:', "'unsafe-inline'"],
      },
    },
  })
);

// Cross-Origin Resource Sharing (CORS) setup for React Web & Flutter Mobile
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map((url) => url.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

const corsOptions = {
  origin: function (origin, callback) {
    // Mobile apps (Flutter / React Native) and curl/Postman usually have no origin header
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// HTTP request logger
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Body parsers
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Swagger Interactive API Documentation UI
// Assets load from a CDN because swagger-ui-express static files are not bundled on Vercel
const SWAGGER_CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5';
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    customCssUrl: `${SWAGGER_CDN}/swagger-ui.css`,
    customJs: [
      `${SWAGGER_CDN}/swagger-ui-bundle.js`,
      `${SWAGGER_CDN}/swagger-ui-standalone-preset.js`,
    ],
  })
);

// Health check endpoint
app.get('/api/health', (req, res) => {
  return ApiResponse.success(res, 'PeoplePulse HRMS API is online', {
    service: 'PeoplePulse Backend API',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    documentation: '/api-docs',
  });
});

// Root redirects to Swagger Documentation
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/attendance', attendanceRoutes);

// 404 Route Not Found Handler
app.use((req, res) => {
  return ApiResponse.error(
    res,
    `Route ${req.originalUrl} not found on this server`,
    null,
    404
  );
});

// Centralized Error Handling Middleware
app.use(errorHandler);

// Vercel imports the app as a serverless function; only listen when run directly
if (require.main === module) {
  const PORT = process.env.PORT || 5000;

  const server = app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 PeoplePulse API Server running on port ${PORT}`);
    console.log(`📱 Ready for Flutter Mobile & 💻 React Web Clients`);
    console.log(`🔒 AES-256-GCM + Bcryptjs Security Active`);
    console.log(`=======================================================`);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error(`Unhandled Rejection: ${err.message}`);
    server.close(() => process.exit(1));
  });
}

module.exports = app;
