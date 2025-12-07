// src/routes/subRoutes.ts
import { Router } from 'express'
import { auth, ownerOnly } from '../middleware/auth'
import {
  requestSub,
  approveRecruit,
  acceptBySub,
  finalApprove,
  getSubListForOwner,
  getSubList,
  updateSubRequest,
  cancelSubRequest,
} from '../controllers/sub.controller'

const router = Router()

// 직원 → 대타 신청
router.post('/:scheduleId/request', auth, requestSub)

// 직원 → 전체 대타 요청 목록 조회
router.get('/list', auth, getSubList)

// 직원 → 대타 요청 수정
router.put('/:id', auth, updateSubRequest)

// 직원 → 대타 요청 취소
router.delete('/:id', auth, cancelSubRequest)

// 관리자 → 대타 모집 허가
router.patch('/owner/approve/:id', auth, ownerOnly, approveRecruit)

// 직원 → 대타 수락
router.patch('/accept/:id', auth, acceptBySub)

// 관리자 → 최종 승인 (스케줄 교체)
router.patch('/owner/final/:id', auth, ownerOnly, finalApprove)

// 관리자 → 목록 조회 (Pending / Approved)
router.get('/owner', auth, ownerOnly, getSubListForOwner)

export default router
