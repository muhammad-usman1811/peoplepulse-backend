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
const hrAttendanceRoutes = require('./routes/hrAttendanceRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const { leaveRoutes, wfhRoutes } = require('./routes/requestRoutes');
const performanceRoutes = require('./routes/performanceRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const recruitmentRoutes = require('./routes/recruitmentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');
const documentRoutes = require('./routes/documentRoutes');
const employeeDocumentRoutes = require('./routes/employeeDocumentRoutes');
const systemConfigRoutes = require('./routes/systemConfigRoutes');
const errorHandler = require('./middleware/errorMiddleware');
const ApiResponse = require('./utils/apiResponse');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./config/swagger');
const { validateSecurityConfig } = require('./config/security');

validateSecurityConfig();

// Initialize MongoDB connection
connectDB();

const app = express();
if (process.env.VERCEL) app.set('trust proxy', 1);

// Security HTTP headers
// The Swagger UI page loads its scripts/styles from cdn.jsdelivr.net (see /api-docs below)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", 'https://cdn.jsdelivr.net'],
        'style-src': ["'self'", 'https:', "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
      },
    },
  })
);

// Cross-Origin Resource Sharing (CORS) setup for React Web & Flutter Mobile
const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
];

// Vercel serves this API's own Swagger UI from its own domain, and
// "Try it out" issues same-origin fetches that still carry an Origin
// header (any POST/PUT/PATCH with a JSON body does, per the Fetch spec,
// even same-origin) — so the API must always trust its own deployment
// domain regardless of what CLIENT_URL is set to.
const selfOrigins = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .filter(Boolean)
  .map((host) => `https://${host}`);

const allowedOrigins = [
  ...(process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(',').map((url) => url.trim()).filter(Boolean)
    : defaultAllowedOrigins),
  ...selfOrigins,
];

const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  const normalizedOrigin = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  try {
    const { hostname, protocol } = new URL(normalizedOrigin);
    return (
      ['localhost', '127.0.0.1', '::1'].includes(hostname) &&
      ['http:', 'https:'].includes(protocol)
    );
  } catch {
    return false;
  }
};

const corsOptions = {
  origin: function (origin, callback) {
    // Mobile apps (Flutter / React Native) and curl/Postman usually have no origin header
    if (!origin || isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// HTTP request logger
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Body parsers
app.use('/api/performance', express.json({ limit: '256kb' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Swagger Interactive API Documentation UI
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerDocument);
});

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
// HR Attendance List: HR-only, paginated, one day at a time
app.use('/api/v1/attendance', hrAttendanceRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/leave-requests', leaveRoutes);
app.use('/api/wfh-requests', wfhRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/recruitment', recruitmentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/documents', documentRoutes);
// Upload-only EmployeeDocument API (separate store from /api/documents; see review)
app.use('/api/employee-documents', employeeDocumentRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/system-config', systemConfigRoutes);

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
