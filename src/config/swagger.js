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
      url: '/api',
      description: 'Current host (works on Vercel and locally)',
    },
    {
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
                required: ['username', 'password'],
                properties: {
                  username: {
                    type: 'string',
                    format: 'email',
                    description: 'Work email address (`email` is also accepted as the field name)',
                    example: 'admin@peoplepulse.com',
                  },
                  password: {
                    type: 'string',
                    format: 'password',
                    minLength: 6,
                    maxLength: 128,
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
          400: {
            description: 'Validation failed (missing/invalid username or password)',
          },
          403: {
            description: 'Account deactivated',
          },
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
    '/profile': {
      get: {
        summary: 'Get Complete User Profile',
        description: 'Returns the authenticated user profile, including manager and notification preferences.',
        tags: ['Profile'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Profile retrieved successfully' },
          401: { description: 'Unauthorized - Invalid or missing token' },
        },
      },
      put: {
        summary: 'Update User Profile',
        description: 'Employees can update their name and phone number. Admin roles can also update employee ID, department, designation, and manager.',
        tags: ['Profile'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Ayesha Khan' },
                  phoneNumber: { type: 'string', example: '+92 300 1234567' },
                  employeeId: { type: 'string', example: 'EMP-1042' },
                  department: { type: 'string', example: 'Product Design' },
                  designation: { type: 'string', example: 'UX/UI Designer' },
                  manager: { type: 'string', nullable: true, example: '664fa1b234567890abcdef12' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Profile updated successfully' },
          400: { description: 'Invalid profile data' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Insufficient permissions' },
          409: { description: 'Employee ID already exists' },
        },
      },
    },
    '/profile/password': {
      put: {
        summary: 'Change Current User Password',
        tags: ['Profile'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string', format: 'password', example: 'Password@123' },
                  newPassword: { type: 'string', format: 'password', minLength: 6, example: 'NewPassword@123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password changed successfully' },
          400: { description: 'Invalid password request' },
          401: { description: 'Current password is incorrect or token is invalid' },
        },
      },
    },
    '/profile/notifications': {
      get: {
        summary: 'Get Notification Preferences',
        tags: ['Profile'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Notification preferences retrieved successfully' },
          401: { description: 'Unauthorized - Invalid or missing token' },
        },
      },
      put: {
        summary: 'Update Notification Preferences',
        tags: ['Profile'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'boolean', example: true },
                  push: { type: 'boolean', example: false },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Notification preferences updated successfully' },
          400: { description: 'At least one boolean preference is required' },
          401: { description: 'Unauthorized - Invalid or missing token' },
        },
      },
    },
    '/org/departments': {
      get: {
        summary: 'List Departments',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Departments retrieved successfully' },
          401: { description: 'Unauthorized - Invalid or missing token' },
        },
      },
      post: {
        summary: 'Create Department',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', example: 'Product Design' } },
              },
            },
          },
        },
        responses: {
          201: { description: 'Department created successfully' },
          400: { description: 'Name is required' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can create departments' },
          409: { description: 'Department name already exists' },
        },
      },
    },
    '/org/designations': {
      get: {
        summary: 'List Designations',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Designations retrieved successfully' },
          401: { description: 'Unauthorized - Invalid or missing token' },
        },
      },
      post: {
        summary: 'Create Designation',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', example: 'UX/UI Designer' } },
              },
            },
          },
        },
        responses: {
          201: { description: 'Designation created successfully' },
          400: { description: 'Name is required' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can create designations' },
          409: { description: 'Designation name already exists' },
        },
      },
    },
    '/org/locations': {
      get: {
        summary: 'List Locations',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Locations retrieved successfully' },
          401: { description: 'Unauthorized - Invalid or missing token' },
        },
      },
      post: {
        summary: 'Create Location',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', example: 'Islamabad Office' } },
              },
            },
          },
        },
        responses: {
          201: { description: 'Location created successfully' },
          400: { description: 'Name is required' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can create locations' },
          409: { description: 'Location name already exists' },
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
