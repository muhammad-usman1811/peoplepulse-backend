# PeoplePulse HRMS Backend API 🏢

Cross-platform RESTful API built with **Node.js**, **Express**, and **MongoDB** designed to seamlessly power both:
- 📱 **Mobile Application**: Flutter (Android & iOS)
- 💻 **Web Application**: React

---

## 🔒 Security Architecture

1. **Password Protection**:
   - Passwords are encrypted using **`bcryptjs`** with work factor 12.
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

# Setup environment variables (already configured in .env)
# Review .env for PORT, MONGO_URI, JWT_SECRET, and ENCRYPTION_KEY
```

### 3. Seed Super Admin Account
Pre-populates the database with initial accounts:
```bash
npm run seed
```

**Default Test Credentials:**
| Role | Email | Password |
| :--- | :--- | :--- |
| **Super Admin** 👑 | `admin@peoplepulse.com` | `Password@123` |
| **Employee** 👤 | `sarah.connor@peoplepulse.com` | `Password@123` |

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
  "password": "Password@123"
}
```
- **Response**: `200 OK`
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "664fa1b234567890abcdef12",
      "name": "Super Administrator",
      "email": "admin@peoplepulse.com",
      "role": "superadmin",
      "department": "Executive HR",
      "designation": "Chief HR Officer",
      "lastLogin": "2026-09-21T11:15:00.000Z"
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
  "message": "Password reset link generated successfully",
  "data": {
    "expiresInMinutes": 30
  }
}
```

In non-production environments only, the response also includes `resetUrl` and `resetToken` for local testing. Production responses never expose the token.

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
- **GET** `/employees?page=1&limit=10&search=ali&department=Engineering&location=Head%20Office&status=active`
- **GET** `/employees/:id`
- **POST** `/employees` with `name`, `email`, and `password` (optional `employeeId`, `phoneNumber`, `department`, `designation`, `location`, `status`, `manager`)
- **PUT** `/employees/:id` (supports `location`, `status: active|on-leave`, and `isActive`)
- **DELETE** `/employees/:id` (soft-deactivates the employee)

All Employee endpoints require `Authorization: Bearer <your_jwt_token>`. Listing and detail are restricted to `superadmin`, `admin`, or `hr`; create, update, and deactivate require the same roles and only target users with `role: employee`.

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
