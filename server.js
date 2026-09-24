require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const { setupSwagger } = require('./config/swagger');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files if present in public folder
app.use(express.static(path.join(__dirname, 'public')));

// Setup Swagger API Documentation (at /api-docs and /swagger.json)
setupSwagger(app);

// Routes
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`PeoplePulse HRMS Server running on port ${PORT}`);
  console.log(`Swagger API Docs available at: http://localhost:${PORT}/api-docs`);
});


