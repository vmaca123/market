import { Request, Response } from 'express'
import SubRequest from '../models/SubRequest'
import Schedule from '../models/Schedule'
import User from '../models/User'
import { Types } from 'mongoose'
import { UserRequest } from '../middleware/auth'

// 직원이 대타 신청
export const requestSub = async (req: UserRequest, res: Response) => {
  try {
    const { scheduleId } = req.params
    const { reason } = req.body

    const requesterId = req.user?.userId
    if (!requesterId)
      return res.status(401).json({ message: '로그인이 필요합니다.' })

    if (!reason || !reason.trim())
      return res.status(400).json({ message: '사유가 필요합니다.' })

    const schedule = await Schedule.findById(scheduleId)
    if (!schedule) {
      return res.status(404).json({ message: '스케줄이 존재하지 않습니다.' })
    }

    const user = await User.findById(requesterId)
    if (!user) {
      return res.status(404).json({ message: '사용자가 없습니다.' })
    }

    const exist = await SubRequest.findOne({
      scheduleId,
      requester: requesterId,
      status: { $ne: 'cancelled' },
    })

    if (exist) {
      return res.status(400).json({ message: '이미 대타 요청이 존재합니다.' })
    }

    await SubRequest.create({
      scheduleId: new Types.ObjectId(scheduleId),
      requester: new Types.ObjectId(requesterId),
      requesterName: user.name as string, // TS 안전하게 명시
      reason,
      substitute: undefined, // null 대신 undefined
      substituteName: undefined, // string | undefined로 처리
      status: 'requested',
    } as any)

    return res.json({ message: '대타 요청 생성 완료' })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'error' })
  }
}

// 관리자 → 대타 모집 허가
export const approveRecruit = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const request = await SubRequest.findByIdAndUpdate(
      id,
      { status: 'approved_by_owner' },
      { new: true }
    )

    if (!request) return res.status(404).json({ message: '요청 없음' })

    return res.json({ message: '대타 모집 허가' })
  } catch {
    return res.status(500).json({ message: 'error' })
  }
}

// 직원 → 대타 수락
export const acceptBySub = async (req: UserRequest, res: Response) => {
  try {
    const { id } = req.params
    const substituteId = req.user?.userId

    if (!substituteId) return res.status(401).json({ message: '로그인 필요' })

    const subUser = await User.findById(substituteId)
    if (!subUser) return res.status(404).json({ message: '사용자 없음' })

    const request = await SubRequest.findByIdAndUpdate(
      id,
      {
        status: 'accepted_by_sub',
        substitute: substituteId,
        substituteName: subUser.name,
      },
      { new: true }
    )

    if (!request) return res.status(404).json({ message: '요청 없음' })

    return res.json({ message: '대타 수락 완료' })
  } catch {
    return res.status(500).json({ message: 'error' })
  }
}

// 관리자 → 최종 승인 (스케줄 교체)
export const finalApprove = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const request = await SubRequest.findById(id)
    if (!request) return res.status(404).json({ message: '요청 없음' })

    if (!request.substitute) {
      return res.status(400).json({ message: '대타 지원자가 필요합니다.' })
    }

    // 대타 사용자 정보 조회
    const subUser = await User.findById(request.substitute)
    if (!subUser) return res.status(404).json({ message: '대타 사용자 없음' })

    // 스케줄 담당자 ID & 이름 변경 (근무표 반영 핵심!)
    await Schedule.findByIdAndUpdate(request.scheduleId, {
      staff: subUser._id,
      staffName: subUser.name,
    })

    // 요청 상태 완료 처리
    request.status = 'approved_final'
    await request.save()

    return res.json({ message: '대타 최종 승인 및 근무표 반영 완료' })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'error' })
  }
}

// 점주 → 목록 조회
export const getSubListForOwner = async (req: Request, res: Response) => {
  try {
    const { mode } = req.query

    let query: any = {}
    if (mode === 'pending') {
      query = {
        status: { $in: ['requested', 'approved_by_owner', 'accepted_by_sub'] },
      }
    } else if (mode === 'approved') {
      query = { status: 'approved_final' }
    }

    const list = await SubRequest.find(query)
      .populate('scheduleId')
      .sort({ createdAt: -1 })
    return res.json(list)
  } catch {
    return res.status(500).json({ message: 'error' })
  }
}

// 직원 → 전체 대타 요청 목록 조회
export const getSubList = async (req: Request, res: Response) => {
  try {
    // 취소된 것 제외하고 모든 요청 조회 (혹은 필요한 상태만)
    const list = await SubRequest.find({ status: { $ne: 'cancelled' } })
      .populate('scheduleId') // 스케줄 정보(날짜, 시간 등) 필요
      .sort({ createdAt: -1 })

    return res.json(list)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'error' })
  }
}

// 직원 → 대타 요청 수정
export const updateSubRequest = async (req: UserRequest, res: Response) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    const userId = req.user?.userId

    const request = await SubRequest.findById(id)
    if (!request) return res.status(404).json({ message: '요청 없음' })

    if (request.requester.toString() !== userId) {
      return res.status(403).json({ message: '권한이 없습니다.' })
    }

    if (request.status !== 'requested') {
      return res
        .status(400)
        .json({ message: '이미 진행 중인 요청은 수정할 수 없습니다.' })
    }

    request.reason = reason
    await request.save()

    return res.json({ message: '수정 완료' })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'error' })
  }
}

// 직원 → 대타 요청 취소
export const cancelSubRequest = async (req: UserRequest, res: Response) => {
  try {
    const { id } = req.params
    const userId = req.user?.userId

    const request = await SubRequest.findById(id)
    if (!request) return res.status(404).json({ message: '요청 없음' })

    if (request.requester.toString() !== userId) {
      return res.status(403).json({ message: '권한이 없습니다.' })
    }

    if (request.status === 'approved_final') {
      return res
        .status(400)
        .json({ message: '이미 완료된 요청은 취소할 수 없습니다.' })
    }

    // 실제로 삭제하거나 status를 cancelled로 변경
    // 여기서는 삭제로 처리
    await SubRequest.findByIdAndDelete(id)

    return res.json({ message: '삭제 완료' })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'error' })
  }
}
