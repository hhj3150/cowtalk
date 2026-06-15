// 인증 라우트 — POST login, refresh, logout, GET me

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { devOnly } from '../middleware/dev-only.js';
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
// 퀵 로그인(무비밀번호 데모 로그인)은 개발 환경에서만 노출 — 프로덕션은 404로 차단(인증 우회 방지).
// 퀵 로그인(무비밀번호 데모 로그인)은 개발 환경에서만 노출 — 프로덕션은 404로 차단(인증 우회 방지).
authRouter.post('/quick-login', devOnly, authController.quickLogin);
authRouter.post('/switch-role', authenticate, authController.switchRole);
authRouter.post('/onboarding', authController.onboarding);
