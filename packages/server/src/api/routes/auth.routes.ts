// 인증 라우트 — POST login, refresh, logout, GET me

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, refreshTokenSchema, registerSchema } from '@cowtalk/shared';
import * as authController from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/login', validate({ body: loginSchema }), authController.login);
authRouter.post('/refresh', validate({ body: refreshTokenSchema }), authController.refresh);
authRouter.post('/logout', authenticate, authController.logout);
authRouter.get('/me', authenticate, authController.me);
// 계정 생성은 관리자 전용 — government_admin만 user:create 권한 보유.
// 공개 self-register는 /onboarding(역할 farmer 강제)으로 분리한다.
authRouter.post(
  '/register',
  authenticate,
  requirePermission('user', 'create'),
  validate({ body: registerSchema }),
  authController.register,
);
authRouter.post('/quick-login', authController.quickLogin);
authRouter.post('/switch-role', authenticate, authController.switchRole);
authRouter.post('/onboarding', authController.onboarding);
