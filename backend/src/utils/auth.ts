import jwt from 'jsonwebtoken';
import { Request } from 'express';

const JWT_SECRET = process.env.JWT_SECRET!;

export const verifyToken = (req: Request): any => {
  // Log all headers for debugging
  console.log('🔍 verifyToken headers:', JSON.stringify(req.headers, null, 2));

  // ----- TEST USER BYPASS via header -----
  const testUserHeader = req.headers['x-test-user'];
  console.log('🔍 testUserHeader value:', testUserHeader);
  if (testUserHeader === 'samuel@test.com') {
    console.log('✅ verifyToken: bypass for test user (header)');
    return {
      id: 'e0f62298-03f1-4908-bac2-8415e5a9d0e5',
      email: 'samuel@test.com',
      role: 'boss',
      companyId: 'ed1887d9-3ffd-46e4-b281-338c8ad03a66'
    };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }

  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    throw new Error('Invalid token');
  }
};