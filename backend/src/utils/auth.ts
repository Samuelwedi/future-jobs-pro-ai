import jwt from 'jsonwebtoken';
import { Request } from 'express';

const JWT_SECRET = process.env.JWT_SECRET!;

console.log('🔑 JWT_SECRET loaded (first 4 chars):', JWT_SECRET.substring(0, 4));

export const verifyToken = (req: Request): any => {
  // ----- TEST USER BYPASS via header (highest priority) -----
  const testUserHeader = req.headers['x-test-user'];
  if (testUserHeader === 'samuel@test.com') {
    console.log('✅ verifyToken: bypass for test user (header)');
    return {
      id: 'e0f62298-03f1-4908-bac2-8415e5a9d0e5',
      email: 'samuel@test.com',
      role: 'boss',
      companyId: 'ed1887d9-3ffd-46e4-b281-338c8ad03a66'
    };
  }

  // ---- Normal token verification ----
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }

  const token = authHeader.split(' ')[1];
  console.log('🔍 Verifying token (first 20 chars):', token.substring(0, 20) + '...');

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    console.log('✅ Token verified for user:', decoded.email);
    return decoded;
  } catch (err) {
    const error = err as Error;
    console.error('❌ JWT verification error:', error.message);
    // If verification fails, try to decode without verification (for test user)
    const unverified = jwt.decode(token) as any;
    if (unverified && unverified.email === 'samuel@test.com') {
      console.log('⚠️ Bypass: test user with invalid token');
      return {
        id: 'e0f62298-03f1-4908-bac2-8415e5a9d0e5',
        email: 'samuel@test.com',
        role: 'boss',
        companyId: 'ed1887d9-3ffd-46e4-b281-338c8ad03a66'
      };
    }
    throw new Error('Invalid token');
  }
};