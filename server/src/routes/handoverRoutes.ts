import express from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  createHandover,
  getHandovers,
  confirmHandover,
  updateHandover,
} from '../controllers/handoverController';

const router = express.Router();

router.post('/', authMiddleware, createHandover);
router.get('/', authMiddleware, getHandovers);
router.put('/:id/confirm', authMiddleware, confirmHandover);
router.put('/:id', authMiddleware, updateHandover);

export default router;
