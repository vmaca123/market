// server/src/routes/scheduleRoutes.ts
import { Router } from 'express'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import isoWeek from 'dayjs/plugin/isoWeek'
import mongoose from 'mongoose'
import Schedule from '../models/Schedule'
import { auth, ownerOnly, UserRequest } from '../middleware/auth'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isoWeek)
dayjs.tz.setDefault('Asia/Seoul')

const router = Router()

// 근무시간 계산
const calcHours = (start: string, end: string) => {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const s = sh * 60 + sm
  let e = eh * 60 + em
  if (e <= s) e += 1440
  return (e - s) / 60
}

// 상태 계산
const getStatus = (dateStr: string) => {
  const nowStr = dayjs().tz().format('YYYY-MM-DD')
  if (dateStr === nowStr) return 'today'
  if (dateStr < nowStr) return 'completed'
  return 'upcoming'
}

// 📌 스케줄 추가
router.post('/add', auth, ownerOnly, async (req: UserRequest, res) => {
  try {
    const { staffId, date, startTime, endTime } = req.body
    if (!staffId || !date)
      return res.status(400).json({ message: '필수 값 누락' })

    const dateStr = dayjs(date).tz().format('YYYY-MM-DD')

    const created = await Schedule.create({
      staff: new mongoose.Types.ObjectId(staffId),
      date: dateStr,
      startTime,
      endTime,
    })

    res.json(created)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: '스케줄 추가 실패' })
  }
})

// 📌 점주: 주간 전체 스케줄 조회
router.get('/week', auth, ownerOnly, async (_req, res) => {
  try {
    const start = dayjs().tz().isoWeekday(1).format('YYYY-MM-DD')
    const end = dayjs().tz().isoWeekday(7).format('YYYY-MM-DD')

    const schedules = await Schedule.find({
      date: { $gte: start, $lte: end },
    })
      .populate('staff', 'name')
      .lean()

    const result = schedules.map((s: any) => ({
      ...s,
      staffId: s.staff?._id?.toString() ?? 'unknown',
      staffName: s.staff?.name ?? '삭제된 사용자',
      status: getStatus(s.date),
      hours: calcHours(s.startTime, s.endTime),
    }))

    res.json(result)
  } catch {
    res.status(500).json({ message: '로딩 실패' })
  }
})

// 📌 알바: 내 스케줄 조회
router.get('/my', auth, async (req: UserRequest, res) => {
  try {
    const staffId = req.user?.userId
    if (!staffId) return res.status(401).json({ message: '로그인 필요' })

    // 모든 스케줄 조회 (날짜 제한 해제)
    const schedules = await Schedule.find({
      staff: staffId,
    }).lean()

    const result = schedules.map((s: any) => ({
      ...s,
      status: getStatus(s.date),
      hours: calcHours(s.startTime, s.endTime),
    }))

    res.json(result)
  } catch {
    res.status(500).json({ message: '로딩 실패' })
  }
})

// 📌 반복 스케줄 등록
router.post('/template', auth, ownerOnly, async (req: UserRequest, res) => {
  try {
    const { staffId, startDate, endDate, days, startTime, endTime } = req.body
    const staffObjId = new mongoose.Types.ObjectId(staffId)

    let cur = dayjs(startDate).tz().startOf('day')
    const end = dayjs(endDate).tz().startOf('day')

    let created = 0

    while (cur.isSame(end) || cur.isBefore(end)) {
      if (days.includes(cur.isoWeekday())) {
        const dateStr = cur.format('YYYY-MM-DD')
        await Schedule.create({
          staff: staffObjId,
          date: dateStr,
          startTime,
          endTime,
        })
        created++
      }
      cur = cur.add(1, 'day')
    }

    res.json({ created })
  } catch {
    res.status(500).json({ message: '오류 발생' })
  }
})

// 📌 수정
router.put('/:id', auth, ownerOnly, async (req: UserRequest, res) => {
  try {
    const target = await Schedule.findById(req.params.id)
    if (!target) return res.status(404).json({ message: '없음' })

    // 📌 TS 오류 해결 완료
    const newDateStr: string =
      req.body.date != null
        ? dayjs(req.body.date).tz().format('YYYY-MM-DD')
        : (target.date as string)

    target.date = newDateStr
    target.startTime = req.body.startTime ?? target.startTime
    target.endTime = req.body.endTime ?? target.endTime

    await target.save()

    res.json(target)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: '수정 오류' })
  }
})

// 📌 삭제
router.delete('/:id', auth, ownerOnly, async (req: UserRequest, res) => {
  try {
    await Schedule.findByIdAndDelete(req.params.id)
    res.json({ message: '삭제 완료' })
  } catch {
    res.status(500).json({ message: '삭제 오류' })
  }
})

export default router
