const swaggerUi = require('swagger-ui-express');

const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'PeoplePulse HRMS - Auth & Password Reset API',
    description:
      'API documentation for PeoplePulse HRMS Backend. Includes Authentication (Login, Register), Forgot Password (Temporary Password dispatched to Gmail), and Change Password workflows.',
    version: '1.0.0',
    contact: {
      name: 'Backend Support',
      email: 'support@peoplepulse.com',
    },
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Local Development Server',
    },
  ],
  tags: [
    {
      name: 'Authentication',
      description: 'User registration, login, forgot password, and change password operations',
    },
    {
      name: 'System',
      description: 'Server health check and system monitoring',
    },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['System'],
        summary: 'Server Health Check',
        description: 'Check if the backend API server is running and healthy.',
        responses: {
          200: {
            description: 'Server is online and responding.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      example: 'ok',
                    },
                    timestamp: {
                      type: 'string',
                      format: 'date-time',
                      example: '2026-09-22T10:30:00.000Z',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register New User',
        description:
          'Create a new employee account. Automatically hashes the password with bcrypt before saving to MongoDB.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/RegisterRequest',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'User registered successfully.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RegisterSuccessResponse',
                },
              },
            },
          },
          400: {
            description: 'Validation error (missing fields or password too short).',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          409: {
            description: 'User with this email already exists.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          500: {
            description: 'Internal server error.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login User',
        description:
          'Authenticate an existing user using email and password. Supports login using permanent password or valid temporary password.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/LoginRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LoginSuccessResponse',
                },
              },
            },
          },
          400: {
            description: 'Missing email or password.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          401: {
            description: 'Invalid email/password or expired temporary password.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          500: {
            description: 'Internal server error.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Forgot Password (Request Temporary Password via Gmail)',
        description:
          'Step 1 of Password Reset Flow:\n1. User provides their registered email.\n2. Backend verifies email exists in MongoDB.\n3. Backend generates a secure temporary password (e.g. kY7mP9wX).\n4. Backend hashes the temporary password and updates the user password in MongoDB with a 30-minute expiration.\n5. Backend sends an email containing the temporary password directly to the user Gmail inbox.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ForgotPasswordRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Temporary password sent successfully to Gmail.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/StandardSuccessResponse',
                },
              },
            },
          },
          400: {
            description: 'Invalid or missing email address.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          404: {
            description: 'User with this email does not exist in database.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          429: {
            description: 'Rate limit exceeded (Maximum 5 requests per 15 minutes).',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          500: {
            description: 'Email service error (Check Gmail App Password in .env).',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/change-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Change Password (Set New Custom Password)',
        description:
          'Step 2 of Password Reset Flow:\n1. User provides their email, temporary password (received in Gmail) or current password, and their chosen new custom password.\n2. Backend verifies the temporary/current password against bcrypt hash in database.\n3. Backend hashes the new password and updates the database.\n4. Temporary password expiration is cleared.\n5. User can now login with their new password.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ChangePasswordRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Password updated successfully.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/StandardSuccessResponse',
                },
              },
            },
          },
          400: {
            description: 'Missing fields or new password shorter than 6 characters.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          401: {
            description: 'Current or temporary password is incorrect.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          404: {
            description: 'User not found.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          500: {
            description: 'Internal server error.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          name: {
            type: 'string',
            example: 'Muhammad Ahmed',
          },
          email: {
            type: 'string',
            format: 'email',
            example: 'ahmed@example.com',
          },
          password: {
            type: 'string',
            minLength: 6,
            example: 'secretPass123',
          },
        },
      },
      RegisterSuccessResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          message: {
            type: 'string',
            example: 'User registered successfully.',
          },
          user: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                example: '665123456789abcdef123456',
              },
              name: {
                type: 'string',
                example: 'Muhammad Ahmed',
              },
              email: {
                type: 'string',
                example: 'ahmed@example.com',
              },
              role: {
                type: 'string',
                example: 'employee',
              },
            },
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            example: 'ahmed@example.com',
          },
          password: {
            type: 'string',
            example: 'secretPass123',
          },
        },
      },
      LoginSuccessResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          message: {
            type: 'string',
            example: 'Login successful.',
          },
          user: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                example: '665123456789abcdef123456',
              },
              name: {
                type: 'string',
                example: 'Muhammad Ahmed',
              },
              email: {
                type: 'string',
                example: 'ahmed@example.com',
              },
              role: {
                type: 'string',
                example: 'employee',
              },
            },
          },
        },
      },
      ForgotPasswordRequest: {
        type: 'object',
        required: ['email'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'Registered Gmail / email address of the user.',
            example: 'ahmed@example.com',
          },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['email', 'currentPassword', 'newPassword'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'Registered email address of the user.',
            example: 'ahmed@example.com',
          },
          currentPassword: {
            type: 'string',
            description: 'Temporary password received on Gmail OR existing password.',
            example: 'kY7mP9wX',
          },
          newPassword: {
            type: 'string',
            minLength: 6,
            description: 'New password chosen by the user.',
            example: 'myNewStrongPass786',
          },
        },
      },
      StandardSuccessResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          message: {
            type: 'string',
            example: 'Password reset successfully. A temporary password has been sent to your email address.',
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          message: {
            type: 'string',
            example: 'Invalid email or password.',
          },
          error: {
            type: 'string',
            example: 'Detailed error trace if in development',
          },
        },
      },
    },
  },
};

/**
 * Configure Swagger UI & raw JSON endpoint on Express app
 * @param {import('express').Application} app
 */
const setupSwagger = (app) => {
  // Serve Interactive Swagger UI
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
      customSiteTitle: 'PeoplePulse HRMS API Docs',
    })
  );

  // Serve raw JSON spec
  app.get('/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerDocument);
  });
};

module.exports = {
  swaggerDocument,
  setupSwagger,
};
