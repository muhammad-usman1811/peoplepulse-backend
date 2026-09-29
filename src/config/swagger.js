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
          content: { 'application/json': { schema: {
            type: 'object', required: ['name', 'email', 'password'],
            properties: {
              name: { type: 'string', example: 'Jane Doe' }, email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 6, maxLength: 72 }, employeeId: { type: 'string', maxLength: 64 },
              phoneNumber: { type: 'string', maxLength: 30, example: '+92 300 1234567' },
              department: { type: 'string' }, designation: { type: 'string' }, location: { type: 'string' },
              manager: { type: 'string', nullable: true },
              status: { type: 'string', enum: ['active', 'on-leave'], default: 'active' },
            },
          } } },
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
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', properties: { name: { type: 'string' }, phoneNumber: { type: 'string', maxLength: 30 }, employeeId: { type: 'string', maxLength: 64, nullable: true }, department: { type: 'string' }, designation: { type: 'string' }, location: { type: 'string' }, status: { type: 'string', enum: ['active', 'on-leave'] }, manager: { type: 'string', nullable: true }, isActive: { type: 'boolean' } },
        } } } },
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
    '/performance/cycles/{cycleId}/reviews': {
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
    '/performance/team/reviews': {
      get: {
        summary: 'List Reviews for the Authenticated Manager Direct Reports',
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
                  rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
                  managerRating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
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
        responses: {
          200: { description: 'Manager review submitted successfully' },
          400: { description: 'Invalid review payload or closed cycle' },
          401: { description: 'Authentication required' },
          403: { description: 'Only assigned manager or HR can submit manager review' },
          404: { description: 'Review not found' },
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
        summary: 'Admin/HR Creates an Employee Account',
        description: 'Creates an employee account for an authenticated superadmin, admin, or HR user. The created employee must log in separately; no employee token is returned.',
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
          { in: 'query', name: 'action', schema: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PASSWORD_RESET', 'ACTIVATE', 'DEACTIVATE', 'OTHER'] }, description: 'Filter by action verb' },
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
  },
};

module.exports = swaggerDocument;

