const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'PeoplePulse HRMS Backend API 🏢',
    version: '1.0.0',
    description:
      'Official interactive API documentation for PeoplePulse Corporate HRMS. Used by the Flutter mobile app and React web app.',
    contact: {
      name: 'Backend Engineering Team',
    },
  },
  servers: [
    {
<<<<<<< HEAD
=======
      url: '/api',
      description: 'Current host (works on Vercel and locally)',
    },
    {
>>>>>>> 60cba7b (login api)
      url: 'http://localhost:5000/api',
      description: 'Localhost Development Server',
    },
    {
      url: 'http://192.168.5.31:5000/api',
      description: 'Shared Wi-Fi Network Server (for Mobile & Web Teammates)',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token obtained from /auth/login or /auth/register',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Check API and Database Health',
        tags: ['System'],
        responses: {
          200: {
            description: 'API is healthy and online',
          },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'User Login (Super Admin & Employees)',
        description:
          'Authenticate with work email and password. Returns JWT token and user profile.',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
<<<<<<< HEAD
                required: ['email', 'password'],
                properties: {
                  email: {
                    type: 'string',
=======
                required: ['username', 'password'],
                properties: {
                  username: {
                    type: 'string',
                    format: 'email',
                    description: 'Work email address (`email` is also accepted as the field name)',
>>>>>>> 60cba7b (login api)
                    example: 'admin@peoplepulse.com',
                  },
                  password: {
                    type: 'string',
<<<<<<< HEAD
=======
                    format: 'password',
                    minLength: 6,
                    maxLength: 128,
>>>>>>> 60cba7b (login api)
                    example: 'Password@123',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful. Returns JWT token and decrypted profile.',
          },
<<<<<<< HEAD
=======
          400: {
            description: 'Validation failed (missing/invalid username or password)',
          },
          403: {
            description: 'Account deactivated',
          },
>>>>>>> 60cba7b (login api)
          401: {
            description: 'Invalid credentials',
          },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Get Logged-in User Profile',
        description:
          'Returns current authenticated user details. Requires JWT Bearer token.',
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'User profile retrieved successfully',
          },
          401: {
            description: 'Unauthorized - Invalid or missing token',
          },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        summary: 'Request Password Reset Link',
        description:
          'Sends a password reset token if work email exists in the database.',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: {
                    type: 'string',
                    example: 'admin@peoplepulse.com',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Password reset link and token generated',
          },
        },
      },
    },
    '/auth/reset-password/{resetToken}': {
      put: {
        summary: 'Reset Password Using Token',
        description:
          'Updates user password using the token received in forgot-password flow.',
        tags: ['Authentication'],
        parameters: [
          {
            name: 'resetToken',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
            description: 'Token obtained from forgot-password request',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password'],
                properties: {
                  password: {
                    type: 'string',
                    example: 'NewSecurePassword@123',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Password reset successfully',
          },
          400: {
            description: 'Invalid or expired token',
          },
        },
      },
    },
    '/auth/register': {
      post: {
        summary: 'Register New Corporate User',
        description: 'Creates a new user with encrypted personal data and hashed password.',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', example: 'Alex Johnson' },
                  email: { type: 'string', example: 'alex.johnson@peoplepulse.com' },
                  password: { type: 'string', example: 'Password@123' },
                  role: {
                    type: 'string',
                    enum: ['superadmin', 'admin', 'hr', 'employee'],
                    example: 'employee',
                  },
                  department: { type: 'string', example: 'Product Engineering' },
                  designation: { type: 'string', example: 'Software Engineer' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'User created successfully',
          },
          409: {
            description: 'Email already exists',
          },
        },
      },
    },
  },
};

module.exports = swaggerDocument;
