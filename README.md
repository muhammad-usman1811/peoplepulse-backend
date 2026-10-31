# PeoplePulse HRMS Backend API 🏢

Cross-platform RESTful API built with **Node.js**, **Express**, and **MongoDB** designed to seamlessly power both:
- 📱 **Mobile Application**: Flutter (Android & iOS)
- 💻 **Web Application**: React

---

## 🔒 Security Architecture

1. **Password Protection**:
  - Passwords are one-way hashed using **`bcryptjs`** with work factor 12.
   - Salted and hashed before storing in MongoDB.
   - Irreversible one-way cryptographic hash — plain passwords are never saved and cannot be viewed by anyone, including database administrators.
   - Database queries exclude `password` by default (`select: false`).

2. **Sensitive Profile Fields (Name & Personal Information)**:
   - Field-level encryption at rest using **AES-256-GCM** authenticated cipher.
   - Stored in the database in the format `iv:authTag:ciphertext`.
   - Automatically decrypted on API JSON responses for authenticated requests.

3. **Authentication & Session**:
   - Stateless **JSON Web Tokens (JWT)** passed via `Authorization: Bearer <token>`.
   - Brute-force protection on authentication routes with `express-rate-limit`.
   - Security headers enforced with `helmet`.
   - Cross-Origin Resource Sharing (`cors`) configured for React web clients while allowing mobile clients.

---

## 🚀 Getting Started

### 1. Requirements
- Node.js (v18+)
- MongoDB running locally on `mongodb://127.0.0.1:27017` or MongoDB Atlas URI.

### 2. Install & Configure
```bash
# Install dependencies
npm install

# Copy .env.example to .env and provide local values.
# Production requires MONGO_URI, JWT_SECRET, ENCRYPTION_KEY, and APP_TIMEZONE.
```

Use `MONGO_TEST_URI` for test scripts; its database name must end in `_test`. The default `npm test` runs database-free unit tests. HTTP integration scripts additionally require the API server to be running with `NODE_ENV=test` and `MONGO_URI` set to that same test database; the server refuses test mode with a non-test database name.

```powershell
Copy-Item .env.example .env
$env:NODE_ENV = 'test'
$env:MONGO_URI = $env:MONGO_TEST_URI
npm start
```

In a second terminal, set `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` to a Super Admin fixture in that disposable database, then run `npm run test:api`, `npm run test:employee`, `npm run test:leave-wfh`, or `npm run test:audit`. The password should match the test seed's `SEED_PASSWORD`; never reuse production credentials.

### 3. Seed Super Admin Account
Pre-populates the database with initial accounts:
```bash
npm run seed
```

The seed script requires `SEED_PASSWORD` and is disabled in production.

### 4. Start the Server
```bash
# Production mode
npm start

# Development mode with auto-reload
npm run dev
```

---

## 📡 API Endpoints

Base URL: `http://localhost:5000/api`

### 1. Health Check
- **GET** `/health`
- **Response**: `200 OK`
```json
{
  "success": true,
  "message": "PeoplePulse HRMS API is online",
  "data": {
    "service": "PeoplePulse Backend API",
    "status": "healthy"
  }
}
```

### 2. User Login
- **POST** `/auth/login`
- **Body**:
```json
{
  "email": "admin@peoplepulse.com",
  "password": "<your-SEED_PASSWORD>"
}
```

