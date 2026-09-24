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
                properties: {
                  name: { type: 'string', example: 'Product Design' },
                  location: { type: 'string', example: 'Lahore', nullable: true },
                },
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
    '/org/departments/{id}': {
      get: {
        summary: 'Get Department By ID',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Department retrieved successfully' },
          404: { description: 'Department not found' },
          401: { description: 'Unauthorized - Invalid or missing token' },
        },
      },
      put: {
        summary: 'Update Department',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Product Design' },
                  location: { type: 'string', example: 'Lahore', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Department updated successfully' },
          400: { description: 'Name is required' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can update departments' },
          404: { description: 'Department not found' },
          409: { description: 'Department name already exists' },
        },
      },
      delete: {
        summary: 'Delete Department',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Department deleted successfully' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can delete departments' },
          404: { description: 'Department not found' },
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
    '/org/designations/{id}': {
      get: {
        summary: 'Get Designation By ID',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Designation retrieved successfully' },
          404: { description: 'Designation not found' },
          401: { description: 'Unauthorized - Invalid or missing token' },
        },
      },
      put: {
        summary: 'Update Designation',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
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
          200: { description: 'Designation updated successfully' },
          400: { description: 'Name is required' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can update designations' },
          404: { description: 'Designation not found' },
          409: { description: 'Designation name already exists' },
        },
      },
      delete: {
        summary: 'Delete Designation',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Designation deleted successfully' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can delete designations' },
          404: { description: 'Designation not found' },
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
    '/org/locations/{id}': {
      get: {
        summary: 'Get Location By ID',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Location retrieved successfully' },
          404: { description: 'Location not found' },
          401: { description: 'Unauthorized - Invalid or missing token' },
        },
      },
      put: {
        summary: 'Update Location',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
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
          200: { description: 'Location updated successfully' },
          400: { description: 'Name is required' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can update locations' },
          404: { description: 'Location not found' },
          409: { description: 'Location name already exists' },
        },
      },
      delete: {
        summary: 'Delete Location',
        tags: ['Organization'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Location deleted successfully' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can delete locations' },
          404: { description: 'Location not found' },
        },
      },
    },
    '/attendance/clock-in': {
      post: {
        summary: 'Clock In for Today',
        description: 'Creates or updates the employee today attendance record with the current clock-in time.',
        tags: ['Attendance'],
        security: [{ BearerAuth: [] }],
        responses: {
          201: { description: 'Clock-in successful' },
          400: { description: 'Invalid request or attendance already processed' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          409: { description: 'Already clocked in or already clocked out for today' },
        },
      },
    },
    '/attendance/clock-out': {
      post: {
        summary: 'Clock Out for Today',
        description: 'Marks the employee attendance record with the current clock-out time.',
        tags: ['Attendance'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Clock-out successful' },
          400: { description: 'No attendance found for today or not clocked in yet' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          409: { description: 'Already clocked out for today' },
        },
      },
    },
    '/attendance/me': {
      get: {
        summary: 'Get My Attendance History',
        description: 'Returns the authenticated employee attendance history for recent dates, optionally filtered by from/to query params.',
        tags: ['Attendance'],
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'from',
            schema: { type: 'string', format: 'date' },
            description: 'Start date filter (YYYY-MM-DD)',
          },
          {
            in: 'query',
            name: 'to',
            schema: { type: 'string', format: 'date' },
            description: 'End date filter (YYYY-MM-DD)',
          },
          {
            in: 'query',
            name: 'limit',
            schema: { type: 'integer', default: 30 },
            description: 'Maximum records to return',
          },
        ],
        responses: {
          200: { description: 'Attendance history retrieved successfully' },
          401: { description: 'Unauthorized - Invalid or missing token' },
        },
      },
    },
    '/employees': {
      get: {
        summary: 'List Employees',
        tags: ['Employees'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'department', in: 'query', schema: { type: 'string' } },
          { name: 'location', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'on-leave'] } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        ],
      },
      post: {
        summary: 'Create Employee',
        tags: ['Employees'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object', required: ['name', 'email', 'password'],
            properties: {
              name: { type: 'string', example: 'Jane Doe' }, email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 6 }, employeeId: { type: 'string' },
              department: { type: 'string' }, designation: { type: 'string' }, location: { type: 'string' },
              status: { type: 'string', enum: ['active', 'on-leave'], default: 'active' },
            },
          } } },
        },
        responses: { 201: { description: 'Employee created successfully' }, 403: { description: 'HR/Admin role required' } },
      },
    },
    '/employees/{id}': {
      get: {
        summary: 'Get Employee', tags: ['Employees'], security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Employee retrieved successfully' }, 403: { description: 'HR/Admin role required' }, 404: { description: 'Employee not found' } },
      },
      put: {
        summary: 'Update Employee', tags: ['Employees'], security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', properties: { department: { type: 'string' }, designation: { type: 'string' }, location: { type: 'string' }, status: { type: 'string', enum: ['active', 'on-leave'] }, isActive: { type: 'boolean' } },
        } } } },
        responses: { 200: { description: 'Employee updated successfully' }, 403: { description: 'HR/Admin role required' } },
      },
      delete: {
        summary: 'Deactivate Employee', tags: ['Employees'], security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Employee deactivated successfully' }, 403: { description: 'HR/Admin role required' } },
      },
    },
    '/auth/forgot-password': {
      post: {
        summary: 'Request Password Reset Link',
        description:
          'If the work email exists, a reset link is emailed to it when EMAIL_USER/EMAIL_PASS are configured on the server. ' +
          'Otherwise (e.g. local development), the link and token are returned directly in the response instead of being emailed. ' +
          'Always returns a generic success message for an unknown email, to avoid revealing which addresses are registered.',
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
            description:
              'Either "reset link emailed" (no data) or, when email delivery is not configured, "link generated" with resetUrl/resetToken/expiresInMinutes in data.',
          },
          400: {
            description: 'Email address missing from request body',
          },
          502: {
            description: 'Email delivery is configured but sending the reset email failed',
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
    '/auth/reset-password': {
      post: {
        summary: 'Reset Password Using Token in Request Body',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                  token: { type: 'string' },
                  password: { type: 'string', minLength: 6, example: 'NewSecurePassword@123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password reset successful' },
          400: { description: 'Invalid or expired reset token' },
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
