import express from 'express'
import Order from '../models/Order'
import Product from '../models/Product'
import User from '../models/User'
import Schedule from '../models/Schedule'
import Handover from '../models/Handover'
import Announcement from '../models/Announcement'
import { authMiddleware } from '../middleware/auth'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const router = express.Router()

router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // 1. 오늘 매출 & 시간대별 차트 데이터
    const todayOrders = await Order.find({ createdAt: { $gte: todayStart } })
    const todaySalesTotal = todayOrders.reduce(
      (acc, cur) => acc + cur.totalAmount,
      0
    )

    // 시간대별 집계 (06:00 ~ 22:00)
    const salesData = Array.from({ length: 17 }, (_, i) => {
      const hour = i + 6
      const salesInHour = todayOrders
        .filter((o) => new Date(o.createdAt).getHours() === hour)
        .reduce((acc, cur) => acc + cur.totalAmount, 0)
      return { time: `${String(hour).padStart(2, '0')}:00`, sales: salesInHour }
    })

    // 2. 재고 현황 (파이 차트용)
    const products = await Product.find({})
    const totalInventoryCount = products.reduce(
      (acc, cur) => acc + cur.stock,
      0
    )

    // 재고 상태 분류
    let normal = 0,
      low = 0,
      expiring = 0
    const now = new Date()
    const threeDaysLater = new Date()
    threeDaysLater.setDate(now.getDate() + 3)

    products.forEach((p) => {
      if (p.expiryDate && new Date(p.expiryDate) <= threeDaysLater) expiring++
      else if (p.stock <= p.minStock) low++
      else normal++
    })

    const inventoryData = [
      { name: '정상', value: normal, color: 'hsl(var(--success))' },
      { name: '부족', value: low, color: 'hsl(var(--warning))' }, // 발주 대기 대상
      { name: '임박', value: expiring, color: 'hsl(var(--destructive))' },
    ]

    // 3. 근무자 현황 (오늘 스케줄 기준)
    const staffCount = await User.countDocuments({ role: 'staff' })
    
    const todayStr = dayjs().tz('Asia/Seoul').format('YYYY-MM-DD')
    const nowTime = dayjs().tz('Asia/Seoul').format('HH:mm')

    const schedules = await Schedule.find({ date: todayStr }).populate('staff', 'name')
    
    const todayStaff = schedules.map((s: any) => {
        let status = '대기'
        // HH:mm 문자열 비교 (24시간제라 가능)
        if (nowTime >= s.startTime && nowTime <= s.endTime) {
            status = '근무중'
        } else if (nowTime > s.endTime) {
            status = '퇴근'
        }

        return {
            name: s.staff?.name || '삭제된 직원',
            shift: `${s.startTime} - ${s.endTime}`,
            status: status
        }
    })

    // 근무 시작 시간 순 정렬
    todayStaff.sort((a, b) => a.shift.localeCompare(b.shift))

    // 4. 중요 알림 (중요 인수인계 & 중요 공지사항)
    // 미확인 중요 인수인계 (최신순 3개)
    const importantHandovers = await Handover.find({ 
        isImportant: true, 
        confirmed: false 
    })
    .populate('writer', 'name')
    .sort({ createdAt: -1 })
    .limit(3)

    // 중요 공지사항 (최신순 3개)
    const importantAnnouncements = await Announcement.find({ 
        important: true 
    })
    .sort({ createdAt: -1 })
    .limit(3)

    res.json({
      stats: {
        todaySales: todaySalesTotal,
        totalInventory: totalInventoryCount,
        pendingOrders: low, // 재고 부족 품목 수 = 발주 대기
        staffCount: staffCount,
      },
      salesData,
      inventoryData,
      todayStaff,
      alerts: {
        handovers: importantHandovers,
        announcements: importantAnnouncements
      }
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: '대시보드 로드 실패' })
  }
})

export default router