### 2.1 Employee Registration
- **POST** `/auth/register` requires a Bearer token from a `superadmin`, `admin`, or `hr` account.
- Anonymous registration is disabled and returns `401`; authenticated users without an allowed role receive `403`.
- The current backend supports employee creation by an administrator or HR. Public self-registration policy remains pending product confirmation; this endpoint does not provide public onboarding.
- **Response**: `201 Created`; the newly created account must sign in separately.
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "664fa1b234567890abcdef12",
      "name": "Ayesha Khan",
      "email": "ayesha@example.com",
      "role": "employee",
      "department": "Engineering",
      "designation": "Software Engineer"
    }
  }
}
```

### 3. Forgot Password
- **POST** `/auth/forgot-password`
- **Body**:
```json
{
  "email": "admin@peoplepulse.com"
}
```
- **Response**: `200 OK`
```json
{
  "success": true,
  "message": "If an account exists with that corporate email, a password reset link has been dispatched."
}
```

The API returns the same response for known/unknown emails and email-delivery/configuration failures. It never returns the reset token or URL, including development. Configure SMTP and frontend URL variables so the single-use token is delivered only through the password-reset email.

### 4. Reset Password
- **PUT** `/auth/reset-password/:resetToken`
- **POST** `/auth/reset-password` with `{ "token": "...", "password": "..." }`
- **Body**:
```json
{
  "password": "NewSecurePassword123"
}
```
- **Response**: `200 OK`

The email link opens `GET /reset-password.html?token=...`, which submits the new password to the reset API. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `EMAIL_USER`, and `EMAIL_PASS` in `.env`. For Gmail, use an App Password.

### 5. Employee Management (Admin/HR only for writes)
- **GET** `/employees?page=1&limit=10&search=ali&department=Engineering&designation=Engineer&location=Head%20Office&status=active` (`page` must be positive; `limit` must be 1-100)
- **GET** `/employees/:id`
- **POST** `/employees` with `name`, `email`, and `password` (optional `employeeId`, `phoneNumber`, `department`, `designation`, `location`, `status`, `manager`)
- **PUT** `/employees/:id` (supports `location`, `status: active|on-leave`, and `isActive`)
- **DELETE** `/employees/:id` (soft-deactivates the employee)

Optional phone numbers must contain 7-15 digits with an optional international `+` prefix. Invalid pagination, phone numbers, and employee IDs return `400`.

All Employee endpoints require `Authorization: Bearer <your_jwt_token>`. Listing and detail are restricted to `superadmin`, `admin`, or `hr`; create, update, and deactivate require the same roles and only target users with `role: employee`.

Employee `User.location` is currently stored as a canonical `Location.name` string for API compatibility. `Department.location` is a `Location` ObjectId reference and is populated as a location document in department responses. Employee APIs accept/filter by location name; department APIs accept/filter by location ID.

### Leave &amp; WFH Requests
- **POST** `/leave-requests`, **POST** `/wfh-requests` to submit a request (employees only, need an assigned manager).
- **GET** `/leave-requests/my`, **GET** `/wfh-requests/my` to list your own requests.
- **PATCH** `/leave-requests/:id/approve`, `/leave-requests/:id/reject` (and the `/wfh-requests` equivalents) for the assigned manager to decide.
- Approval and rejection notify the employee for both leave and WFH requests. Notification delivery is best effort; failures are recorded in structured server logs with `userId`, notification `type`, and error message, and do not undo the decision.

### Performance Reviews
- **GET** `/performance/cycles?status=open&page=1&limit=20` to list cycles for any authenticated user; employees can use this to select an open cycle.
- **POST** `/performance/cycles` to create a review period (superadmin, admin, or HR); optional `startDate` and `endDate` must both be valid `YYYY-MM-DD` dates, with start on/before end.
- **PATCH** `/performance/cycles/:cycleId/close` to close an open cycle (superadmin, admin, or HR); repeat close attempts return `409`.
- **GET** `/performance/cycles/:cycleId/reviews` to list all reviews in a cycle (superadmin, admin, or HR).
- **POST** `/performance/cycles/:cycleId/reviews` to submit an employee self-review with a rating from 1 to 5 and optional `goals` containing numeric KPI targets/actuals.
- **GET** `/performance/reviews/my` to list reviews submitted by the authenticated employee.
- **GET** `/performance/team?page=1&limit=20` to list reviews for the authenticated manager's direct reports.
- **GET** `/performance/reviews/:reviewId` is limited to the reviewed employee, their current manager, or HR/admin roles; other authenticated users receive `403`.
- **PUT** `/performance/reviews/:reviewId/manager-review` accepts `managerRating` (not `rating`). Managers can update existing goal status and KPI actuals, but cannot replace employee-authored goal definitions or targets.
- Performance JSON requests support up to 256 KB for the bounded goals/KPI payload; the other API routes retain the 10 KB JSON limit.
- Import `PeoplePulse_Performance_API.postman_collection.json` for the role-based Postman flow. Configure the admin, assigned manager, employee, and unrelated outsider emails; use the test password for the three test accounts. The assigned manager account must have role `employee`, and the reviewed employee's `manager` field must reference that manager's user ID. The outsider must not be assigned to that employee. Run the collection in order to verify allowed access for employee/manager/HR and `403` responses for an outsider.

### Recruitment
- **POST** `/recruitment/job-postings` (HR/admin) with required `title` and `department`.
- **POST** `/recruitment/candidates` (HR/admin) with `name`, `email`, and the job posting ID; a new candidate starts at `Applied`.
- **PATCH** `/recruitment/candidates/:candidateId/stage` (HR/admin) with one of `Applied`, `Screening`, `Interview`, `Offer`, or `Hired`.
- Import `PeoplePulse_Recruitment_API.postman_collection.json` and configure the HR/admin login variables. Run the requests in order to create a posting, add a candidate, validate missing posting fields, and move the candidate through every stage.

### Attendance
- **POST** `/attendance/clock-in`
- **POST** `/attendance/clock-out`
- **GET** `/attendance/me?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=30`
- **GET** `/attendance/team?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=30` (direct reports)
- **GET** `/attendance?employeeId=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=30` (Admin/HR, all employees)
- **GET** `/v1/attendance?date=YYYY-MM-DD&page=1&limit=10` (HR only): HR Attendance List for one day. `date` defaults to the latest day with attendance and cannot be in the future; `limit` is 1-50. Returns `date`, `records` (employee ID, name, department, designation plus clock-in/out and status only), and `pagination` (`page`, `limit`, `totalRecords`, `totalPages`).
- **GET** `/v1/attendance/export?format=csv|pdf&date=YYYY-MM-DD` (HR and Admin): streams every attendance record for that day as a file download (`attendance-report-YYYY-MM-DD.csv` or `.pdf`), selected and ordered exactly like the HR Attendance List. Both parameters are required, `date` cannot be in the future, and `page` and `limit` are ignored. Columns: employee name, employee ID, date, check-in, check-out, status, working hours. An empty day returns a header-only CSV or a PDF saying "No records found for this date". The PDF uses a Latin font, so employee names must be in English; the CSV supports any script. Responses are sent with `Cache-Control: no-store`.

Attendance timestamps are stored in UTC. Calendar dates and the 9:00 AM late threshold use `APP_TIMEZONE` (default `Asia/Karachi`).

### Reports (Admin/HR)
- **GET** `/reports/attendance-summary?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=employee|department`: totals by attendance status and distinct employees. Optional `groupBy` adds `groups` keyed by employee ID or User department. If neither date is provided, the current UTC calendar month is used. The response returns the effective `from` and `to`.
- **GET** `/reports/leave-summary?from=YYYY-MM-DD&to=YYYY-MM-DD`: totals by leave status and type. A request is included when it overlaps the range (`startDate <= to` and `endDate >= from`). If neither date is provided, the current UTC calendar month is used; the response returns the effective `from` and `to`.
- **GET** `/reports/payroll-summary?month=YYYY-MM`: totals and status counts from generated payslips; `month` is optional.
- **GET** `/reports/performance-summary?cycleId=<id>`: review counts, average self/manager ratings, and self-rating distribution; `cycleId` is optional. Reports require a superadmin, admin, or HR account.

Date bounds may be supplied independently. With only `from`, attendance is unbounded above and leave requests must end on/after that date; with only `to`, attendance is unbounded below and leave requests must start on/before that date.

### Payslip Generation
- **POST** `/payroll/generate` with `{ "month": "YYYY-MM" }` creates payslips for active employees with valid salary assignments.
- Employees who already have a payslip for that month are skipped. The response includes `count`, `skippedCount`, and `skippedEmployees` (employee IDs); repeating a completed request returns `200` with zero newly created payslips when all employees were already processed.
- Payslip approval and send-back notifications are best effort. Notification failures are recorded in structured server logs with `userId`, notification `type`, and error message, and do not fail the payroll decision.

### Payroll Salary Structures
- **GET** `/payroll/salary-structure`, **GET** `/payroll/salary-structure/:id` (Admin/HR)
- **POST** `/payroll/salary-structure`, **PUT** `/payroll/salary-structure/:id`, **DELETE** `/payroll/salary-structure/:id` (Admin/HR)

Example request:
```json
{
  "grade": "G7",
  "basicPercentage": 60,
  "allowances": [
    { "name": "Housing", "type": "percentage", "value": 20 },
    { "name": "Transport", "type": "fixed", "value": 15000 }
  ]
}
```

### Documents
- **POST** `/documents/upload` (`multipart/form-data`) with text field `category` and file field `file`.
- **GET** `/documents/me` lists metadata for documents uploaded by the authenticated user; file contents are not included.
- **GET** `/documents/employee/:employeeId` (superadmin, admin, or HR) lists metadata for an employee.
- **DELETE** `/documents/:id` removes a document owned by the authenticated user; superadmin, admin, and HR may remove any employee document.
- Uploads accept PDF, JPEG, and PNG files up to **5 MB**. The server validates the declared MIME type, extension, and file signature, then stores the file bytes in MongoDB. File contents are never returned by list or delete endpoints.

### Audit Log
- **GET** `/audit-logs`, **GET** `/audit-logs/:id` (superadmin only) — paginated audit entries. Filter with `entityType`, `actor`, `from`, and `to` (inclusive UTC date bounds); `action` and `resourceId` are also supported. The legacy `/audit-log` route remains available. Password values and profile field values are not stored in audit metadata.

### System Configuration
- **GET** `/system-config` (authenticated users) returns configured key/value settings.
- **PUT** `/system-config` (superadmin only) creates or updates one setting with JSON `{ "key": "leave.annualAllocation", "value": { "days": 20 } }`. Successful changes are recorded in the audit log as `SystemConfig` entries, including before/after values.

### Department Location Backfill
Run `npm run backfill:department-locations` to preview legacy string values in `Department.location`. Resolve any unmatched or ambiguous values first, then apply mappings with `npm run backfill:department-locations -- --apply`.

### 5. Get Logged-in Profile (Protected)
- **GET** `/auth/me`
- **Header**: `Authorization: Bearer <your_jwt_token>`
- **Response**: `200 OK`
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "user": {
      "id": "664fa1b234567890abcdef12",
      "name": "Super Administrator",
      "email": "admin@peoplepulse.com",
      "role": "superadmin",
      "department": "Executive HR",
      "designation": "Chief HR Officer",
      "isActive": true
    }
  }
}
```

