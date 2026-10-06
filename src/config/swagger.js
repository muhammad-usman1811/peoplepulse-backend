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
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token obtained from /auth/login',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Check API Liveness',
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
                required: ['email', 'password'],
                properties: {
                  email: {
                    type: 'string',
                    format: 'email',
                    description: 'Work email address (`username` is also accepted as an alias)',
                    example: 'admin@peoplepulse.com',
                  },
                  password: {
                    type: 'string',
                    format: 'password',
                    minLength: 6,
                    maxLength: 72,
                    example: 'StrongPassword123',
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
                  currentPassword: { type: 'string', format: 'password', example: 'CurrentPassword123' },
                  newPassword: { type: 'string', format: 'password', minLength: 6, maxLength: 72, example: 'NewPassword123' },
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
    '/notifications': {
      get: {
        summary: 'List Notifications',
        description: 'Returns notifications for the authenticated user, newest first. Use unread=true to return only unread items.',
        tags: ['Notifications'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { in: 'query', name: 'unread', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          200: { description: 'Notifications retrieved successfully' },
          400: { description: 'Invalid unread filter' },
          401: { description: 'Authentication required' },
        },
      },
    },
    '/notifications/read-all': {
      patch: {
        summary: 'Mark All Notifications Read',
        description: 'Marks all unread notifications belonging to the authenticated user as read.',
        tags: ['Notifications'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Notifications marked as read' },
          401: { description: 'Authentication required' },
        },
      },
    },
    '/notifications/{id}/read': {
      patch: {
        summary: 'Mark Notification Read',
        description: 'Marks an owned notification as read. Notifications belonging to another user are not disclosed.',
        tags: ['Notifications'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Notification marked as read' },
          401: { description: 'Authentication required' },
          404: { description: 'Notification not found' },
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
    '/attendance/team': {
      get: {
        summary: 'Get Team Attendance',
        description: 'Returns attendance for active employees who report directly to the authenticated user.',
        tags: ['Attendance'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 } },
        ],
        responses: {
          200: { description: 'Team attendance retrieved successfully' },
          400: { description: 'Invalid date or limit filter' },
          401: { description: 'Unauthorized - Invalid or missing token' },
        },
      },
    },
    '/attendance': {
      get: {
        summary: 'Query Attendance Records (Admin/HR)',
        description: 'Returns attendance records, optionally filtered by employee ID and local calendar date range. Dates use APP_TIMEZONE (default Asia/Karachi).',
        tags: ['Attendance'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'employeeId', schema: { type: 'string' }, description: 'MongoDB user ID or business employee ID' },
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date' }, description: 'Start date (YYYY-MM-DD)' },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date' }, description: 'End date (YYYY-MM-DD)' },
          { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 } },
        ],
        responses: {
          200: { description: 'Attendance records retrieved successfully' },
          400: { description: 'Invalid date or limit filter' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can query attendance' },
          404: { description: 'Employee not found' },
        },
      },
    },
    '/payroll/salary-structure': {
      get: {
        summary: 'List Salary Structures',
        tags: ['Payroll'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Salary structures retrieved successfully' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can manage salary structures' },
        },
      },
      post: {
        summary: 'Create Salary Structure',
        tags: ['Payroll'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['grade', 'basicPercentage'],
                properties: {
                  grade: { type: 'string', example: 'G7' },
                  basicPercentage: { type: 'number', minimum: 0, maximum: 100, example: 60 },
                  allowances: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['name', 'value'],
                      properties: {
                        name: { type: 'string', example: 'Housing' },
                        type: { type: 'string', enum: ['percentage', 'fixed'], default: 'percentage' },
                        value: { type: 'number', minimum: 0, example: 20 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Salary structure created successfully' },
          400: { description: 'Invalid salary structure' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can manage salary structures' },
          409: { description: 'A salary structure for this grade already exists' },
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
        responses: {
          200: { description: 'Employees retrieved with pagination metadata' },
          400: { description: 'Invalid pagination or filter values' },
          401: { description: 'Authentication required' },
          403: { description: 'HR/Admin role required' },
        },
      },
      post: {
        summary: 'Create Employee',
        tags: ['Employees'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', example: 'Jane Doe' }, email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6, maxLength: 72 }, employeeId: { type: 'string', maxLength: 64 },
                  phoneNumber: { type: 'string', maxLength: 30, example: '+92 300 1234567' },
                  department: { type: 'string' }, designation: { type: 'string' }, location: { type: 'string' },
                  manager: { type: 'string', nullable: true },
                  salaryStructure: { type: 'string', description: 'Salary structure ObjectId; provide with monthlySalary' },
                  monthlySalary: { type: 'number', exclusiveMinimum: 0, description: 'Monthly base used to calculate basic pay' },
                  status: { type: 'string', enum: ['active', 'on-leave'], default: 'active' },
                },
              }
            }
          },
        },
        responses: {
          201: { description: 'Employee created successfully' },
          400: { description: 'Invalid employee fields or references' },
          401: { description: 'Authentication required' },
          403: { description: 'HR/Admin role required' },
          409: { description: 'Email or employee ID already exists' },
        },
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
        requestBody: {
          required: true, content: {
            'application/json': {
              schema: {
                type: 'object', properties: { name: { type: 'string' }, phoneNumber: { type: 'string', maxLength: 30 }, employeeId: { type: 'string', maxLength: 64, nullable: true }, department: { type: 'string' }, designation: { type: 'string' }, location: { type: 'string' }, status: { type: 'string', enum: ['active', 'on-leave'] }, manager: { type: 'string', nullable: true }, salaryStructure: { type: 'string', nullable: true }, monthlySalary: { type: 'number', nullable: true }, isActive: { type: 'boolean' } },
              }
            }
          }
        },
        responses: { 200: { description: 'Employee updated successfully' }, 400: { description: 'Invalid employee fields' }, 401: { description: 'Authentication required' }, 403: { description: 'HR/Admin role required' }, 404: { description: 'Employee not found' }, 409: { description: 'Employee ID already exists' } },
      },
      delete: {
        summary: 'Deactivate Employee', tags: ['Employees'], security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Employee deactivated successfully' }, 400: { description: 'Cannot deactivate your own account' }, 401: { description: 'Authentication required' }, 403: { description: 'HR/Admin role required' }, 404: { description: 'Employee not found' } },
      },
    },
    '/leave-requests': {
      post: {
        summary: 'Submit Leave Request',
        tags: ['Leave and WFH'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type', 'startDate', 'endDate'],
                properties: {
                  type: { type: 'string', enum: ['annual', 'sick', 'casual', 'unpaid'] },
                  startDate: { type: 'string', format: 'date' },
                  endDate: { type: 'string', format: 'date' },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Leave request submitted' }, 400: { description: 'Invalid request' }, 409: { description: 'Overlapping request' } },
      },
    },
    '/leave-requests/my': {
      get: {
        summary: 'List My Leave Requests',
        tags: ['Leave and WFH'],
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Leave requests retrieved' } },
      },
    },
    '/leave-requests/{id}/approve': {
      patch: {
        summary: 'Approve Leave Request',
        tags: ['Leave and WFH'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Leave request approved' }, 404: { description: 'Pending request not found' } },
      },
    },
    '/leave-requests/{id}/reject': {
      patch: {
        summary: 'Reject Leave Request',
        tags: ['Leave and WFH'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Leave request rejected' }, 404: { description: 'Pending request not found' } },
      },
    },
    '/wfh-requests': {
      post: {
        summary: 'Submit Work From Home Request',
        tags: ['Leave and WFH'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['startDate', 'endDate'],
                properties: {
                  startDate: { type: 'string', format: 'date' },
                  endDate: { type: 'string', format: 'date' },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'WFH request submitted' }, 400: { description: 'Invalid request' }, 409: { description: 'Overlapping request' } },
      },
    },
    '/wfh-requests/my': {
      get: {
        summary: 'List My WFH Requests',
        tags: ['Leave and WFH'],
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'WFH requests retrieved' } },
      },
    },
    '/wfh-requests/{id}/approve': {
      patch: {
        summary: 'Approve WFH Request',
        tags: ['Leave and WFH'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'WFH request approved' }, 404: { description: 'Pending request not found' } },
      },
    },
    '/wfh-requests/{id}/reject': {
      patch: {
        summary: 'Reject WFH Request',
        tags: ['Leave and WFH'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'WFH request rejected' }, 404: { description: 'Pending request not found' } },
      },
    },
    '/performance/cycles': {
      get: {
        summary: 'List Performance Review Cycles',
        description: 'Available to any authenticated user so employees can select an open cycle.',
        tags: ['Performance'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'closed'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: { 200: { description: 'Performance cycles with pagination metadata' }, 400: { description: 'Invalid status filter' }, 401: { description: 'Authentication required' } },
      },
      post: {
        summary: 'Create a Performance Review Cycle',
        tags: ['Performance'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['period'],
                properties: {
                  period: { type: 'string', example: '2026-Q4' },
                  status: { type: 'string', enum: ['open', 'closed'], example: 'open' },
                  startDate: { type: 'string', format: 'date', description: 'Optional; provide together with endDate' },
                  endDate: { type: 'string', format: 'date', description: 'Optional; must be on or after startDate' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Performance cycle created' }, 403: { description: 'HR/Admin role required' }, 409: { description: 'Period already exists' } },
      },
    },
    '/performance/cycles/{cycleId}/close': {
      patch: {
        summary: 'Close a Performance Review Cycle',
        description: 'HR/admin roles can close an open cycle. Closing prevents further self- and manager-review submissions.',
        tags: ['Performance'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'cycleId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Performance cycle closed' },
          401: { description: 'Authentication required' },
          403: { description: 'HR/Admin role required' },
          404: { description: 'Performance cycle not found' },
          409: { description: 'Performance cycle is already closed' },
        },
      },
    },
    '/performance/cycles/{cycleId}/reviews': {
      get: {
        summary: 'List Reviews for a Performance Cycle',
        description: 'Returns all reviews submitted for a specific cycle. Restricted to superadmin, admin, and HR.',
        tags: ['Performance'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'cycleId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: { description: 'Cycle reviews retrieved successfully' },
          401: { description: 'Authentication required' },
          403: { description: 'Only superadmin, admin, or HR can view cycle reviews' },
          404: { description: 'Performance cycle not found' },
        },
      },
      post: {
        summary: 'Submit Employee Self-Review',
        tags: ['Performance'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'cycleId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['selfReview', 'rating'],
                properties: {
                  selfReview: { type: 'string' },
                  rating: { type: 'integer', minimum: 1, maximum: 5 },
                  goals: {
                    type: 'array',
                    maxItems: 20,
                    items: {
                      type: 'object',
                      required: ['title'],
                      properties: {
                        title: { type: 'string', maxLength: 200 },
                        description: { type: 'string', maxLength: 1000 },
                        status: { type: 'string', enum: ['not_started', 'in_progress', 'completed'] },
                        kpis: {
                          type: 'array',
                          maxItems: 20,
                          items: {
                            type: 'object',
                            required: ['name', 'target'],
                            properties: {
                              name: { type: 'string', maxLength: 120 },
                              target: { type: 'number' },
                              actual: { type: 'number', nullable: true },
                              unit: { type: 'string', maxLength: 40 },
                              weight: { type: 'number', minimum: 0, maximum: 100 },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Self-review submitted' }, 400: { description: 'Invalid review or rating' }, 404: { description: 'Open cycle not found' }, 409: { description: 'Review already submitted' } },
      },
    },
    '/performance/team': {
      get: {
        summary: 'List Reviews for the Authenticated Manager Direct Reports',
        description: 'Uses the assigned manager relationship regardless of the direct report user role.',
        tags: ['Performance'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: { description: 'Reviews for direct reports, with pagination metadata' },
          401: { description: 'Authentication required' },
        },
      },
    },
    '/performance/reviews/my': {
      get: {
        summary: 'List Performance Reviews for the Authenticated Employee',
        description: 'Returns the list of performance reviews submitted by the logged-in user.',
        tags: ['Performance'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'cycle', in: 'query', schema: { type: 'string' }, description: 'Optional cycle ID filter' },
        ],
        responses: {
          200: { description: 'My reviews retrieved successfully' },
          401: { description: 'Authentication required' },
        },
      },
    },
    '/performance/reviews/{reviewId}': {
      get: {
        summary: 'Get a Performance Review You Are Allowed to View',
        description: 'Accessible only to the employee on the review, their current direct manager, or HR/admin roles.',
        tags: ['Performance'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reviewId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Authorized review retrieved' },
          401: { description: 'Authentication required' },
          403: { description: 'You are not authorized to view this review' },
          404: { description: 'Review not found' },
        },
      },
    },
    '/performance/reviews/{reviewId}/manager-review': {
      put: {
        summary: 'Submit or Update Manager Review and Rating',
        description: 'Allows the assigned manager of the employee (or HR/Admin) to submit feedback, score/rating, and update KPI assessments for an open performance cycle.',
        tags: ['Performance'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reviewId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['managerReview'],
                properties: {
                  managerReview: { type: 'string', maxLength: 5000, example: 'Excellent performance and project leadership.' },
                  managerRating: {
                    type: 'integer', minimum: 1, maximum: 5, example: 5,
                    description: 'Manager score; the employee self-rating is unchanged.',
                  },
                  goals: {
                    type: 'array',
                    maxItems: 20,
                    description: 'Progress updates to existing employee goals only. Goal definitions and KPI targets are preserved.',
                    items: {
                      type: 'object',
                      required: ['title'],
                      properties: {
                        title: { type: 'string', maxLength: 200 },
                        status: { type: 'string', enum: ['not_started', 'in_progress', 'completed'] },
                        kpis: {
                          type: 'array',
                          maxItems: 20,
                          items: {
                            type: 'object',
                            required: ['name'],
                            properties: {
                              name: { type: 'string', maxLength: 120 },
                              actual: { type: 'number', nullable: true, description: 'Only the actual value may be changed by the manager.' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Manager review submitted successfully' },
          400: { description: 'Invalid review payload or closed cycle' },
          401: { description: 'Authentication required' },
          403: { description: 'Only assigned manager or HR can submit manager review' },
          404: { description: 'Review not found' },
        },
      },
    },
    '/recruitment/job-postings': {
      get: {
        summary: 'List Recruitment Job Postings',
        tags: ['Recruitment'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 10, maximum: 100 } },
        ],
        responses: {
          200: { description: 'Paginated job postings retrieved successfully' },
          400: { description: 'Invalid pagination parameters' },
        },
      },
      post: {
        summary: 'Create a Recruitment Job Posting',
        description: 'HR, admin, or superadmin users can create a posting. Title and department are required.',
        tags: ['Recruitment'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'department'],
                properties: {
                  title: { type: 'string', minLength: 1, maxLength: 150, example: 'Backend Engineer' },
                  department: { type: 'string', minLength: 1, maxLength: 120, example: 'Engineering' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Job posting created' },
          400: { description: 'Title or department missing/invalid' },
          401: { description: 'Authentication required' },
          403: { description: 'HR/admin role required' },
        },
      },
    },
    '/recruitment/candidates': {
      get: {
        summary: 'List Recruitment Candidates',
        tags: ['Recruitment'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 10, maximum: 100 } },
          { in: 'query', name: 'stage', schema: { type: 'string', enum: ['Applied', 'Screening', 'Interview', 'Offer', 'Hired'] } },
          { in: 'query', name: 'jobPosting', schema: { type: 'string' } },
          { in: 'query', name: 'search', schema: { type: 'string', maxLength: 120 } },
        ],
        responses: {
          200: { description: 'Paginated filtered candidates retrieved successfully' },
          400: { description: 'Invalid pagination or filters' },
        },
      },
      post: {
        summary: 'Add a Candidate to a Job Posting',
        description: 'New candidates start in the Applied stage.',
        tags: ['Recruitment'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'jobPosting'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 120, example: 'Alex Candidate' },
                  email: { type: 'string', format: 'email', maxLength: 254, example: 'alex@example.com' },
                  jobPosting: { type: 'string', description: 'ID returned by POST /recruitment/job-postings' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Candidate added in Applied stage' },
          400: { description: 'Candidate details invalid' },
          401: { description: 'Authentication required' },
          403: { description: 'HR/admin role required' },
          404: { description: 'Job posting not found' },
          409: { description: 'Candidate already applied to this posting' },
        },
      },
    },
    '/recruitment/job-postings/{jobPostingId}': {
      get: {
        summary: 'Get Recruitment Job Posting',
        tags: ['Recruitment'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'jobPostingId', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Job posting retrieved successfully' },
          404: { description: 'Job posting not found' },
        },
      },
    },
    '/recruitment/candidates/{candidateId}': {
      get: {
        summary: 'Get Recruitment Candidate',
        tags: ['Recruitment'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'candidateId', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Candidate retrieved successfully' },
          404: { description: 'Candidate not found' },
          409: { description: 'Invalid recruitment stage transition' },
        },
      },
    },
    '/recruitment/candidates/{candidateId}/stage': {
      patch: {
        summary: 'Move a Candidate to a Pipeline Stage',
        description: 'Candidates advance one stage at a time; hired candidates cannot move backwards.',
        tags: ['Recruitment'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'candidateId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['stage'],
                properties: {
                  stage: { type: 'string', enum: ['Applied', 'Screening', 'Interview', 'Offer', 'Hired'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Candidate stage updated' },
          400: { description: 'Stage is not supported' },
          401: { description: 'Authentication required' },
          403: { description: 'HR/admin role required' },
          404: { description: 'Candidate not found' },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        summary: 'Request Password Reset Link',
        description:
          'Sends a reset link through email when SMTP is configured. The raw token is never returned by the API. ' +
          'Always returns the same generic success response for known and unknown addresses, including delivery/configuration failures.',
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
            description: 'Generic success response; no reset token or URL is returned.',
          },
          400: {
            description: 'Email address missing from request body',
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
                    minLength: 6,
                    maxLength: 72,
                    example: 'NewSecurePassword123',
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
                  password: { type: 'string', minLength: 6, maxLength: 72, example: 'NewSecurePassword@123' },
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
        summary: 'Admin/HR Creates an Account',
        description: 'Creates an employee account for an authenticated superadmin, admin, or HR user. Only admin and superadmin may assign role finance.',
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
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
                  password: { type: 'string', minLength: 6, maxLength: 72, example: 'NewSecurePassword123' },
                  department: { type: 'string', example: 'Product Engineering' },
                  designation: { type: 'string', example: 'Software Engineer' },
                  role: { type: 'string', enum: ['employee', 'finance'], default: 'employee' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Employee account created successfully; no authentication token is returned.',
          },
          401: { description: 'Authentication required' },
          403: { description: 'Only admin, HR, or superadmin can register employees' },
          409: {
            description: 'Email already exists',
          },
        },
      },
    },
    '/payroll/generate': {
      post: {
        summary: 'Generate Monthly Payslips',
        description: 'Creates pending payslips for active employees who do not already have one for the month. Basic pay is monthlySalary multiplied by basicPercentage. Percentage allowances are calculated on basic pay; fixed allowances are added as monthly amounts. No deductions are configured, so net pay equals gross pay. The action is audited per inserted payslip.',
        tags: ['Payroll'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true, content: {
            'application/json': {
              schema: {
                type: 'object', required: ['month'], properties: { month: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', example: '2026-09' } },
              }
            }
          }
        },
        responses: {
          201: { description: 'Payslips generated successfully' },
          200: { description: 'No new payslips were needed' },
          400: { description: 'Invalid month or an active employee lacks pay assignment' },
          401: { description: 'Authentication required' },
          403: { description: 'HR, admin, or superadmin role required' },
          409: { description: 'Concurrent generation created a duplicate payslip' },
        },
      },
    },
    '/payroll/payslips/{id}/approve': {
      patch: {
        summary: 'Approve Payslip',
        description: 'Approves a pending payslip and records an audit entry. Finance role only.',
        tags: ['Payroll'], security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Payslip approved' }, 401: { description: 'Authentication required' }, 403: { description: 'Finance role required' }, 404: { description: 'Payslip not found' }, 409: { description: 'Payslip is no longer pending' } },
      },
    },
    '/payroll/payslips': {
      get: {
        summary: 'List Payslips',
        description: 'Finance, HR, admin, and superadmin can view all payslips. Employees can view only their own. Supports optional month and status filters and pagination.',
        tags: ['Payroll'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { in: 'query', name: 'month', schema: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['pending', 'approved', 'sent_back'] } },
        ],
        responses: { 200: { description: 'Payslips retrieved successfully' }, 400: { description: 'Invalid month or status' }, 401: { description: 'Authentication required' }, 403: { description: 'Finance, HR, admin, superadmin, or employee role required' } },
      },
    },
    '/payroll/payslips/{id}': {
      get: {
        summary: 'Get Payslip',
        description: 'Finance, HR, admin, and superadmin can view any payslip. Employees can view only their own.',
        tags: ['Payroll'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Payslip retrieved successfully' }, 400: { description: 'Invalid payslip ID' }, 401: { description: 'Authentication required' }, 403: { description: 'Finance, HR, admin, superadmin, or employee role required' }, 404: { description: 'Payslip not found' } },
      },
    },
    '/payroll/payslips/{id}/send-back': {
      patch: {
        summary: 'Send Payslip Back',
        description: 'Returns a pending payslip for correction and records an audit entry. Finance role only.',
        tags: ['Payroll'], security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { note: { type: 'string', maxLength: 500 } } } } } },
        responses: { 200: { description: 'Payslip sent back' }, 400: { description: 'Invalid note' }, 401: { description: 'Authentication required' }, 403: { description: 'Finance role required' }, 404: { description: 'Payslip not found' }, 409: { description: 'Payslip is no longer pending' } },
      },
    },
    '/payroll/salary-structure/{id}': {
      get: {
        summary: 'Get Salary Structure by ID',
        tags: ['Payroll'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'MongoDB ObjectId of the salary structure' },
        ],
        responses: {
          200: { description: 'Salary structure retrieved successfully' },
          400: { description: 'Invalid ID format' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can access salary structures' },
          404: { description: 'Salary structure not found' },
        },
      },
      put: {
        summary: 'Update Salary Structure',
        description: 'Partial update — only send the fields you want to change. An audit log entry is recorded automatically.',
        tags: ['Payroll'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'MongoDB ObjectId of the salary structure' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  grade: { type: 'string', example: 'G8' },
                  basicPercentage: { type: 'number', minimum: 0, maximum: 100, example: 65 },
                  allowances: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['name', 'value'],
                      properties: {
                        name: { type: 'string', example: 'Housing' },
                        type: { type: 'string', enum: ['percentage', 'fixed'], default: 'percentage' },
                        value: { type: 'number', minimum: 0, example: 20 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Salary structure updated successfully' },
          400: { description: 'No valid fields provided or invalid values' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can manage salary structures' },
          404: { description: 'Salary structure not found' },
          409: { description: 'A salary structure for this grade already exists' },
        },
      },
      delete: {
        summary: 'Delete Salary Structure',
        description: 'Permanently removes a salary grade. An audit log entry is recorded automatically.',
        tags: ['Payroll'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'MongoDB ObjectId of the salary structure' },
        ],
        responses: {
          200: { description: 'Salary structure deleted successfully' },
          400: { description: 'Invalid ID format' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only admin, HR, or superadmin can manage salary structures' },
          404: { description: 'Salary structure not found' },
        },
      },
    },
    '/audit-log': {
      get: {
        summary: 'List Audit Log Entries',
        description:
          'Returns a paginated, filterable list of audit log entries. ' +
          'Restricted to superadmin and admin roles.',
        tags: ['Audit Log'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 }, description: 'Page number' },
          { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, description: 'Results per page (max 100)' },
          { in: 'query', name: 'actor', schema: { type: 'string' }, description: 'Filter by actor (User ObjectId)' },
          { in: 'query', name: 'action', schema: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'LOGIN', 'LOGOUT', 'PASSWORD_RESET', 'ACTIVATE', 'DEACTIVATE', 'OTHER'] }, description: 'Filter by action verb' },
          { in: 'query', name: 'resource', schema: { type: 'string', example: 'SalaryStructure' }, description: 'Filter by entity type' },
          { in: 'query', name: 'resourceId', schema: { type: 'string' }, description: 'Filter by specific document ID' },
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date' }, description: 'Start date (ISO 8601), inclusive' },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date' }, description: 'End date (ISO 8601), inclusive' },
        ],
        responses: {
          200: { description: 'Audit log entries retrieved with pagination metadata' },
          400: { description: 'Invalid date filter' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only superadmin and admin can view the audit log' },
        },
      },
    },
    '/reports/attendance-summary': {
      get: {
        summary: 'Get Attendance Summary',
        description: 'Aggregates attendance records by status and distinct employee. Restricted to superadmin, admin, and HR.',
        tags: ['Reports'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date' }, description: 'Optional inclusive UTC date (YYYY-MM-DD)' },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date' }, description: 'Optional inclusive UTC date (YYYY-MM-DD)' },
        ],
        responses: {
          200: {
            description: 'Attendance summary retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        employeeCount: { type: 'integer' },
                        byStatus: { type: 'object', additionalProperties: { type: 'integer' } },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Invalid date or from date after to date' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'HR/Admin role required' },
        },
      },
    },
    '/reports/leave-summary': {
      get: {
        summary: 'Get Leave Summary',
        description: 'Aggregates leave requests by status and leave type. Optional date bounds filter request start dates. Restricted to superadmin, admin, and HR.',
        tags: ['Reports'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date' }, description: 'Optional inclusive request start date (YYYY-MM-DD)' },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date' }, description: 'Optional inclusive request start date (YYYY-MM-DD)' },
        ],
        responses: {
          200: {
            description: 'Leave summary retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        byStatus: { type: 'object', additionalProperties: { type: 'integer' } },
                        byType: { type: 'object', additionalProperties: { type: 'integer' } },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Invalid date or from date after to date' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'HR/Admin role required' },
        },
      },
    },
    '/reports/payroll-summary': {
      get: {
        summary: 'Get Payroll Summary',
        description: 'Aggregates actual payslip totals and status counts from the Payslip collection. Optionally filter by month. Restricted to superadmin, admin, and HR.',
        tags: ['Reports'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'month', schema: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', example: '2026-09' }, description: 'Optional payslip month filter in YYYY-MM format' },
        ],
        responses: {
          200: {
            description: 'Payroll totals and payslip status breakdown retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        month: { type: 'string', nullable: true, example: '2026-09' },
                        totalPayslips: { type: 'integer', example: 12 },
                        totalGrossPay: { type: 'number', example: 1200000 },
                        totalDeductions: { type: 'number', example: 80000 },
                        totalNetPay: { type: 'number', example: 1120000 },
                        averageNetPay: { type: 'number', example: 93333.33 },
                        byStatus: {
                          type: 'object',
                          properties: {
                            pending: { type: 'integer' },
                            approved: { type: 'integer' },
                            sent_back: { type: 'integer' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'HR/Admin role required' },
          400: { description: 'month must use YYYY-MM format' },
        },
      },
    },
    '/audit-log/{id}': {
      get: {
        summary: 'Get Single Audit Log Entry',
        tags: ['Audit Log'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'MongoDB ObjectId of the audit log entry' },
        ],
        responses: {
          200: { description: 'Audit log entry retrieved successfully' },
          400: { description: 'Invalid ID format' },
          401: { description: 'Unauthorized - Invalid or missing token' },
          403: { description: 'Only superadmin and admin can view the audit log' },
          404: { description: 'Audit log entry not found' },
        },
      },
    },
    '/onboarding': {
      get: {
        summary: 'List Onboarding Checklists',
        tags: ['Onboarding'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'] } },
          { in: 'query', name: 'employee', schema: { type: 'string' } },
          { in: 'query', name: 'candidate', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Onboarding checklists retrieved successfully' },
          401: { description: 'Unauthorized' },
          403: { description: 'HR/Admin role required' },
        },
      },
      post: {
        summary: 'Create Onboarding Checklist',
        tags: ['Onboarding'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', example: 'Engineering Onboarding Checklist' },
                  employee: { type: 'string' },
                  candidate: { type: 'string' },
                  targetCompletionDate: { type: 'string', format: 'date' },
                  tasks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        category: { type: 'string', enum: ['Documentation', 'IT Setup', 'HR Orientation', 'Training', 'General'] },
                        documentRequirement: {
                          type: 'string',
                          enum: ['identityDocuments', 'employmentDocuments'],
                          description: 'For Documentation tasks: identity requires approved Identification, Personal, and Academic documents; employment requires approved Employment and Tax documents.',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Onboarding checklist created' },
          400: { description: 'Invalid payload' },
        },
      },
    },
    '/onboarding/my-onboarding': {
      get: {
        summary: 'Get Current User Onboarding Checklist',
        tags: ['Onboarding'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Active onboarding checklist retrieved successfully' },
          404: { description: 'No active onboarding checklist found' },
        },
      },
    },
    '/onboarding/{id}': {
      get: {
        summary: 'Get Onboarding Checklist Details',
        tags: ['Onboarding'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Onboarding checklist details' },
          404: { description: 'Not found' },
        },
      },
      patch: {
        summary: 'Update Onboarding Checklist',
        tags: ['Onboarding'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  status: { type: 'string', enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated successfully' },
        },
      },
      delete: {
        summary: 'Delete Onboarding Checklist',
        tags: ['Onboarding'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Deleted successfully' },
        },
      },
    },
    '/onboarding/{id}/tasks': {
      post: {
        summary: 'Add Task to Onboarding Checklist',
        tags: ['Onboarding'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  category: { type: 'string', enum: ['Documentation', 'IT Setup', 'HR Orientation', 'Training', 'General'] },
                  documentRequirement: {
                    type: 'string',
                    enum: ['identityDocuments', 'employmentDocuments'],
                    description: 'Optional auto-completion rule; every required document category must be approved.',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Task added successfully' },
        },
      },
    },
    '/onboarding/{id}/tasks/{taskId}': {
      patch: {
        summary: 'Update Task in Onboarding Checklist',
        tags: ['Onboarding'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'taskId', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['Pending', 'In Progress', 'Completed'] },
                  description: { type: 'string' },
                  documentRequirement: {
                    type: 'string',
                    enum: ['identityDocuments', 'employmentDocuments'],
                    description: 'Optional auto-completion rule for Documentation tasks; set null or empty to clear.',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Task updated successfully' },
        },
      },
      delete: {
        summary: 'Delete Task from Onboarding Checklist',
        tags: ['Onboarding'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'taskId', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Task deleted successfully' },
        },
      },
    },
    '/onboarding/trigger-from-candidate/{candidateId}': {
      post: {
        summary: 'Trigger Onboarding Checklist from Hired Candidate',
        tags: ['Onboarding'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'candidateId', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Onboarding checklist triggered successfully' },
        },
      },
    },
    '/recruitment/candidates/{candidateId}/hire': {
      post: {
        summary: 'Hire Candidate and Trigger Onboarding Checklist',
        description: 'Candidates must be at the Offer stage. Hired candidates sharing an email address reuse one onboarding checklist.',
        tags: ['Recruitment'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'candidateId', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Candidate hired and onboarding initialized successfully' },
          409: { description: 'Candidate must reach Offer before hiring' },
        },
      },
    },
    '/recruitment/candidates/{candidateId}/onboarding': {
      get: {
        summary: 'Get Candidate Onboarding Checklist',
        tags: ['Recruitment'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'candidateId', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Candidate onboarding retrieved successfully' },
        },
      },
    },
    '/documents': {
      get: {
        summary: 'List Documents',
        tags: ['Documents'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 } },
          { in: 'query', name: 'category', schema: { type: 'string' } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['Pending', 'Approved', 'Rejected'] } },
        ],
        responses: {
          200: { description: 'Documents retrieved successfully' },
        },
      },
      post: {
        summary: 'Deprecated document registration endpoint',
        description: 'This endpoint rejects requests because client-supplied file URLs and metadata are not verified. Use POST /documents/upload and send the raw file bytes as application/octet-stream.',
        tags: ['Documents'],
        security: [{ BearerAuth: [] }],
        responses: {
          400: { description: 'Unverified file metadata is not accepted' },
        },
      },
    },
    '/documents/upload': {
      post: {
        summary: 'Upload a Document File',
        description: 'Send raw file bytes as application/octet-stream. The server verifies the file signature and enforces a 4MB per-file limit before storing in MongoDB. Supported types: PDF, JPEG, PNG, WebP, DOC, DOCX. Pass metadata in query parameters. Storage quotas default to 50MB per uploader and 1GB total; configure DOCUMENT_USER_STORAGE_QUOTA_BYTES and DOCUMENT_TOTAL_STORAGE_QUOTA_BYTES. Vercel deployments are limited to 4MB to remain below the platform request-body limit.',
        tags: ['Documents'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'title', required: true, schema: { type: 'string', maxLength: 200 } },
          { in: 'query', name: 'category', schema: { type: 'string', enum: ['Personal', 'Identification', 'Academic', 'Employment', 'Tax', 'Legal', 'Onboarding', 'Other'] } },
          { in: 'query', name: 'description', schema: { type: 'string', maxLength: 500 } },
          { in: 'query', name: 'employee', schema: { type: 'string', description: 'HR/admin only' } },
          { in: 'query', name: 'candidate', schema: { type: 'string', description: 'HR/admin only' } },
          { in: 'query', name: 'onboarding', schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/octet-stream': {
              schema: { type: 'string', format: 'binary' },
            },
          },
        },
        responses: {
          201: { description: 'Validated document uploaded successfully' },
          413: { description: 'File exceeds the 4MB limit or uploader storage quota' },
          415: { description: 'Unsupported or invalid file signature' },
          507: { description: 'Total document storage quota has been reached' },
        },
      },
    },
    '/documents/my-documents': {
      get: {
        summary: 'Get My Documents',
        tags: ['Documents'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'My documents retrieved successfully' },
        },
      },
    },
    '/documents/{id}': {
      get: {
        summary: 'Get Document Details',
        tags: ['Documents'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Document details' },
        },
      },
      delete: {
        summary: 'Delete Document',
        tags: ['Documents'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Document deleted successfully' },
        },
      },
    },
    '/documents/{id}/file': {
      get: {
        summary: 'Download Document File',
        tags: ['Documents'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'File bytes', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
          403: { description: 'Not authorized to download document' },
          404: { description: 'Document or file not found' },
        },
      },
    },
    '/documents/{id}/status': {
      patch: {
        summary: 'Approve or Reject Document',
        tags: ['Documents'],
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['Approved', 'Rejected'] },
                  rejectionReason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Document status updated successfully' },
        },
      },
    },
  },
};

module.exports = swaggerDocument;
