// 인증 라우트 — POST login, refresh, logout, GET me

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, refreshTokenSchema, registerSchema } from '@cowtalk/shared';
import * as authController from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/login', validate({ body: loginSchema }), authController.login);
authRouter.post('/refresh', validate({ body: refreshTokenSchema }), authController.refresh);
authRouter.post('/logout', authenticate, authController.logout);
authRouter.get('/me', authenticate, authController.me);
authRouter.post('/register', validate({ body: registerSchema }), authController.register);
authRouter.post('/quick-login', authController.quickLogin);
authRouter.post('/switch-role', authenticate, authController.switchRole);
authRouter.post('/onboarding', authController.onboarding);