---

## 📱 Flutter Mobile Integration Guide

Share this with your Flutter teammate:

### Using `http` or `dio`

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthService {
  // Use 10.0.2.2 for Android Emulator, or your LAN IP (e.g., 192.168.1.X) for physical devices
  static const String baseUrl = 'http://10.0.2.2:5000/api';
  final storage = const FlutterSecureStorage();

  // 1. Login
  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );

    final resData = jsonDecode(response.body);
    if (response.statusCode == 200 && resData['success'] == true) {
      final token = resData['data']['token'];
      // Store token securely
      await storage.write(key: 'jwt_token', value: token);
      return resData['data']['user'];
    } else {
      throw Exception(resData['message'] ?? 'Login failed');
    }
  }

  // 2. Fetch User Profile
  Future<Map<String, dynamic>> getProfile() async {
    final token = await storage.read(key: 'jwt_token');
    final response = await http.get(
      Uri.parse('$baseUrl/auth/me'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
    );

    final resData = jsonDecode(response.body);
    if (response.statusCode == 200 && resData['success'] == true) {
      return resData['data']['user'];
    } else {
      throw Exception(resData['message'] ?? 'Failed to load profile');
    }
  }

  // 3. Forgot Password
  Future<void> forgotPassword(String email) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/forgot-password'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email}),
    );
    final resData = jsonDecode(response.body);
    if (response.statusCode != 200) {
      throw Exception(resData['message'] ?? 'Request failed');
    }
  }
}
```

---

## 💻 React Web Integration Guide

Share this with your React teammate:

### Using `axios`

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically inject JWT Token from localStorage into all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 1. Login Function
export const loginUser = async (email, password) => {
  const response = await api.post('/auth/login', { email, password });
  if (response.data.success) {
    const { token, user } = response.data.data;
    localStorage.setItem('token', token);
    return user;
  }
  throw new Error(response.data.message);
};

// 2. Forgot Password
export const requestPasswordReset = async (email) => {
  const response = await api.post('/auth/forgot-password', { email });
  return response.data;
};

// 3. Reset Password with Token
export const resetPassword = async (resetToken, password) => {
  const response = await api.put(`/auth/reset-password/${resetToken}`, { password });
  return response.data;
};

// 4. Get Current User Profile
export const fetchCurrentUser = async () => {
  const response = await api.get('/auth/me');
  return response.data.data.user;
};

// 5. Logout
export const logoutUser = () => {
  localStorage.removeItem('token');
  window.location.href = '/login';
};

export default api;
```
